import Slot            from "../models/Slot.js";
import SlotQueue       from "../models/SlotQueue.js";
import Booking         from "../models/Booking.js";
import FreeChatUsage   from "../models/FreeChatUsage.js";
import {
    activateNextClient,
    broadcastQueueUpdate,
    cancelRemainingQueue,
} from "../lib/sessionManager.js";
import { ioBus }       from "../server.js";

async function hasOverlappingSlot({ astrologerId, startAt, endAt, excludeSlotId }) {
    const q = {
        astrologerId,
        startAt: { $lt: endAt },
        endAt: { $gt: startAt },
    };
    if (excludeSlotId) q._id = { $ne: excludeSlotId };
    return !!(await Slot.exists(q));
}

// ─── POST /api/slots  (astrologer only) ───────────────────────────────────────
export const createSlot = async (req, res) => {
    try {
        const { startAt, endAt, maxClients } = req.body;

        if (!startAt || !endAt) {
            return res.status(400).json({ success: false, message: "startAt and endAt are required." });
        }
        if (new Date(startAt) >= new Date(endAt)) {
            return res.status(400).json({ success: false, message: "endAt must be after startAt." });
        }

        const start = new Date(startAt);
        const end = new Date(endAt);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid startAt or endAt." });
        }

        const overlaps = await hasOverlappingSlot({
            astrologerId: req.user._id,
            startAt: start,
            endAt: end,
        });
        if (overlaps) {
            return res.status(409).json({
                success: false,
                message: "This slot overlaps with an existing slot. Please choose a different time window.",
                code: "SLOT_OVERLAP",
            });
        }

        const slot = await Slot.create({
            astrologerId: req.user._id,
            startAt:      start,
            endAt:        end,
            maxClients:   maxClients || 10,
        });

        res.status(201).json({ success: true, slot });
    } catch (err) {
        console.error("[createSlot] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to create slot." });
    }
};

// ─── GET /api/slots  (clients browse; astrologers see own slots) ──────────────
export const getSlots = async (req, res) => {
    try {
        const { astrologerId } = req.query;
        const filter = {};

        if (req.user.role === "client") {
            // Clients see open/active slots, optionally filtered by astrologer
            filter.status = { $in: ["open", "active"] };
            if (astrologerId) filter.astrologerId = astrologerId;
        } else {
            // Astrologers see all their own slots
            filter.astrologerId = req.user._id;
        }

        const slots = await Slot.find(filter)
            .populate("astrologerId", "fullName profilePic bio")
            .sort({ startAt: 1 });

        const slotIds = slots.map((s) => s._id);
        const countRows =
            slotIds.length === 0
                ? []
                : await SlotQueue.aggregate([
                      {
                          $match: {
                              slotId: { $in: slotIds },
                              status: { $in: ["waiting", "active"] },
                          },
                      },
                      { $group: { _id: "$slotId", queueCount: { $sum: 1 } } },
                  ]);
        const queueCountBySlotId = new Map(countRows.map((r) => [String(r._id), r.queueCount]));

        const result = slots.map((slot) => ({
            ...slot.toObject(),
            queueCount: queueCountBySlotId.get(String(slot._id)) ?? 0,
        }));

        res.json({ success: true, slots: result });
    } catch (err) {
        console.error("[getSlots] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch slots." });
    }
};

// ─── GET /api/slots/:id/queue  (astrologer views their queue) ────────────────
export const getQueue = async (req, res) => {
    try {
        const slot = await Slot.findById(req.params.id);
        if (!slot) return res.status(404).json({ success: false, message: "Slot not found." });
        if (!slot.astrologerId.equals(req.user._id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        const queue = await SlotQueue.find({ slotId: slot._id })
            .populate("clientId", "fullName profilePic bio")
            .sort({ createdAt: 1 });

        // Batch-load Bookings for completed entries to compute real session duration
        const completedIds = queue.filter((e) => e.status === "completed").map((e) => e._id);
        const bookings = completedIds.length
            ? await Booking.find({ queueEntryId: { $in: completedIds } })
                .select("queueEntryId chatStartedAt chatEndedAt")
                .lean()
            : [];
        const bookingByEntry = new Map(bookings.map((b) => [String(b.queueEntryId), b]));

        const enriched = queue.map((entry) => {
            const obj = entry.toObject();
            const b   = bookingByEntry.get(String(entry._id));
            if (b?.chatStartedAt && b?.chatEndedAt) {
                obj.sessionDurationSecs = Math.max(
                    0,
                    Math.round((new Date(b.chatEndedAt) - new Date(b.chatStartedAt)) / 1000)
                );
            }
            return obj;
        });

        const queueSnapshotAt = Date.now();

        // Emit unified queue snapshot on fetch (keeps socket state consistent)
        await broadcastQueueUpdate(ioBus, slot._id, queueSnapshotAt);

        res.json({ success: true, queue: enriched, queueSnapshotAt });
    } catch (err) {
        console.error("[getQueue] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch queue." });
    }
};

// ─── GET /api/slots/current/active-waiting-queue  (astrologer dashboard) ─────
export const getCurrentActiveWaitingQueue = async (req, res) => {
    try {
        const now = new Date();
        const slot = await Slot.findOne({
            astrologerId: req.user._id,
            status: "active",
            startAt: { $lte: now },
            endAt: { $gt: now },
        }).sort({ startAt: -1 });

        if (!slot) {
            return res.status(404).json({ success: false, message: "No active slot found." });
        }

        const waitingQueue = await SlotQueue.find({ slotId: slot._id, status: "waiting" })
            .populate("clientId", "fullName profilePic bio")
            .sort({ createdAt: 1 });

        await broadcastQueueUpdate(ioBus, slot._id);

        res.json({
            success: true,
            slotId: slot._id.toString(),
            queue: waitingQueue.map((entry, idx) => ({
                ...entry.toObject(),
                position: idx + 1,
            })),
        });
    } catch (err) {
        console.error("[getCurrentActiveWaitingQueue] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch active waiting queue." });
    }
};

// ─── GET /api/slots/astrologer/slots-with-clients  (astrologer dashboard) ─────
export const getAstrologerSlotsWithClients = async (req, res) => {
    try {
        const slots = await Slot.find({
            astrologerId: req.user._id,
            status: { $in: ["open", "active"] },
        })
            .select("_id startAt endAt status")
            .sort({ startAt: 1 })
            .lean();

        if (slots.length === 0) {
            return res.json({ success: true, slots: [] });
        }

        const slotIds = slots.map((s) => s._id);

        const queueRows = await SlotQueue.find({
            slotId: { $in: slotIds },
            status: { $in: ["waiting", "active"] },
        })
            .populate("clientId", "fullName profilePic bio")
            .select("slotId clientId")
            .lean();

        const clientsBySlotId = new Map();
        for (const row of queueRows) {
            const sid = String(row.slotId);
            if (!clientsBySlotId.has(sid)) clientsBySlotId.set(sid, []);
            const client = row.clientId;
            if (client) clientsBySlotId.get(sid).push(client);
        }

        // De-duplicate clients per slot (in case of weird data / retries)
        const result = slots.map((s) => {
            const clients = clientsBySlotId.get(String(s._id)) ?? [];
            const uniq = new Map(clients.map((c) => [String(c._id), c]));
            return {
                slotId: String(s._id),
                time: s.startAt, // frontend can format (10:00, 10:15, etc.)
                startAt: s.startAt,
                endAt: s.endAt,
                status: s.status,
                clients: Array.from(uniq.values()),
            };
        });

        res.json({ success: true, slots: result });
    } catch (err) {
        console.error("[getAstrologerSlotsWithClients] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch slot clients." });
    }
};

// ─── POST /api/slots/:id/book  (client books into a slot) ────────────────────
export const bookSlot = async (req, res) => {
    try {
        const slotId   = req.params.id;
        const clientId = req.user._id;

        const slot = await Slot.findById(slotId);
        if (!slot || !["open", "active"].includes(slot.status)) {
            return res.status(404).json({ success: false, message: "Slot not available." });
        }

        // Check if client already has an active or waiting entry in another slot
        const existingEntry = await SlotQueue.findOne({
            clientId,
            status: { $in: ["waiting", "active"] },
        });
        if (existingEntry) {
            return res.status(409).json({ success: false, message: "You already have an active or pending booking in another slot." });
        }

        // Free-chat eligibility check
        const used = await FreeChatUsage.findOne({ clientId, astrologerId: slot.astrologerId });
        if (used) {
            return res.status(403).json({ success: false, message: "You have already used your free chat with this astrologer." });
        }

        // Capacity check (best-effort before insert; unique { slotId, clientId } prevents double-book same client)
        const count = await SlotQueue.countDocuments({ slotId, status: { $in: ["waiting", "active"] } });
        if (count >= slot.maxClients) {
            return res.status(409).json({ success: false, message: "This slot is full." });
        }

        // Atomic insert-if-absent for this client+slot (avoids findOne + create race on double-submit)
        const insertRes = await SlotQueue.updateOne(
            { slotId, clientId },
            { $setOnInsert: { slotId, clientId, status: "waiting" } },
            { upsert: true }
        );

        const didInsert =
            (typeof insertRes.upsertedCount === "number" && insertRes.upsertedCount > 0) ||
            insertRes.upsertedId != null;
        if (!didInsert) {
            return res.status(409).json({
                success: false,
                message: "You have already booked this slot.",
                code:    "DUPLICATE_BOOKING",
            });
        }

        const entry = await SlotQueue.findOne({ slotId, clientId });
        if (!entry) {
            return res.status(500).json({ success: false, message: "Failed to load booking after insert." });
        }

        // Compute position
        const position = await SlotQueue.countDocuments({
            slotId,
            status:    "waiting",
            createdAt: { $lte: entry.createdAt },
        });

        await broadcastQueueUpdate(ioBus, slotId);

        res.status(201).json({ success: true, queueEntryId: entry._id, position, slotId });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You have already booked this slot.",
                code:    "DUPLICATE_BOOKING",
            });
        }
        console.error("[bookSlot] userId=%s slotId=%s | %s", req.user?._id, req.params.id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to book slot." });
    }
};

// ─── POST /api/slots/:id/extend  (astrologer extends endAt) ──────────────────
export const extendSlot = async (req, res) => {
    try {
        const { minutes } = req.body;
        if (!minutes || minutes <= 0) {
            return res.status(400).json({ success: false, message: "minutes must be a positive number." });
        }

        const slot = await Slot.findById(req.params.id);
        if (!slot) return res.status(404).json({ success: false, message: "Slot not found." });
        if (!slot.astrologerId.equals(req.user._id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        const nextEnd = new Date(slot.endAt.getTime() + Number(minutes) * 60_000);
        const overlaps = await hasOverlappingSlot({
            astrologerId: req.user._id,
            startAt: slot.startAt,
            endAt: nextEnd,
            excludeSlotId: slot._id,
        });
        if (overlaps) {
            return res.status(409).json({
                success: false,
                message: "Extending this slot would overlap with another slot. Reduce extension or adjust times.",
                code: "SLOT_OVERLAP",
            });
        }

        slot.endAt = nextEnd;
        await slot.save();

        res.json({ success: true, slot });
    } catch (err) {
        console.error("[extendSlot] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to extend slot." });
    }
};

// ─── POST /api/slots/:id/fetch-next  (astrologer fetches next client via HTTP) ──
// HTTP fallback for when the socket path is unreliable.  Results are still
// delivered via socket events (client_activated → astrologer, your_turn → client).
export const fetchNextClient = async (req, res) => {
    try {
        const slot = await Slot.findById(req.params.id);
        if (!slot) {
            return res.status(404).json({ success: false, message: "Slot not found." });
        }
        if (!slot.astrologerId.equals(req.user._id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }
        if (slot.status !== "active") {
            return res.status(409).json({ success: false, message: "Slot is not active." });
        }

        const result = await activateNextClient(ioBus, slot._id);
        res.json(result);
    } catch (err) {
        console.error("[fetchNextClient] userId=%s slotId=%s | %s", req.user?._id, req.params.id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch next client." });
    }
};

// ─── POST /api/slots/:id/cancel-remaining  (astrologer cancels waiting clients) ──
export const cancelRemaining = async (req, res) => {
    try {
        const slot = await Slot.findById(req.params.id);
        if (!slot) return res.status(404).json({ success: false, message: "Slot not found." });
        if (!slot.astrologerId.equals(req.user._id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        await cancelRemainingQueue(io, slot._id);
        await Slot.findByIdAndUpdate(slot._id, { status: "closed" });

        res.json({ success: true, message: "Remaining queue cancelled and slot closed." });
    } catch (err) {
        console.error("[cancelRemaining] userId=%s | %s", req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to cancel queue." });
    }
};
