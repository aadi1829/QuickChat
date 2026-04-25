import Booking   from "../models/Booking.js";
import SlotQueue  from "../models/SlotQueue.js";
import Slot       from "../models/Slot.js";
import User       from "../models/User.js";

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────
export const getBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate({
            path: "queueEntryId",
            populate: [
                { path: "clientId",  select: "fullName profilePic bio" },
                { path: "slotId",    populate: { path: "astrologerId", select: "fullName profilePic bio isPaidUser" } },
            ],
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }

        const queueEntry = booking.queueEntryId;
        const slot       = queueEntry?.slotId;

        // Only the participating client or astrologer may view this booking
        const userId = req.user._id.toString();
        const isParticipant =
            queueEntry?.clientId?._id?.toString() === userId ||
            slot?.astrologerId?._id?.toString() === userId;

        if (!isParticipant) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        res.json({ success: true, booking });
    } catch (err) {
        console.error("[getBooking] bookingId=%s userId=%s | %s", req.params.id, req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to fetch booking." });
    }
};

// ─── POST /api/bookings/:id/rate  (client only) ───────────────────────────────
export const rateBooking = async (req, res) => {
    try {
        if (req.user?.role !== "client") {
            return res.status(403).json({ success: false, message: "Only clients can rate sessions." });
        }

        const stars = Number(req.body?.stars);
        if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
            return res.status(400).json({ success: false, message: "stars must be an integer 1-5." });
        }

        const booking = await Booking.findById(req.params.id).select("_id status ratingStars queueEntryId");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
        if (booking.status !== "completed") {
            return res.status(400).json({ success: false, message: "You can only rate after the session ends." });
        }
        if (booking.ratingStars != null) {
            return res.status(409).json({ success: false, message: "This session was already rated." });
        }

        const queueEntry = await SlotQueue.findById(booking.queueEntryId).select("clientId slotId");
        if (!queueEntry) return res.status(400).json({ success: false, message: "Invalid booking (missing queue entry)." });

        const userId = req.user._id.toString();
        if (queueEntry.clientId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        const slot = await Slot.findById(queueEntry.slotId).select("astrologerId");
        if (!slot?.astrologerId) return res.status(400).json({ success: false, message: "Invalid booking (missing slot)." });

        const astrologerPaid = await User.findById(slot.astrologerId).select("isPaidUser ratingAvg ratingCount");
        if (!astrologerPaid?.isPaidUser) {
            return res.status(403).json({
                success: false,
                message: "Rating is only available for paid astrologers.",
            });
        }

        // Persist rating on booking (atomic idempotency gate)
        const rounded = Math.round(stars);
        const ratedAt = new Date();
        const updatedBooking = await Booking.findOneAndUpdate(
            { _id: booking._id, status: "completed", ratingStars: null },
            { $set: { ratingStars: rounded, ratedAt } },
            { new: true }
        ).select("ratingStars");

        if (!updatedBooking) {
            return res.status(409).json({ success: false, message: "This session was already rated." });
        }

        // Update astrologer rolling average
        const count = Number(astrologerPaid.ratingCount || 0);
        const prevAvg = Number(astrologerPaid.ratingAvg || 0);
        const nextAvg = count <= 0 ? rounded : ((prevAvg * count) + rounded) / (count + 1);
        astrologerPaid.ratingCount = count + 1;
        astrologerPaid.ratingAvg = Math.round(nextAvg * 10) / 10; // 1 decimal
        await astrologerPaid.save();

        res.json({
            success: true,
            message: "Thanks for rating!",
            ratingAvg: astrologerPaid.ratingAvg ?? null,
            ratingCount: astrologerPaid.ratingCount ?? null,
        });
    } catch (err) {
        console.error("[rateBooking] bookingId=%s userId=%s | %s", req.params?.id, req.user?._id, err.message, { stack: err.stack });
        res.status(500).json({ success: false, message: "Failed to submit rating." });
    }
};
