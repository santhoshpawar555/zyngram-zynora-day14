
// controllers/authController.js - login only (users are seeded, no public
// signup needed for this internal tool - matches "internal Zyngram staff
// chatbot" framing in the brief).
const { db } = require("../db/store");
const { verifyPassword, signToken } = require("../lib/auth");
const { badRequest } = require("../lib/http-helpers");
const { logAction } = require("../services/auditService");
const logger = require("../lib/logger");

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

module.exports = { login };
