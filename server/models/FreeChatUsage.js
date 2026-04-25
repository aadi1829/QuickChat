import mongoose from "mongoose";

const freeChatUsageSchema = new mongoose.Schema({
    clientId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    astrologerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    usedAt:       { type: Date, default: Date.now },
}, { timestamps: true });

// One free chat per client-astrologer pair
freeChatUsageSchema.index({ clientId: 1, astrologerId: 1 }, { unique: true });

const FreeChatUsage = mongoose.model("FreeChatUsage", freeChatUsageSchema);
export default FreeChatUsage;
