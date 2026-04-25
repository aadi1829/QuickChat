import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true},
    fullName: {type: String, required: true},
    password: {type: String, required: true, minlength: 6},
    profilePic: {type: String, default: ""},
    bio: {type: String},
    role: {type: String, enum: ["astrologer", "client"], required: true},
    // Paid plan gate (controls rating visibility + other premium features)
    isPaidUser: { type: Boolean, default: false },
    // Average actual session duration (seconds) for wait time estimates
    avgSessionSeconds: { type: Number, default: 180 },
    sessionSamples:    { type: Number, default: 0 },
    // Client ratings (1-5 stars)
    ratingCount:      { type: Number, default: 0 },
    ratingAvg:        { type: Number, default: 0 },
}, {timestamps: true});

userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

export default User;