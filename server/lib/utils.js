import jwt from "jsonwebtoken";

// Generate a short-lived access token (15 minutes)
export const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15m" });
};

// Generate a long-lived refresh token (7 days)
export const generateRefreshToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
};
