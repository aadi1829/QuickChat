import mongoose from "mongoose";

const slotSchema = new mongoose.Schema({
    slotId:             { type: mongoose.Schema.Types.ObjectId, ref: "Slot",  required: true, index: true },
    clientId:           { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
    status:             {
        type: String,
        enum: ["waiting", "active", "completed", "skipped", "cancelled"],
        default: "waiting",
        index: true,
    },
    bookedAt:           { type: Date, default: Date.now },
    reconnectDeadline:  { type: Date, default: null },
}, { timestamps: true });

// FIFO ordering + active-session lookup
slotSchema.index({ slotId: 1, status: 1, createdAt: 1 });
// Active session lookup by client (messageController / guards)
slotSchema.index({ clientId: 1, status: 1 });
// Reconnect grace expiry (sweeper — restart-safe vs in-memory setTimeout)
slotSchema.index({ status: 1, reconnectDeadline: 1 });
// One booking per client per slot
slotSchema.index({ slotId: 1, clientId: 1 }, { unique: true });

const SlotQueue = mongoose.model("SlotQueue", slotSchema);
export default SlotQueue;
