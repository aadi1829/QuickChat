/**
 * Direct browser upload to Cloudinary using a short-lived signature from our API.
 */
export async function uploadFileToCloudinary(file, axios, kind = "messages") {
    const { data } = await axios.post("/api/upload/cloudinary-params", { kind });
    if (!data.success) {
        throw new Error(data.message || "Could not start upload");
    }
    const { cloudName, apiKey, timestamp, signature, folder } = data;

    const body = new FormData();
    body.append("file", file);
    body.append("api_key", apiKey);
    body.append("timestamp", String(timestamp));
    body.append("signature", signature);
    body.append("folder", folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.secure_url) {
        throw new Error(json.error?.message || "Cloudinary upload failed");
    }
    return json.secure_url;
}
