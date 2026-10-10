const { db } = require("../db/store");
const { generateId } = require("../lib/id");
const { notFound, forbidden, badRequest } = require("../lib/http-helpers");
const logger = require("../lib/logger");

async function createConversation(userId, title) {
  if (!userId) {
    throw forbidden("Login required to create a persistent conversation.");
  }

  const now = new Date().toISOString();

  if (title !== undefined && title !== null && typeof title !== "string") throw badRequest("title must be a string.");
  const conv = await db.conversations.insert({
    id: generateId("CONV"),
    userId,
    title: title && title.trim() ? title.trim().slice(0, 100) : "New conversation",
    messageCount: 0,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });
  logger.log({ module: "conversation", action: "CONVERSATION_CREATED", user: userId, meta: { conversationId: conv.id } });
  return conv;
}

async function listConversations(userId) {
  if (!userId) {
    throw forbidden("Login required.");
  }

  const conversations = await db.conversations.findAll({ userId });

  return conversations.sort((a, b) =>
    (b.updatedAt || b.createdAt || "").localeCompare(
      a.updatedAt || a.createdAt || ""
    )
  );
}

async function getOwned(id, userId) {
  if (!userId) {
    throw forbidden("Login required.");
  }

  const conversation = await db.conversations.findById(id);

  if (!conversation) {
    throw notFound("Conversation not found.");
  }

  
  // user can access own conversation.
  if (conversation.userId !== userId) {
    throw forbidden("You cannot access another user's conversation.");
  }

  return conversation;
}

async function renameConversation(id, userId, title) {
  await getOwned(id, userId);

  if (typeof title !== "string" || !title.trim()) {
    throw badRequest("Conversation title is required.");
  }

  logger.log({ module: "conversation", action: "CONVERSATION_RENAMED", user: userId, meta: { conversationId: id } });
  return db.conversations.update(id, {
    title: title.trim().slice(0, 100),
    updatedAt: new Date().toISOString(),
  });
}

async function deleteConversation(id, userId) {
  await getOwned(id, userId);

  // Conversation history is linked using sessionId = conversation id.
  await db.chatHistory.deleteMany({
    sessionId: id,
  });

  logger.log({ module: "conversation", action: "CONVERSATION_DELETED", user: userId, meta: { conversationId: id } });
  return db.conversations.deleteById(id);
}

async function clearConversation(id, userId) {
  const conversation = await getOwned(id, userId);

  await db.chatHistory.deleteMany({
    sessionId: id,
  });

  await db.conversations.update(id, { messageCount: 0 });
  logger.log({ module: "conversation", action: "CONVERSATION_CLEARED", user: userId, meta: { conversationId: id } });
  return {
    ...conversation,
    messageCount: 0,
    clearedAt: new Date().toISOString(),
  };
}

async function getHistory(id, userId) {
  await getOwned(id, userId);

  const history = await db.chatHistory.findAll({
    sessionId: id,
  });

  return history.sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

// Called after every exchange: bumps updatedAt, message count, and
// auto-titles a still-default conversation from the first question.
async function touch(id, userId, firstQuestion) {
  const conv = await getOwned(id, userId);
  const patch = { updatedAt: new Date().toISOString(), messageCount: (conv.messageCount || 0) + 2 };
  if (firstQuestion && conv.title === "New conversation") patch.title = firstQuestion.slice(0, 60);
  return db.conversations.update(id, patch);
}

module.exports = {
  createConversation,
  listConversations,
  getOwned,
  renameConversation,
  deleteConversation,
  clearConversation,
  getHistory,
  touch,
};