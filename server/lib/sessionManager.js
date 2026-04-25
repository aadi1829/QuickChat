/**
 * sessionManager.js
 *
 * Owns the authoritative 180-second server-side timer and the queue-advancement
 * logic.  No circular imports — everything lives in one file.
 *
 * activeTimers: Map<queueEntryId (string), { intervalId, remaining }>
 * Callers can read `.remaining` to hydrate a reconnecting client.
 */

import mongoose    from "mongoose";
import Slot        from "../models/Slot.js";
import SlotQueue   from "../models/SlotQueue.js";
import Booking     from "../models/Booking.js";
import FreeChatUsage from "../models/FreeChatUsage.js";
import User        from "../models/User.js";

const QUEUE_ENTRY_STALE = "QUEUE_ENTRY_STALE";

let loggedTxnFallback = false;

function isTransactionNotSupportedError(err) {
    const m = String(err?.message || "");
    if (/Transaction numbers are only allowed on a replica set member/i.test(m)) return true;
    if (/Transactions are not supported/i.test(m)) return true;
    if (err?.code === 20 && /transaction/i.test(m)) return true;
    return false;
}

/**
 * Same logical writes as the transaction path, for MongoDB standalone (no multi-doc transactions).
 * Compensates on failure so FreeChatUsage is not left without a matching booking.
 */
async function persistClientActivationLegacy(next, astroId, sessionEndTime) {
    const usage = await FreeChatUsage.create({ clientId: next.clientId, astrologerId: astroId });
    try {
        const claimed = await SlotQueue.findOneAndUpdate(
            { _id: next._id, status: "waiting" },
            { $set: { status: "active", reconnectDeadline: null } },
            { new: true }
        );
        if (!claimed) {
            await FreeChatUsage.deleteOne({ _id: usage._id });
            const e = new Error("Queue entry changed");
            e.code = QUEUE_ENTRY_STALE;
            throw e;
        }
        return await Booking.create({ queueEntryId: next._id, sessionEndTime });
    } catch (err) {
        await FreeChatUsage.deleteOne({ _id: usage._id }).catch(() => {});
        await SlotQueue.findByIdAndUpdate(next._id, { status: "waiting", reconnectDeadline: null }).catch(() => {});
        throw err;
    }
}

/**
 * Claim queue row, record free-tier usage, and create booking in one transaction when supported.
 */
async function persistClientActivation(next, slot, sessionEndTime) {
    const astroId = slot.astrologerId?._id ?? slot.astrologerId;
    const session = await mongoose.startSession();
    try {
        let bookingDoc;
        await session.withTransaction(async () => {
            const claimed = await SlotQueue.findOneAndUpdate(
                { _id: next._id, status: "waiting" },
                { $set: { status: "active", reconnectDeadline: null } },
                { session, new: true }
            );
            if (!claimed) {
                const e = new Error("Queue entry changed");
                e.code = QUEUE_ENTRY_STALE;
                throw e;
            }
            await FreeChatUsage.create(
                [{ clientId: next.clientId, astrologerId: astroId }],
                { session }
            );
            const inserted = await Booking.create(
                [{ queueEntryId: next._id, sessionEndTime }],
                { session }
            );
            bookingDoc = Array.isArray(inserted) ? inserted[0] : inserted;
        });
        return bookingDoc;
    } catch (err) {
        if (err?.code === QUEUE_ENTRY_STALE) throw err;
        if (isTransactionNotSupportedError(err)) {
            if (!loggedTxnFallback) {
                loggedTxnFallback = true;
                console.warn(
                    "[persistClientActivation] Multi-document transactions unavailable; using legacy path with rollback. " +
                        "Use a replica set MongoDB URI in production for atomic activation.",
                    err.message
                );
            }
            return persistClientActivationLegacy(next, astroId, sessionEndTime);
        }
        throw err;
    } finally {
        await session.endSession();
    }
}

const SESSION_SECONDS = 180;

function computeRemainingSeconds(sessionEndTime) {
    if (!sessionEndTime) return null;
    const remaining = Math.ceil((new Date(sessionEndTime).getTime() - Date.now()) / 1000);
    return Math.max(0, remaining);
}

export async function emitQueueUpdated(io, slotId, socketId = null) {
    const remaining = await SlotQueue
        .find({ slotId, status: "waiting" })
        .sort({ createdAt: 1 })
        .select("_id");

    const queueSnapshotAt = Date.now();
    const payload = {
        slotId: slotId.toString(),
        queueSnapshotAt,
        positions: remaining.map((e, idx) => ({
            queueEntryId: e._id.toString(),
            position: idx + 1,
        })),
    };

    const target = socketId ? io.to(socketId) : io.to(`slot:${slotId}`);
    target.emit("queue_updated", payload);
}

async function buildWaitingRoomState(io, queueEntry) {
    const slot = queueEntry.slotId?._id
        ? queueEntry.slotId
        : await Slot.findById(queueEntry.slotId).populate("astrologerId", "fullName profilePic bio avgSessionSeconds isPaidUser");

    if (!slot) return null;

    const state = {
        status:       queueEntry.status,
        queueEntryId: queueEntry._id.toString(),
        slotId:       slot._id.toString(),
        position:     null,
        bookingId:    null,
        remainingSeconds: null,
        astrologer:   slot.astrologerId?._id ? slot.astrologerId : null,
        avgSessionSeconds: slot.astrologerId?.avgSessionSeconds ?? 180,
    };

    if (queueEntry.status === "waiting") {
        const ahead = await SlotQueue.countDocuments({
            slotId:     queueEntry.slotId?._id ?? queueEntry.slotId,
            status:     "waiting",
            createdAt:  { $lt: queueEntry.createdAt },
        });
        state.position = ahead + 1;
    }

    if (queueEntry.status === "active") {
        const booking = await Booking.findOne({ queueEntryId: queueEntry._id, status: "active" });

        state.bookingId = booking?._id?.toString() ?? null;
        state.remainingSeconds = booking?.sessionEndTime ? computeRemainingSeconds(booking.sessionEndTime) : null;
    }

    return state;
}

export async function emitWaitingRoomState(io, queueEntry, socketId = null) {
    const entry = queueEntry?._id
        ? queueEntry
        : await SlotQueue.findById(queueEntry).populate({
            path: "slotId",
            populate: { path: "astrologerId", select: "fullName profilePic bio avgSessionSeconds isPaidUser" },
        });

    if (!entry) return;

    const payload = await buildWaitingRoomState(io, entry);
    if (!payload) return;

    const target = socketId ? io.to(socketId) : io.to(`user:${entry.clientId.toString()}`);
    target.emit("waiting_room_state", payload);
}

// ─── Advance Queue ────────────────────────────────────────────────────────────

/**
 * Activate the next waiting client in a slot.
 * This is astrologer-driven: called when astrologer explicitly fetches next client.
 */
export async function activateNextClient(io, slotId) {
    try {
        const slot = await Slot.findById(slotId).populate("astrologerId", "fullName profilePic bio");
        if (!slot || slot.status !== "active") {
            return { success: false, message: "Slot is not active." };
        }

        const existingActive = await SlotQueue.findOne({ slotId, status: "active" });
        if (existingActive) {
            return { success: false, message: "A client session is already active for this slot." };
        }

        const now = new Date();

        // Auto-skip clients who were disconnected and missed their grace window
        await SlotQueue.updateMany(
            { slotId, status: "waiting", reconnectDeadline: { $lte: now, $ne: null } },
            { status: "skipped" }
        );

        while (true) {
            const next = await SlotQueue.findOne({ slotId, status: "waiting" })
                .sort({ createdAt: 1 })
                .populate({
                    path: "slotId",
                    populate: { path: "astrologerId", select: "fullName profilePic bio" },
                });

            if (!next) {
                await broadcastQueueUpdate(io, slotId);
                return { success: false, message: "No waiting clients in queue." };
            }

            // Mark free tier usage immediately at fetch-time to block re-use exploits.
            const usageExists = await FreeChatUsage.findOne({
                clientId: next.clientId,
                astrologerId: slot.astrologerId,
            });

            if (usageExists) {
                await SlotQueue.findByIdAndUpdate(next._id, { status: "cancelled", reconnectDeadline: null });
                io.to(`user:${next.clientId.toString()}`).emit("booking_cancelled", {
                    slotId: slotId.toString(),
                    reason: "Free consultation already consumed for this astrologer.",
                });
                await emitWaitingRoomState(io, next._id);
                await broadcastQueueUpdate(io, slotId);
                continue;
            }

            const sessionEndTime = new Date(Date.now() + SESSION_SECONDS * 1000);
            let booking;
            try {
                booking = await persistClientActivation(next, slot, sessionEndTime);
            } catch (err) {
                if (err?.code === QUEUE_ENTRY_STALE) {
                    await broadcastQueueUpdate(io, slotId);
                    continue;
                }
                throw err;
            }

            // Fetch client user details to include in astrologer notification
            const clientUser = await User.findById(next.clientId).select("-password");

            // Notify the astrologer: new active client
            io.to(`user:${slot.astrologerId.toString()}`).emit("client_activated", {
                client:       clientUser,
                queueEntryId: next._id.toString(),
                bookingId:    booking._id.toString(),
                slotId:       slotId.toString(),
            });

            // Notify fetched client only (all sockets in personal room)
            io.to(`user:${next.clientId.toString()}`).emit("your_turn", {
                slotId:           slotId.toString(),
                queueEntryId:     next._id.toString(),
                bookingId:        booking._id.toString(),
                remainingSeconds: computeRemainingSeconds(booking.sessionEndTime),
                astrologer:       slot.astrologerId?._id ? slot.astrologerId : null,
            });

            // Emit session_started to the booking session room (both sides should have joined by now)
            io.to(`session:${booking._id.toString()}`).emit("session_started", {
                bookingId:  booking._id.toString(),
                startedAt:  booking.chatStartedAt,
                sessionEndTime: booking.sessionEndTime,
            });

            // Broadcast updated waiting positions
            await broadcastQueueUpdate(io, slotId);
            return {
                success: true,
                slotId: slotId.toString(),
                queueEntryId: next._id.toString(),
                bookingId: booking._id.toString(),
            };
        }
    } catch (err) {
        console.error("[activateNextClient] slotId=%s | %s", slotId, err.message, { stack: err.stack });
        return { success: false, message: "Failed to fetch next client." };
    }
}

/**
 * Astrologer action: skip the NEXT UP waiting client (FIFO head) without cancelling the whole queue.
 */
export async function skipNextWaitingClient(io, slotId, reason = "Astrologer skipped") {
    try {
        const next = await SlotQueue.findOne({ slotId, status: "waiting" }).sort({ createdAt: 1 });
        if (!next) return { success: false, message: "No waiting clients to skip." };

        await SlotQueue.findByIdAndUpdate(next._id, { status: "skipped", reconnectDeadline: null });
        await emitWaitingRoomState(io, next._id);
        await broadcastQueueUpdate(io, slotId);

        io.to(`user:${next.clientId.toString()}`).emit("booking_cancelled", {
            slotId: slotId.toString(),
            reason,
        });

        return { success: true, slotId: slotId.toString(), queueEntryId: next._id.toString() };
    } catch (err) {
        console.error("[skipNextWaitingClient] slotId=%s | %s", slotId, err.message, { stack: err.stack });
        return { success: false, message: "Failed to skip next client." };
    }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

export async function endBookingSession(io, booking, reason = "timer") {
    const bookingId = booking._id.toString();
    const queueEntryId = booking.queueEntryId?.toString?.() ?? booking.queueEntryId;

    const endedAt = new Date();
    await Booking.findByIdAndUpdate(bookingId, {
        chatEndedAt: endedAt,
        status: "completed",
    });

    if (queueEntryId) {
        const entry = await SlotQueue.findByIdAndUpdate(
            queueEntryId,
            { status: "completed" },
            { new: true }
        );
        const slotId = entry?.slotId?.toString?.() ?? entry?.slotId;

        // Update astrologer's rolling session-duration average (for wait estimates)
        try {
            if (slotId) {
                const slot = await Slot.findById(slotId).select("astrologerId");
                if (slot?.astrologerId) {
                    const bookingDoc = await Booking.findById(bookingId).select("chatStartedAt");
                    const startedAt = bookingDoc?.chatStartedAt ? new Date(bookingDoc.chatStartedAt) : null;
                    if (startedAt) {
                        const durationSecs = Math.max(30, Math.min(180, Math.round((endedAt - startedAt) / 1000)));
                        const astro = await User.findById(slot.astrologerId).select("avgSessionSeconds sessionSamples");
                        if (astro) {
                            const samples = Number(astro.sessionSamples || 0);
                            const prevAvg = Number(astro.avgSessionSeconds || 180);
                            const nextAvg = (prevAvg * samples + durationSecs) / (samples + 1);
                            astro.avgSessionSeconds = Math.round(nextAvg);
                            astro.sessionSamples = samples + 1;
                            await astro.save();
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[endBookingSession] avgSessionSeconds update | %s", err.message);
        }

        // Phase 5: emit session_expired then forcefully evict all sockets from the
        // session room so no messages can be sent after the timer fires.
        io.to(`session:${bookingId}`).emit("session_expired", { bookingId, reason });
        io.socketsLeave(`session:${bookingId}`);

        if (slotId) await broadcastQueueUpdate(io, slotId);
        return;
    }

    // Fallback (no queue entry linked — unlikely but safe)
    io.to(`session:${bookingId}`).emit("session_expired", { bookingId, reason });
    io.socketsLeave(`session:${bookingId}`);
}

async function userIsBookingParty(userId, booking) {
    const entry = await SlotQueue.findById(booking.queueEntryId).select("clientId slotId");
    if (!entry) return false;
    const slot = await Slot.findById(entry.slotId).select("astrologerId");
    if (!slot) return false;
    const uid = String(userId);
    return String(entry.clientId) === uid || String(slot.astrologerId) === uid;
}

/**
 * After a server restart, session rooms are empty so `session_expired` may have
 * been "missed". When an authorized socket (re)joins a session room, tell it
 * directly if the booking is already completed in the database.
 */
export async function emitSessionExpiredIfBookingCompleted(socket, userId, bookingId) {
    if (!bookingId || !mongoose.Types.ObjectId.isValid(String(bookingId))) return;

    const booking = await Booking.findById(bookingId).select("status queueEntryId");
    if (!booking || booking.status !== "completed") return;

    if (!(await userIsBookingParty(userId, booking))) return;

    socket.emit("session_expired", { bookingId: booking._id.toString(), reason: "timer" });
}

/** True if this user is the client or astrologer for the booking (any status). */
export async function userIsSessionPartyForBooking(userId, bookingId) {
    if (!bookingId || !mongoose.Types.ObjectId.isValid(String(bookingId))) return false;
    const booking = await Booking.findById(bookingId).select("queueEntryId");
    if (!booking) return false;
    return userIsBookingParty(userId, booking);
}

export function initSessionSweeper(io) {
    // 1) Close expired sessions every 5 seconds (restart-safe)
    setInterval(async () => {
        try {
            const now = new Date();
            const expired = await Booking.find({
                status: "active",
                sessionEndTime: { $lte: now },
            }).select("_id queueEntryId sessionEndTime");

            for (const b of expired) {
                await endBookingSession(io, b, "timer");
            }
        } catch (err) {
            console.error("[sessionSweeper] %s", err.message);
        }
    }, 5000);

    // 2) Emit authoritative sync ticks every 10 seconds
    setInterval(async () => {
        try {
            const active = await Booking.find({ status: "active" })
                .select("_id sessionEndTime");

            for (const b of active) {
                io.to(`session:${b._id.toString()}`).emit("timer_tick", {
                    bookingId: b._id.toString(),
                    remainingSeconds: computeRemainingSeconds(b.sessionEndTime),
                    sessionEndTime: b.sessionEndTime,
                });
            }
        } catch (err) {
            console.error("[timerTick] %s", err.message);
        }
    }, 10000);
}

// ─── End Session ──────────────────────────────────────────────────────────────

// endSession removed: endBookingSession + sweeper is authoritative now

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Skip waiting clients whose reconnect grace window expired (DB-driven; survives process restarts).
 */
export async function sweepReconnectDeadlines(io) {
    const now = new Date();
    const expired = await SlotQueue.find({
        status:            "waiting",
        reconnectDeadline: { $ne: null, $lte: now },
    }).select("_id slotId");

    for (const entry of expired) {
        await SlotQueue.findByIdAndUpdate(entry._id, { status: "skipped", reconnectDeadline: null });
        const sid = entry.slotId?.toString?.() ?? entry.slotId;
        if (sid) await broadcastQueueUpdate(io, sid);
    }
}

export async function broadcastQueueUpdate(io, slotId, queueSnapshotAt = Date.now()) {
    const remaining = await SlotQueue
        .find({ slotId, status: "waiting" })
        .sort({ createdAt: 1 })
        .select("_id clientId");

    io.to(`slot:${slotId}`).emit("queue_updated", {
        slotId: slotId.toString(),
        queueSnapshotAt,
        positions: remaining.map((e, idx) => ({
            queueEntryId: e._id.toString(),
            position: idx + 1,
        })),
    });

    remaining.forEach((entry, idx) => {
        io.to(`user:${entry.clientId.toString()}`).emit("waiting_room_state", {
            status:       "waiting",
            queueEntryId: entry._id.toString(),
            slotId:       slotId.toString(),
            position:     idx + 1,
            bookingId:    null,
            remainingSeconds: null,
            astrologer:   null,
        });
    });
}

/**
 * Force-cancel all waiting entries in a slot and notify each client.
 */
export async function cancelRemainingQueue(io, slotId) {
    const waiting = await SlotQueue.find({ slotId, status: "waiting" });
    for (const entry of waiting) {
        entry.status = "cancelled";
        await entry.save();
        await emitWaitingRoomState(io, entry);
        io.to(`user:${entry.clientId.toString()}`).emit("booking_cancelled", {
            slotId: slotId.toString(),
            reason: "Astrologer cancelled the remaining queue.",
        });
    }
    await broadcastQueueUpdate(io, slotId);
}
