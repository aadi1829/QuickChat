import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
    queueEntryId:  { type: mongoose.Schema.Types.ObjectId, ref: "SlotQueue", required: true, unique: true },
    chatStartedAt: { type: Date, default: Date.now },
    sessionEndTime:{ type: Date, required: true },
    chatEndedAt:   { type: Date, default: null },
    status:        { type: String, enum: ["active", "completed"], default: "active" },
    ratingStars:   { type: Number, default: null, min: 1, max: 5 },
    ratedAt:       { type: Date, default: null },
}, { timestamps: true });

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
