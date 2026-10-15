
const crypto = require("crypto");

const SECRET = process.env.ZYNORA_SECRET || "zyngram-day11-dev-secret-change-me";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(plainPassword, salt, 100_000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plainPassword, storedHash) {
  const [salt, hash] = storedHash.split(":");
  const check = crypto.pbkdf2Sync(plainPassword, salt, 100_000, 64, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signToken(payload) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS };
  const encoded = base64url(body);
  const signature = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  if (signature !== expectedSig) return null; // tampered or wrong secret
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null; // expired
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
