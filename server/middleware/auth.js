import User from "../models/User.js";
import jwt from "jsonwebtoken";

// Middleware to protect routes — reads JWT from HttpOnly cookie or Authorization header
export const protectRoute = async (req, res, next) => {
    try {
        // Support both HttpOnly cookie and Authorization: Bearer <token>
        let token = req.cookies?.accessToken;

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }

        if (!token) {
            return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            // Return generic message — never expose JWT error details
            return res.status(401).json({ success: false, message: "Unauthorized: Invalid or expired token" });
        }

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized: User not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("protectRoute error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Middleware for role-based authorization
export const authorizeRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Access denied: insufficient permissions",
            });
        }
        next();
    };
};

// Verify a refresh token and return the decoded payload (used in /refresh endpoint)
export const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};
