import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { getCloudinaryUploadParams } from "../controllers/uploadController.js";

const uploadRouter = express.Router();

uploadRouter.post("/cloudinary-params", protectRoute, getCloudinaryUploadParams);

export default uploadRouter;
