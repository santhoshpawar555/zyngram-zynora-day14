const zynoraService = require("../services/zynoraService");
const { requireAuth } = require("../middleware/auth");
const { badRequest } = require("../lib/http-helpers");

async function chat(ctx) {
  const auth = requireAuth(ctx.req);

  const { message, sessionId, conversationId } = ctx.body || {};

  if (!message) {
    throw badRequest("message is required.");
  }

  // Persistent conversation ke liye conversationId preferred hai.
  // sessionId compatibility ke liye rakha hai.
  const finalSessionId =
    conversationId ||
    sessionId ||
    ctx.req.headers["x-session-id"];

  if (!finalSessionId) {
    throw badRequest("conversationId is required.");
  }

  const result = await zynoraService.chat({
    message,
    userId: auth.userId,
    userRole: auth.role,
    sessionId: finalSessionId,
    traceId: ctx.traceId,
  });

  return {
    status: 200,
    body: result,
  };
}

module.exports = {
  chat,
};