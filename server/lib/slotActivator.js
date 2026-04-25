/**
 * slotActivator.js
 *
 * Cron jobs that drive automatic slot lifecycle transitions:
 *   1. Every 30 s — activate slots whose startAt has been reached.
 *   2. Every 60 s — warn the astrologer 5 min before endAt.
 *   3. Every 60 s — close slots that have passed endAt.
 *
 * Call initSlotActivator(io) once from server.js after MongoDB is connected.
 */

import cron from "node-cron";
import Slot from "../models/Slot.js";
import { cancelRemainingQueue, sweepReconnectDeadlines } from "./sessionManager.js";

export function initSlotActivator(io) {
    // ── 1. Activate open slots whose startAt has been reached ────────────────
    cron.schedule("*/30 * * * * *", async () => {
        try {
            const now = new Date();
            const toActivate = await Slot.find({ status: "open", startAt: { $lte: now } });

            for (const slot of toActivate) {
                await Slot.findByIdAndUpdate(slot._id, { status: "active" });
            }

            await sweepReconnectDeadlines(io);
        } catch (err) {
            console.error("[slotActivator] activate cron | %s", err.message);
        }
    });

    // ── 2. Warn astrologer 5 min before slot endAt ───────────────────────────
    cron.schedule("* * * * *", async () => {
        try {
            const now      = new Date();
            const warnAt   = new Date(now.getTime() + 5 * 60 * 1000);
            const warnPast = new Date(now.getTime() + 4 * 60 * 1000); // 1-min window to avoid re-firing

            const endingSoon = await Slot.find({
                status: "active",
                endAt:  { $gte: warnPast, $lte: warnAt },
            });

            for (const slot of endingSoon) {
                const minutesLeft = Math.round((slot.endAt - now) / 60_000);
                io.to(`user:${slot.astrologerId}`).emit("slot_ending_soon", {
                    slotId:      slot._id.toString(),
                    minutesLeft,
                });
            }
        } catch (err) {
            console.error("[slotActivator] warning cron | %s", err.message);
        }
    });

    // ── 3. Force-close active slots past their endAt ─────────────────────────
    cron.schedule("* * * * *", async () => {
        try {
            const now    = new Date();
            const passed = await Slot.find({ status: "active", endAt: { $lt: now } });

            for (const slot of passed) {
                await cancelRemainingQueue(io, slot._id);
                await Slot.findByIdAndUpdate(slot._id, { status: "closed" });
                io.to(`user:${slot.astrologerId}`).emit("slot_closed", {
                    slotId: slot._id.toString(),
                    reason: "endAt reached",
                });
            }
        } catch (err) {
            console.error("[slotActivator] close cron | %s", err.message);
        }
    });

    console.log("[slotActivator] Cron jobs initialized");
}
