import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { requireCsrf } from "../middleware/csrf.js";
import { getBooking, rateBooking }   from "../controllers/bookingController.js";

const bookingRouter = express.Router();

bookingRouter.get("/:id", protectRoute, getBooking);
bookingRouter.post("/:id/rate", protectRoute, requireCsrf, rateBooking);

export default bookingRouter;
