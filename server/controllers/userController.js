import { generateToken, generateRefreshToken } from "../lib/utils.js";
import { verifyRefreshToken } from "../middleware/auth.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";
import { validationResult } from "express-validator";

const COOKIE_OPTIONS = {
    httpOnly: true,           // Not accessible via JS (XSS protection)
    secure: process.env.NODE_ENV === "production",  // HTTPS only in prod
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,  // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/refresh",  // Scoped — only sent to the refresh endpoint
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
};

// Helper to set auth cookies and return tokens
const issueTokens = (res, userId) => {
    const token = generateToken(userId);
    const refreshToken = generateRefreshToken(userId);

    res.cookie("accessToken", token, COOKIE_OPTIONS);
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    return { token, refreshToken };
};

// Signup a new user
export const signup = async (req, res) => {
    // Collect validation errors from express-validator middleware
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { fullName, email, password, bio, role } = req.body;

    try {
        if (!["astrologer", "client"].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }

        // Limit astrologer registrations to 2
        if (role === "astrologer") {
            const astrologerCount = await User.countDocuments({ role: "astrologer" });
            if (astrologerCount >= 2) {
                return res.status(403).json({ success: false, message: "Registration limit reached: only 2 astrologers are allowed." });
            }
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "An account with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = await User.create({ fullName, email, password: hashedPassword, bio, role });

        const { token, refreshToken } = issueTokens(res, newUser._id);

        const { password: _, ...userData } = newUser.toObject();
        res.status(201).json({ success: true, userData, token, message: "Account created successfully" });
    } catch (error) {
        console.error("signup error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Login a user
export const login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        const userData = await User.findOne({ email });

        // Constant-time response to prevent user enumeration
        if (!userData) {
            await bcrypt.compare(password, "$2b$12$invalidusernameXXXXXXuTlmi0QBMrfqLHk5bKxSiDiBml0hDvq6");
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const { token, refreshToken } = issueTokens(res, userData._id);

        const { password: _, ...userWithoutPassword } = userData.toObject();
        res.json({ success: true, userData: userWithoutPassword, token, message: "Login successful" });
    } catch (error) {
        console.error("login error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Refresh access token using the refresh token cookie
export const refreshAccessToken = (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ success: false, message: "No refresh token" });
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);
        const newAccessToken = generateToken(decoded.userId);
        res.cookie("accessToken", newAccessToken, COOKIE_OPTIONS);
        res.json({ success: true, token: newAccessToken });
    } catch {
        res.clearCookie("accessToken");
        res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
        return res.status(401).json({ success: false, message: "Invalid or expired refresh token. Please log in again." });
    }
};

// Logout — clear auth cookies server-side
export const logout = (req, res) => {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
    res.json({ success: true, message: "Logged out successfully" });
};

// Check if user is authenticated
export const checkAuth = (req, res) => {
    res.json({ success: true, user: req.user });
};

// Update user profile details
export const updateProfile = async (req, res) => {
    try {
        const { profilePic, bio, fullName } = req.body;
        const userId = req.user._id;

        let updatedUser;
        if (!profilePic) {
            updatedUser = await User.findByIdAndUpdate(userId, { bio, fullName }, { new: true }).select("-password");
        } else {
            const upload = await cloudinary.uploader.upload(profilePic);
            updatedUser = await User.findByIdAndUpdate(
                userId,
                { profilePic: upload.secure_url, bio, fullName },
                { new: true }
            ).select("-password");
        }

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("updateProfile error:", error.message);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
