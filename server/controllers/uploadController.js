import cloudinary from "../lib/cloudinary.js";

const FOLDERS = {
    messages: "quickchat/messages",
    profiles: "quickchat/profiles",
};

/**
 * Signed params for browser → Cloudinary direct upload (keeps heavy I/O off send/update handlers).
 */
export const getCloudinaryUploadParams = async (req, res) => {
    try {
        const kind = req.body?.kind === "profiles" ? "profiles" : "messages";
        const folder = FOLDERS[kind];

        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_API_KEY) {
            return res.status(503).json({ success: false, message: "Image uploads are not configured." });
        }

        const timestamp = Math.round(Date.now() / 1000);
        const paramsToSign = { folder, timestamp };
        const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

        res.json({
            success: true,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            apiKey:    process.env.CLOUDINARY_API_KEY,
            timestamp,
            signature,
            folder,
        });
    } catch (err) {
        console.error("[getCloudinaryUploadParams] userId=%s | %s", req.user?._id, err.message);
        res.status(500).json({ success: false, message: "Failed to prepare upload." });
    }
};
