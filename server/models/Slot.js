import mongoose from "mongoose";

const slotSchema = new mongoose.Schema({
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startAt:      { type: Date, required: true },
    endAt:        { type: Date, required: true },
    maxClients:   { type: Number, required: true, min: 1, default: 10 },
    status:       { type: String, enum: ["open", "active", "closed"], default: "open", index: true },
}, { timestamps: true });

slotSchema.index({ astrologerId: 1, startAt: 1 });
slotSchema.index({ status: 1, startAt: 1 });

const Slot = mongoose.model("Slot", slotSchema);
export default Slot;
