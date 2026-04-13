import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

const app = express();
const server = http.createServer(app);

// Allowed origins — extend this list as needed
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];

// Initialize socket.io with origin restriction and JWT handshake auth
export const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        credentials: true,
    },
});

// Store online users
export const userSocketMap = {}; // { userId: socketId }

// Authenticate socket connections via JWT cookie or auth token
io.use((socket, next) => {
    try {
        // Accept token from socket handshake auth (sent by client)
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error("Authentication error: no token"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch {
        next(new Error("Authentication error: invalid token"));
    }
});

io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log("User Connected:", userId);

    if (userId) userSocketMap[userId] = socket.id;
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    socket.on("disconnect", () => {
        console.log("User Disconnected:", userId);
        delete userSocketMap[userId];
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
});

// Security headers
app.use(helmet());

// CORS — restrict to allowed origins, allow cookies
app.use(
    cors({
        origin: ALLOWED_ORIGINS,
        credentials: true,
    })
);

// Parse cookies and JSON bodies
app.use(cookieParser());
app.use(express.json({ limit: "4mb" }));

// Routes
app.use("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

// Connect to MongoDB
await connectDB();

if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log("Server is running on PORT: " + PORT));
}

export default server;
