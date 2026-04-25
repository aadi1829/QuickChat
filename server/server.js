import express      from "express";
import "dotenv/config";
import cors          from "cors";
import http          from "http";
import helmet        from "helmet";
import cookieParser  from "cookie-parser";
import mongoose      from "mongoose";
import { connectDB } from "./lib/db.js";
import userRouter    from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import slotRouter    from "./routes/slotRoutes.js";
import bookingRouter from "./routes/bookingRoutes.js";
import uploadRouter    from "./routes/uploadRoutes.js";
import { Server }    from "socket.io";
import jwt           from "jsonwebtoken";
import { initSlotActivator } from "./lib/slotActivator.js";
import SlotQueue     from "./models/SlotQueue.js";
import Slot          from "./models/Slot.js";
import Booking       from "./models/Booking.js";
import User          from "./models/User.js";
import Message       from "./models/Message.js";
import {
    activateNextClient,
    emitQueueUpdated,
    emitSessionExpiredIfBookingCompleted,
    emitWaitingRoomState,
    endBookingSession,
    initSessionSweeper,
    userIsSessionPartyForBooking,
    skipNextWaitingClient,
} from "./lib/sessionManager.js";

const app    = express();
const server = http.createServer(app);

// Ensure req.ip reflects the real client when behind a reverse proxy (required for rate limiting)
app.set("trust proxy", 1);

// Allowed origins — extend via ALLOWED_ORIGINS env var
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:5174"];

// ─── Socket.IO ────────────────────────────────────────────────────────────────

export const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

export const userSocketMap = new Map(); // Map<userId, Set<socketId>>
const clientNamespace = io.of("/client");
const astrologerNamespace = io.of("/astrologer");

function createNamespaceBus(...namespaces) {
    return {
        emit(event, payload) {
            namespaces.forEach((nsp) => nsp.emit(event, payload));
        },
        to(room) {
            return {
                emit(event, payload) {
                    namespaces.forEach((nsp) => nsp.to(room).emit(event, payload));
                },
            };
        },
        socketsLeave(room) {
            namespaces.forEach((nsp) => nsp.socketsLeave(room));
        },
    };
}
export const ioBus = createNamespaceBus(clientNamespace, astrologerNamespace);

function getOnlineUserIds() {
    return [...userSocketMap.keys()];
}

function broadcastOnlineUsers() {
    ioBus.emit("getOnlineUsers", getOnlineUserIds());
}

function addUserSocket(userId, socketId) {
    if (!userId) return;
    const sockets = userSocketMap.get(userId) ?? new Set();
    sockets.add(socketId);
    userSocketMap.set(userId, sockets);
}

function removeUserSocket(userId, socketId) {
    const sockets = userSocketMap.get(userId);
    if (!sockets) return 0;

    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSocketMap.delete(userId);
        return 0;
    }

    userSocketMap.set(userId, sockets);
    return sockets.size;
}

function registerSocketNamespace(nsp, expectedRole) {
    nsp.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error("Authentication error: no token"));
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select("role");
            if (!user || user.role !== expectedRole) {
                return next(new Error("Authentication error: invalid namespace role"));
            }
            socket.userId = decoded.userId;
            socket.userRole = user.role;
            next();
        } catch {
            next(new Error("Authentication error: invalid token"));
        }
    });

    nsp.on("connection", (socket) => {
        const userId = socket.userId;
    console.log("User Connected:", userId);

    addUserSocket(userId, socket.id);
        broadcastOnlineUsers();

    // Auto-join personal notification room
    socket.join(`user:${userId}`);

    // ── Room joins ────────────────────────────────────────────────────────────

    socket.on("join_slot_room", ({ slotId }) => {
        socket.join(`slot:${slotId}`);
            emitQueueUpdated(ioBus, slotId, socket.id).catch(() => {});
    });

    async function getBookingPartyIds(bookingId) {
        if (!bookingId || !mongoose.Types.ObjectId.isValid(String(bookingId))) return null;
        const booking = await Booking.findById(bookingId).select("_id queueEntryId status sessionEndTime");
        if (!booking) return null;

        const entry = await SlotQueue.findById(booking.queueEntryId).select("clientId slotId");
        if (!entry) return null;

        const slot = await Slot.findById(entry.slotId).select("astrologerId");
        if (!slot) return null;

        return {
            booking,
            clientId: String(entry.clientId),
            astrologerId: String(slot.astrologerId),
        };
    }

    function normalizeMessage(doc, extra = {}) {
        const m = doc?.toObject ? doc.toObject() : doc;
        if (!m) return null;
        return {
            ...m,
            _id: String(m._id),
            senderId: String(m.senderId),
            receiverId: String(m.receiverId),
            ...extra,
        };
    }

    // Back-compat + new sync: allow lastMessageId to fetch missed messages on join.
    socket.on("join_session_room", async ({ bookingId, lastMessageId } = {}) => {
        if (!bookingId) return;
        socket.join(`session:${bookingId}`);

        try {
            await emitSessionExpiredIfBookingCompleted(socket, userId, bookingId);

            const party = await getBookingPartyIds(bookingId);
            if (!party) return;

            const uid = String(userId);
            if (uid !== party.clientId && uid !== party.astrologerId) return;

            if (!lastMessageId || !mongoose.Types.ObjectId.isValid(String(lastMessageId))) return;

            const otherId = uid === party.clientId ? party.astrologerId : party.clientId;
            const conversation = {
                $or: [
                    { senderId: uid, receiverId: otherId },
                    { senderId: otherId, receiverId: uid },
                ],
            };

            const missed = await Message.find({
                ...conversation,
                _id: { $gt: new mongoose.Types.ObjectId(String(lastMessageId)) },
            })
                .sort({ _id: 1 })
                .limit(200);

            if (missed.length > 0) {
                socket.emit("missed_messages", {
                    bookingId: String(party.booking._id),
                    messages: missed.map((m) => normalizeMessage(m)).filter(Boolean),
                });
            }
        } catch (err) {
            console.error("[socket join_session_room sync] %s", err.message);
        }
    });

    // Real-time messaging in the session room (bookingId === sessionId)
    socket.on("send_message", async ({ sessionId, receiverId, text, image } = {}, ack) => {
        try {
            if (!sessionId || !receiverId) {
                if (typeof ack === "function") ack({ ok: false, message: "Missing sessionId/receiverId." });
                return;
            }

            const party = await getBookingPartyIds(sessionId);
            if (!party) {
                if (typeof ack === "function") ack({ ok: false, message: "Session not found." });
                return;
            }

            const uid = String(userId);
            if (uid !== party.clientId && uid !== party.astrologerId) {
                if (typeof ack === "function") ack({ ok: false, message: "Not authorized for this session." });
                return;
            }

            // Enforce active session
            const remaining = Math.ceil((new Date(party.booking.sessionEndTime).getTime() - Date.now()) / 1000);
            if (party.booking.status !== "active" || remaining <= 0) {
                if (typeof ack === "function") ack({ ok: false, message: "Session expired." });
                return;
            }

            const safeText = typeof text === "string" ? text.trim() : "";
            const safeImage = typeof image === "string" ? image : null;
            if (!safeText && !safeImage) {
                if (typeof ack === "function") ack({ ok: false, message: "Message must contain text or an image." });
                return;
            }

            // Only allow sending to the other party in this booking
            const otherId = uid === party.clientId ? party.astrologerId : party.clientId;
            if (String(receiverId) !== String(otherId)) {
                if (typeof ack === "function") ack({ ok: false, message: "Invalid receiver for this session." });
                return;
            }

            const sender = await User.findById(uid).select("fullName");

            const newMessage = await Message.create({
                senderId: uid,
                receiverId: otherId,
                text: safeText || undefined,
                image: safeImage || undefined,
            });

            const payload = normalizeMessage(newMessage, { senderName: sender?.fullName ?? null });

            // Primary: session room (requirement)
            ioBus.to(`session:${String(party.booking._id)}`).emit("receive_message", payload);
            // Also keep the existing personal-room notifications working
            ioBus.to(`user:${otherId}`).emit("newMessage", payload);

            if (typeof ack === "function") ack({ ok: true, message: payload });
        } catch (err) {
            console.error("[socket send_message] %s", err.message, { stack: err.stack });
            if (typeof ack === "function") ack({ ok: false, message: "Failed to send message." });
        }
    });

    socket.on("join_waiting_room", async ({ queueEntryId }) => {
        try {
            const entry = await SlotQueue.findOne({
                _id: queueEntryId,
                clientId: userId,
            });

            if (!entry) {
                socket.emit("waiting_room_error", { message: "Booking not found." });
                return;
            }

            if (entry.reconnectDeadline) {
                entry.reconnectDeadline = null;
                await entry.save();
            }

            socket.join(`slot:${entry.slotId.toString()}`);
                await emitWaitingRoomState(ioBus, entry, socket.id);
                await emitQueueUpdated(ioBus, entry.slotId.toString());
        } catch (err) {
            console.error("[socket join_waiting_room] %s", err.message);
            socket.emit("waiting_room_error", { message: "Failed to restore waiting room." });
        }
    });

    socket.on("astrologer_fetch_client", async ({ slotId }) => {
        try {
            const slot = await Slot.findById(slotId);
            if (!slot) {
                socket.emit("astrologer_fetch_result", { success: false, message: "Slot not found." });
                return;
            }

            if (slot.astrologerId.toString() !== userId) {
                socket.emit("astrologer_fetch_result", { success: false, message: "Access denied." });
                return;
            }

                const result = await activateNextClient(ioBus, slotId);
            socket.emit("astrologer_fetch_result", result);
        } catch (err) {
            console.error("[socket astrologer_fetch_client] %s", err.message);
            socket.emit("astrologer_fetch_result", { success: false, message: "Failed to fetch next client." });
        }
    });

    socket.on("astrologer_skip_next", async ({ slotId }) => {
        try {
            const slot = await Slot.findById(slotId);
            if (!slot) {
                socket.emit("astrologer_skip_result", { success: false, message: "Slot not found." });
                return;
            }

            if (slot.astrologerId.toString() !== userId) {
                socket.emit("astrologer_skip_result", { success: false, message: "Access denied." });
                return;
            }

                const result = await skipNextWaitingClient(ioBus, slotId);
            socket.emit("astrologer_skip_result", result);
        } catch (err) {
            console.error("[socket astrologer_skip_next] %s", err.message);
            socket.emit("astrologer_skip_result", { success: false, message: "Failed to skip next client." });
        }
    });

    // Reconnect — client rejoins after a disconnect; clears their grace deadline
    socket.on("rejoin", async ({ queueEntryId, bookingId }) => {
        try {
            if (queueEntryId) {
                const entry = await SlotQueue.findById(queueEntryId);
                if (entry && entry.reconnectDeadline) {
                    entry.reconnectDeadline = null;
                    await entry.save();
                }
            }

            // Prefer booking room (authoritative in Phase 4)
            if (bookingId) {
                socket.join(`session:${bookingId}`);
                await emitSessionExpiredIfBookingCompleted(socket, userId, bookingId);
                return;
            }

            // Back-compat: if we only have queueEntryId, map to booking (active or completed)
            if (queueEntryId) {
                const booking = await Booking.findOne({ queueEntryId }).select("_id status");
                if (booking && (await userIsSessionPartyForBooking(userId, booking._id.toString()))) {
                    socket.join(`session:${booking._id.toString()}`);
                    if (booking.status === "completed") {
                        await emitSessionExpiredIfBookingCompleted(socket, userId, booking._id.toString());
                    }
                }
            }
        } catch (err) {
            console.error("[socket rejoin] %s", err.message);
        }
    });

    // ── Voluntary leave (user clicked "Leave Session") ────────────────────────

    socket.on("leave_session", async ({ bookingId } = {}) => {
        if (!bookingId) return;
        try {
            if (!(await userIsSessionPartyForBooking(userId, bookingId))) {
                return; // silently ignore unauthorized requests
            }
            const booking = await Booking.findOne({ _id: bookingId, status: "active" })
                .select("_id queueEntryId sessionEndTime");
            if (!booking) return; // already ended — nothing to do
            await endBookingSession(ioBus, booking, "abandoned");
        } catch (err) {
            console.error("[socket leave_session] %s", err.message);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────

    socket.on("disconnect", async () => {
        console.log("User Disconnected:", userId);
        const remainingSocketCount = removeUserSocket(userId, socket.id);
            broadcastOnlineUsers();

        if (remainingSocketCount > 0) return;

        try {
            // If they were mid-session (active), just notify astrologer — timer keeps running
            const activeEntry = await SlotQueue.findOne({ clientId: userId, status: "active" });
            if (activeEntry) {
                const booking = await Booking.findOne({ queueEntryId: activeEntry._id, status: "active" }).select("_id");
                if (booking) {
                    ioBus.to(`session:${booking._id.toString()}`).emit("client_disconnected", {
                        message: "Client disconnected.",
                    });
                }
            }

            // If they were waiting, give them a 2-minute grace window to reconnect
            const waitingEntry = await SlotQueue.findOne({
                clientId:          userId,
                status:            "waiting",
                reconnectDeadline: null,
            });

            if (waitingEntry) {
                const deadline = new Date(Date.now() + 2 * 60 * 1000);
                await SlotQueue.findByIdAndUpdate(waitingEntry._id, { reconnectDeadline: deadline });
                // Expiry is enforced by `sweepReconnectDeadlines` (30s cron in slotActivator) so restarts cannot lose the timer.
            }
        } catch (err) {
            console.error("[socket disconnect handler] %s", err.message);
        }
    });
    });
}

registerSocketNamespace(clientNamespace, "client");
registerSocketNamespace(astrologerNamespace, "astrologer");

// ─── Express Middleware ───────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "4mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth",     userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/slots",    slotRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/upload",   uploadRouter);

// 404 handler for unknown API routes
app.use("/api/*splat", (req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
    const status = err.status || 500;
    console.error("[GlobalErrorHandler] %s %s | status=%d | %s", req.method, req.originalUrl, status, err.message, { stack: err.stack });
    res.status(status).json({
        success: false,
        message: status >= 500 ? "An unexpected error occurred. Please try again later." : err.message,
    });
});

// ─── Process Safety ───────────────────────────────────────────────────────────

process.on("unhandledRejection", (reason) => {
    console.error("[UnhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
    console.error("[UncaughtException]", error.message, { stack: error.stack });
    process.exit(1);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

await connectDB();

// Start cron jobs for slot lifecycle management
if (process.env.NODE_ENV !== "test") {
    initSlotActivator(ioBus);
    initSessionSweeper(ioBus);
}

if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log("Server is running on PORT: " + PORT));
}

export default server;
