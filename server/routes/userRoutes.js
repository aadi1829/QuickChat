import express from "express";
import { body } from "express-validator";
import {
    checkAuth,
    login,
    logout,
    refreshAccessToken,
    signup,
    updateProfile,
} from "../controllers/userController.js";
import { protectRoute } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";

const userRouter = express.Router();

// Strict rate limiter for auth endpoints — max 10 requests per 15 minutes per IP
// Disabled in test environment so tests don't trigger 429s
const authLimiter = process.env.NODE_ENV === "test"
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Too many requests. Please try again later." },
    });

// Input validation rules
const signupValidation = [
    body("fullName").trim().notEmpty().withMessage("Full name is required").isLength({ max: 100 }),
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password")
        .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
        .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
        .matches(/[0-9]/).withMessage("Password must contain at least one number"),
    body("bio").trim().notEmpty().withMessage("Bio is required").isLength({ max: 300 }),
    body("role").isIn(["astrologer", "client"]).withMessage("Role must be 'astrologer' or 'client'"),
];

const loginValidation = [
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
];

userRouter.post("/signup", authLimiter, signupValidation, signup);
userRouter.post("/login", authLimiter, loginValidation, login);
userRouter.post("/logout", protectRoute, logout);
userRouter.post("/refresh", refreshAccessToken);
userRouter.put("/update-profile", protectRoute, updateProfile);
userRouter.get("/check", protectRoute, checkAuth);

export default userRouter;
