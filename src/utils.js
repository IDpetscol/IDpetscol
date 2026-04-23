import crypto from "node:crypto";

export function safeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function decodeDataUrlImage(dataUrl) {
  const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) {
    const error = new Error("La imagen debe llegar como data URL PNG.");
    error.statusCode = 400;
    error.publicMessage = "La foto debe enviarse en PNG.";
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  return { mimeType, buffer };
}

export function base64UrlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sanitizeWalletIdPart(value, fallback = "item") {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return normalized || fallback;
}

export function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}
