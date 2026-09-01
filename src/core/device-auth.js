"use strict";

const crypto = require("crypto");

function normalizeAuthorization(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function hashDeviceToken(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createDeviceAuthenticator({
  findCredential,
  markCredentialUsed = async () => {},
  legacyToken = "",
  allowLegacy = false,
  now = () => new Date(),
}) {
  if (typeof findCredential !== "function") {
    throw new TypeError("findCredential is required");
  }

  return async function authenticateDevice({ authorization, deviceId }) {
    const token = normalizeAuthorization(authorization);
    const normalizedDeviceId = String(deviceId || "").trim();
    if (!token || !normalizedDeviceId) return { authorized: false, method: "none" };

    const tokenHash = hashDeviceToken(token);
    const credential = await findCredential({
      deviceId: normalizedDeviceId,
      tokenHash,
    });
    const currentTime = now();
    const expiresAt = credential?.expires_at
      ? new Date(credential.expires_at)
      : null;
    const usable =
      credential &&
      credential.active === true &&
      !credential.revoked_at &&
      (!expiresAt || (!Number.isNaN(expiresAt.getTime()) && expiresAt > currentTime));

    if (usable) {
      await markCredentialUsed(credential.id, currentTime.toISOString());
      return { authorized: true, method: "device", credentialId: credential.id };
    }

    if (allowLegacy && constantTimeEqual(token, legacyToken)) {
      return { authorized: true, method: "legacy" };
    }

    return { authorized: false, method: "none" };
  };
}

module.exports = {
  constantTimeEqual,
  createDeviceAuthenticator,
  hashDeviceToken,
  normalizeAuthorization,
};
