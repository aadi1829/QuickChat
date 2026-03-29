import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
    astrologerId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    clientId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    startTime: {type: Date, required: true},
}, {timestamps: true});

// Ensure a unique session per client-astrologer pair
sessionSchema.index({ astrologerId: 1, clientId: 1 }, { unique: true });

const Session = mongoose.model("Session", sessionSchema);

export default Session;
