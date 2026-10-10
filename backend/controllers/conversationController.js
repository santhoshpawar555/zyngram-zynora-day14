const svc = require("../services/conversationService");
const { requireAuth } = require("../middleware/auth");
const { badRequest } = require("../lib/http-helpers");

async function create(ctx) {
  const auth = requireAuth(ctx.req);
  const body = ctx.body || {};

  return {
    status: 201,
    body: await svc.createConversation(
      auth.userId,
      ctx.body.title
    ),
  };
}

async function list(ctx) {
  const auth = requireAuth(ctx.req);

  return {
    status: 200,
    body: await svc.listConversations(auth.userId),
  };
}

async function history(ctx) {
  const auth = requireAuth(ctx.req);

  return {
    status: 200,
    body: await svc.getHistory(
      ctx.params.id,
      auth.userId
    ),
  };
}

async function rename(ctx) {
  const auth = requireAuth(ctx.req);

  if (!ctx.body.title) {
    throw badRequest("title is required.");
  }

  return {
    status: 200,
    body: await svc.renameConversation(
      ctx.params.id,
      auth.userId,
      ctx.body.title
    ),
  };
}

async function del(ctx) {
  const auth = requireAuth(ctx.req);

  await svc.deleteConversation(
    ctx.params.id,
    auth.userId
  );

  return {
    status: 200,
    body: {
      success: true,
    },
  };
}

async function clear(ctx) {
  const auth = requireAuth(ctx.req);

  return {
    status: 200,
    body: await svc.clearConversation(
      ctx.params.id,
      auth.userId
    ),
  };
}

module.exports = {
  create,
  list,
  history,
  rename,
  del,
  clear,
};