
// Admin Knowledge Management.
// this is admin endpoint.
const knowledgeService = require("../services/knowledgeService");
const { requireAdmin } = require("../middleware/auth");
const { logAction: _audit } = require("../services/auditService");
const logger = require("../lib/logger");
// every KB change is written to both the audit log and the structured log
function logAction(entry) {
  logger.log({ module: "knowledge", action: entry.action, user: entry.actorId, meta: entry.details });
  logger.log({ module: "admin", action: "ADMIN_ACTION:" + entry.action, user: entry.actorId });
  return _audit(entry);
}

async function create(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.ingestDocument({ ...ctx.body, createdBy: admin.userId });
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_CREATED", details: { documentId: doc.id, title: doc.title } });
  return { status: 201, body: doc };
}

async function list(ctx) {
  requireAdmin(ctx.req);
  const docs = await knowledgeService.listDocuments({ status: ctx.query.status, category: ctx.query.category });
  return { status: 200, body: docs };
}

async function getOne(ctx) {
  requireAdmin(ctx.req);
  return { status: 200, body: await knowledgeService.getDocument(ctx.params.id) };
}

async function update(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.updateDocumentContent(ctx.params.id, ctx.body);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_EDITED", details: { documentId: doc.id } });
  return { status: 200, body: doc };
}

async function approve(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.approveDocument(ctx.params.id);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_APPROVED", details: { documentId: doc.id } });
  return { status: 200, body: doc };
}

async function activate(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.activateDocument(ctx.params.id);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_ACTIVATED_IN_RAG", details: { documentId: doc.id } });
  return { status: 200, body: doc };
}

async function archive(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.archiveDocument(ctx.params.id);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_ARCHIVED", details: { documentId: doc.id } });
  return { status: 200, body: doc };
}

async function restore(ctx) {
  const admin = requireAdmin(ctx.req);
  const doc = await knowledgeService.restoreToDraft(ctx.params.id);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_RESTORED_TO_DRAFT", details: { documentId: doc.id } });
  return { status: 200, body: doc };
}

async function remove(ctx) {
  const admin = requireAdmin(ctx.req);
  await knowledgeService.deleteDocument(ctx.params.id);
  logAction({ actorId: admin.userId, actorRole: "admin", action: "DOCUMENT_DELETED", details: { documentId: ctx.params.id } });
  return { status: 200, body: { success: true } };
}

module.exports = { create, list, getOne, update, approve, activate, archive, restore, remove };
