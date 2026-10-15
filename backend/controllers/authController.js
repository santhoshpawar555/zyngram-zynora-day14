const { db } = require("../db/store");
const crypto = require("crypto");
const {hashPassword, verifyPassword, signToken } = require("../lib/auth");
const { badRequest } = require("../lib/http-helpers");
const { logAction } = require("../services/auditService");
const { sendJson } = require("../lib/sendJson");
const logger = require("../lib/logger");

/** function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(plainPassword, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`; // ek hi string mein store karne ke liye
} */

function generateUserId() {
  // "USR_" + 8 uppercase hex chars — existing records jaisa hi format
  return "USR_" + crypto.randomBytes(4).toString("hex").toUpperCase();
}
async function register(ctx) {
  const { name, email, mobile, password } = ctx.body;

  // ---- Validation — galat input pe HttpError throw karo, jaise login karta hai ----
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    throw badRequest("Full name is required (min 2 characters).");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest("Valid email is required.");
  }
  if (!mobile || !/^[0-9+\-\s]{10,15}$/.test(mobile)) {
    throw badRequest("Valid mobile number is required.");
  }
  if (!password || password.length < 8) {
    throw badRequest("Password must be at least 8 characters.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.users.findOne({ email: normalizedEmail });
  if (existing) {
    return { status: 409, body: { error: "An account with this email already exists." } };
  }

  const newUser = await db.users.insert({
    id: generateUserId(),
    name: name.trim(),
    email: normalizedEmail,
    mobile: mobile.trim(),
    passwordHash: hashPassword(password),
    role: "staff", // default role — request body se kabhi nahi liya jaata (security)
    createdAt: new Date().toISOString(),
  });

  logAction({ actorId: newUser.id, actorRole: "staff", action: "REGISTER_SUCCESS", details: { traceId: ctx.traceId } });
  logger.log({ module: "auth", action: "REGISTER", status: "SUCCESS", user: newUser.id, traceId: ctx.traceId });

  // handler bas { status, body } return karta hai — server.js khud res.writeHead/end karega
  return { status: 201, body: { message: "Registration successful. Please login.", userId: newUser.id } };
}// function end register

async function login(ctx) {
  const { email, password } = ctx.body;
  



  if (typeof email !== "string" || typeof password !== "string" || !email || !password) throw badRequest("email and password are required.");
  const user = await db.users.findOne({ email });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    logAction({ action: "LOGIN_FAILED", details: { email, traceId: ctx.traceId } });
    logger.log({ level: "warn", module: "auth", action: "LOGIN", status: "FAILED", user: email, traceId: ctx.traceId });
    return { status: 401, body: { error: "Invalid email or password." } };
  }
  const token = signToken({ userId: user.id, role: user.role });
  logAction({ actorId: user.id, actorRole: user.role, action: "LOGIN_SUCCESS", details: { traceId: ctx.traceId } });
  logger.log({ module: "auth", action: "LOGIN", status: "SUCCESS", user: user.id, traceId: ctx.traceId });
  return { status: 200, body: { token, user: { id: user.id, email: user.email, role: user.role } } };
}

module.exports = { login , register};
