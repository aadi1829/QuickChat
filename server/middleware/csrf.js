import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrfToken";

function safeString(s) {
    return typeof s === "string" ? s : "";
}

export function issueCsrfToken(req, res) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // double-submit: JS must be able to send it as a header
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, csrfToken: token });
}

export function requireCsrf(req, res, next) {
    if (req.method === "OPTIONS") return next();
    if (req.method === "GET" || req.method === "HEAD") return next();

    const cookieToken = safeString(req.cookies?.[CSRF_COOKIE_NAME]);
    const headerToken = safeString(req.get("X-CSRF-Token"));

    if (!cookieToken || !headerToken) {
        return res.status(403).json({ success: false, message: "CSRF token missing" });
    }

    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);
    if (cookieBuf.length !== headerBuf.length) {
        return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    const ok = crypto.timingSafeEqual(cookieBuf, headerBuf);
    if (!ok) {
        return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    next();
}

