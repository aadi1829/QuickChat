import express from "express";
import { protectRoute, authorizeRole } from "../middleware/auth.js";
import { requireCsrf } from "../middleware/csrf.js";
import {
    createSlot,
    getSlots,
    getQueue,
    getCurrentActiveWaitingQueue,
    getAstrologerSlotsWithClients,
    bookSlot,
    extendSlot,
    cancelRemaining,
    fetchNextClient,
} from "../controllers/slotController.js";

const slotRouter = express.Router();

// Anyone authenticated can browse slots
slotRouter.get("/",              protectRoute,                        getSlots);

// Client-only: book a slot
slotRouter.post("/:id/book",     protectRoute, requireCsrf, authorizeRole("client"),   bookSlot);

// Astrologer-only: create / manage slots
slotRouter.post("/",                      protectRoute, requireCsrf, authorizeRole("astrologer"), createSlot);
slotRouter.get("/current/active-waiting-queue", protectRoute, authorizeRole("astrologer"), getCurrentActiveWaitingQueue);
slotRouter.get("/astrologer/slots-with-clients", protectRoute, authorizeRole("astrologer"), getAstrologerSlotsWithClients);
slotRouter.get("/:id/queue",              protectRoute, authorizeRole("astrologer"), getQueue);
slotRouter.post("/:id/fetch-next",        protectRoute, requireCsrf, authorizeRole("astrologer"), fetchNextClient);
slotRouter.post("/:id/extend",            protectRoute, requireCsrf, authorizeRole("astrologer"), extendSlot);
slotRouter.post("/:id/cancel-remaining",  protectRoute, requireCsrf, authorizeRole("astrologer"), cancelRemaining);

export default slotRouter;
