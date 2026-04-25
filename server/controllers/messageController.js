import mongoose    from "mongoose";
import Message     from "../models/Message.js";
import User        from "../models/User.js";
import SlotQueue   from "../models/SlotQueue.js";
import Booking     from "../models/Booking.js";
import Slot        from "../models/Slot.js";
import { io } from "../server.js";

function isHttpsCloudinaryImageUrl(s) {
    return (
        typeof s === "string" &&
        /^https:\/\/res\.cloudinary\.com\/.+\/image\/upload\//.test(s)
    );
}

function remainingSecondsFromBooking(booking) {
    if (!booking?.sessionEndTime) return null;
    const remaining = Math.ceil((new Date(booking.sessionEndTime).getTime() - Date.now()) / 1000);
    return Math.max(0, remaining);
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function astrologerIdFromSlot(slot) {
    if (!slot) return null;
    const raw = slot.astrologerId;
    if (raw && typeof raw === "object" && raw._id != null) return raw._id.toString();
    return raw?.toString() ?? null;
}

/**
 * Find the active SlotQueue entry that pairs these two users (client + astrologer).
 * Uses two `{ clientId, status: "active" }` queries (compound index) instead of scanning
 * all active queue rows globally.
 */
async function findActiveEntry(userAId, userBId) {
    const a = userAId.toString();
    const b = userBId.toString();

    const [asClientA, asClientB] = await Promise.all([
        SlotQueue.find({ clientId: userAId, status: "active" }).populate("slotId"),
        SlotQueue.find({ clientId: userBId, status: "active" }).populate("slotId"),
    ]);

    const byId = new Map();
    for (const entry of [...asClientA, ...asClientB]) {
        byId.set(entry._id.toString(), entry);
    }

    for (const entry of byId.values()) {
        const slot = entry.slotId;
        const astrologerId = astrologerIdFromSlot(slot);
        const clientIdStr = (entry.clientId?._id ?? entry.clientId).toString();
        const otherIdStr = clientIdStr === a ? b : a;

        if (astrologerId && astrologerId === otherIdStr) {
            return entry;
        }
    }

    return null;
}


// ─── GET /api/messages/users ──────────────────────────────────────────────────
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId   = req.user._id;
        const userRole = req.user.role;

        let filteredUsers = [];

        if (userRole === "astrologer") {
            // STRICT: astrologer can only see clients assigned to their own slots.
            const slots = await Slot.find({
                astrologerId: userId,
                status: { $in: ["open", "active"] },
            }).select("_id");

            const slotIds = slots.map((s) => s._id);
            if (slotIds.length === 0) {
                return res.json({ success: true, users: [], unseenMessages: {} });
            }

            const clientIds = await SlotQueue.distinct("clientId", {
                slotId: { $in: slotIds },
                status: { $in: ["waiting", "active"] },
            });

            if (clientIds.length === 0) {
                return res.json({ success: true, users: [], unseenMessages: {} });
            }

            filteredUsers = await User.find({
                _id: { $in: clientIds },
                role: "client",
            }).select("-password").sort({ createdAt: 1 });
        } else {
            // Client: show astrologers (existing behavior)
            filteredUsers = await User.find({
                _id:  { $ne: userId },
                role: { $ne: userRole },
            }).select("-password").sort({ createdAt: 1 });
        }

        // Count unseen messages per contact
        const unseenMessages = {};
        await Promise.all(
            filteredUsers.map(async (user) => {
                const count = await Message.countDocuments({ senderId: user._id, receiverId: userId, seen: false });
                if (count > 0) unseenMessages[user._id] = count;
            })
        );

        res.json({ success: true, users: filteredUsers, unseenMessages });
    } catch (error) {
        console.error("[getUsersForSidebar] userId=%s | %s", req.user?._id, error.message, { stack: error.stack });
        res.status(500).json({ success: false, message: "Failed to load contacts. Please try again later." });
    }
};


// ─── GET /api/messages/:id ────────────────────────────────────────────────────
// Query: `limit` (default 50, max 100), `before` = ObjectId cursor (load older than this message).
export const getMessages = async (req, res) => {
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(selectedUserId)) {
            return res.status(400).json({ success: false, message: "Invalid user id." });
        }

        const sid = new mongoose.Types.ObjectId(selectedUserId);
        const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
        const beforeRaw = req.query.before;

        const conversation = {
            $or: [
                { senderId: myId, receiverId: sid },
                { senderId: sid, receiverId: myId },
            ],
        };

        const filter = beforeRaw
            ? mongoose.Types.ObjectId.isValid(String(beforeRaw))
                ? { $and: [conversation, { _id: { $lt: new mongoose.Types.ObjectId(String(beforeRaw)) } }] }
                : null
            : conversation;

        if (filter === null) {
            return res.status(400).json({ success: false, message: "Invalid cursor (before)." });
        }

        const take = limit + 1;
        const batch = await Message.find(filter)
            .sort({ _id: -1 })
            .limit(take)
            .lean();

        const hasMore = batch.length > limit;
        const page = hasMore ? batch.slice(0, limit) : batch;
        page.reverse();

        const myIdStr = myId.toString();
        const sidStr = sid.toString();
        const toMark = page
            .filter((m) => String(m.senderId) === sidStr && String(m.receiverId) === myIdStr && !m.seen)
            .map((m) => m._id);

        if (toMark.length > 0) {
            await Message.updateMany({ _id: { $in: toMark } }, { $set: { seen: true } });
            for (const m of page) {
                if (toMark.some((id) => id.toString() === m._id.toString())) m.seen = true;
            }
        }

        // Attach active-session info if one exists between these two users
        const activeEntry = await findActiveEntry(myId, sid);
        let remainingSeconds  = null;
        let currentQueueEntryId = null;
        let bookingId         = null;

        if (activeEntry) {
            const key   = activeEntry._id.toString();
            currentQueueEntryId = key;
            const booking = await Booking.findOne({ queueEntryId: activeEntry._id, status: "active" });
            bookingId = booking?._id?.toString() ?? null;
            remainingSeconds = booking ? remainingSecondsFromBooking(booking) : null;
        }

        res.json({
            success: true,
            messages: page,
            hasMore,
            nextCursor: hasMore && page[0]?._id ? String(page[0]._id) : null,
            remainingSeconds,
            currentQueueEntryId,
            bookingId,
        });
    } catch (error) {
        console.error("[getMessages] myId=%s selectedUserId=%s | %s", req.user?._id, req.params?.id, error.message, { stack: error.stack });
        res.status(500).json({ success: false, message: "Failed to load messages. Please try again later." });
    }
};


// ─── PUT /api/messages/mark/:id ───────────────────────────────────────────────
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        const message = await Message.findById(id);

        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }
        if (message.receiverId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        await Message.findByIdAndUpdate(id, { seen: true });
        res.json({ success: true });
    } catch (error) {
        console.error("[markMessageAsSeen] messageId=%s userId=%s | %s", req.params?.id, req.user?._id, error.message, { stack: error.stack });
        res.status(500).json({ success: false, message: "Failed to update message status. Please try again later." });
    }
};


// ─── POST /api/messages/send/:id ─────────────────────────────────────────────
export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body; // `image` = Cloudinary HTTPS URL from client-side upload
        const receiverId = req.params.id;
        const senderId   = req.user._id;
        const senderName = req.user.fullName;

        if (!text && !image) {
            return res.status(400).json({ success: false, message: "Message must contain text or an image." });
        }

        // Validate receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, message: "Receiver not found." });
        }

        // ── Session guard: require an active booking between these two users ──
        const activeEntry = await findActiveEntry(senderId, new mongoose.Types.ObjectId(receiverId));

        if (!activeEntry) {
            return res.status(403).json({
                success: false,
                message: "No active session. You can only message during an active booking.",
            });
        }

        const queueEntryId = activeEntry._id.toString();

        const booking = await Booking.findOne({ queueEntryId: activeEntry._id, status: "active" });
        const remainingSeconds = booking ? remainingSecondsFromBooking(booking) : 0;

        // Booking is authoritative — if expired, session is over
        if (!booking || remainingSeconds <= 0) {
            return res.status(403).json({
                success: false,
                message: "Session has expired.",
            });
        }

        let imageUrl;
        if (image) {
            if (!isHttpsCloudinaryImageUrl(image)) {
                return res.status(400).json({
                    success: false,
                    message: "Images must be uploaded to Cloudinary before sending.",
                });
            }
            imageUrl = image;
        }

        const newMessage = await Message.create({
            senderId,
            receiverId,
            text,
            image: imageUrl,
        });

        const payload = {
            ...newMessage.toObject(),
            _id: String(newMessage._id),
            senderId: String(newMessage.senderId),
            receiverId: String(newMessage.receiverId),
            senderName,
        };

        // Push to all receiver sessions via their personal room (existing behavior)
        io.to(`user:${receiverId.toString()}`).emit("newMessage", payload);

        // Also emit to the active booking room (new real-time contract)
        if (booking?._id) {
            io.to(`session:${booking._id.toString()}`).emit("receive_message", payload);
        }

        res.json({ success: true, newMessage });
    } catch (error) {
        console.error("[sendMessage] senderId=%s receiverId=%s | %s", req.user?._id, req.params?.id, error.message, { stack: error.stack });
        res.status(500).json({ success: false, message: "Failed to send message. Please try again later." });
    }
};
