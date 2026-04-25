import express from "express";
import { body } from "express-validator";
import {
    checkAuth,
    listAstrologers,
    login,
    logout,
    refreshAccessToken,
    signup,
    updateProfile,
} from "../controllers/userController.js";
import { protectRoute } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { issueCsrfToken, requireCsrf } from "../middleware/csrf.js";

const userRouter = express.Router();

userRouter.post("/signup", authLimiter, [
    body("fullName").trim().escape().notEmpty().withMessage("Full name is required"),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("bio").optional({ nullable: true }).trim().escape(),
    body("role").isIn(["astrologer", "client"]).withMessage("Role must be astrologer or client"),
], signup);

userRouter.post("/login", authLimiter, [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
], login);
userRouter.post("/logout", protectRoute, requireCsrf, logout);
userRouter.post("/refresh", authLimiter, refreshAccessToken);
userRouter.put("/update-profile", protectRoute, requireCsrf, [
    body("fullName").optional({ nullable: true }).trim().escape(),
    body("bio").optional({ nullable: true }).trim().escape(),
], updateProfile);
userRouter.get("/check", protectRoute, checkAuth);
userRouter.get("/astrologers", protectRoute, listAstrologers);
userRouter.get("/csrf", issueCsrfToken);

export default userRouter;
