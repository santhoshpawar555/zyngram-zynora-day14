const { db } = require("../db/store");
const { generateId } = require("../lib/id");
const { chunkText } = require("./chunkingService");
const { badRequest, notFound } = require("../lib/http-helpers");
const indexSignal = require("../lib/indexSignal");
const { SUPPORTED_LANGS } = require("../lib/lang");

const VALID_CATEGORIES = ["Company", "Services", "Franchise", "Policies", "FAQ"];
const VALID_FORMATS = ["txt", "markdown", "json"];
const STATUS = { DRAFT: "DRAFT", APPROVED: "APPROVED", ACTIVE: "ACTIVE_IN_RAG", ARCHIVED: "ARCHIVED" };

async function regenerateChunksForDocument(doc) {
  // Remove old chunks for this document used on create and edit).
  await db.knowledgeChunks.deleteMany({ documentId: doc.id });
  const rawChunks = chunkText(doc.rawContent, doc.format);
  const newChunks = rawChunks.map((chunk) => ({
    id: generateId("CHK"),
    documentId: doc.id,
    title: doc.title,
    category: doc.category,
    language: doc.language || "en",
    section: chunk.section,
    version: doc.version,
    source: doc.source,
    status: doc.status, 
    content: chunk.content,
    createdAt: new Date().toISOString(),
  }));
  if (newChunks.length) await db.knowledgeChunks.insertMany(newChunks);
    indexSignal.bump();
}

async function syncChunkStatus(documentId, status) {
  await db.knowledgeChunks.updateMany({ documentId }, { status });
     indexSignal.bump();
}

async function ingestDocument({ title, category, version, source, format, language, rawContent, createdBy }) {
  if (!title || !category || !rawContent) {
    throw badRequest("title, category and rawContent are required.");
  }
  if (!VALID_CATEGORIES.includes(category)) {
    throw badRequest(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  const resolvedLanguage = language || "en";
  if (!SUPPORTED_LANGS.includes(resolvedLanguage)) {
    throw badRequest(`language must be one of: ${SUPPORTED_LANGS.join(", ")}`);
  }
  const resolvedFormat = format || "txt";
  if (!VALID_FORMATS.includes(resolvedFormat)) {
    throw badRequest(`format must be one of: ${VALID_FORMATS.join(", ")}`);
  }

  const doc = await db.knowledgeDocuments.insert({
    id: generateId("DOC"),
    title,
    category,
    version: version || "v1",
    source: source || "manual-entry",
    format: resolvedFormat,
    language: resolvedLanguage,
    rawContent: typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent),
    status: STATUS.DRAFT,
    createdBy: createdBy || "unknown",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await regenerateChunksForDocument(doc);
  return doc;
}

async function listDocuments({ status, category } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  return db.knowledgeDocuments.findAll(Object.keys(filter).length ? filter : undefined);
}

async function getDocument(id) {
  const doc = await db.knowledgeDocuments.findById(id);
  if (!doc) throw notFound("Knowledge document not found.");
  return doc;
}

async function updateDocumentContent(id, { title, category, version, source, format, language, rawContent }) {
  await getDocument(id); // 404s early if it doesn't exist
  const patch = {};
  if (title) patch.title = title;
  if (category) patch.category = category;
  if (version) patch.version = version;
  if (source) patch.source = source;
  if (format) patch.format = format;
  if (language) {
    if (!SUPPORTED_LANGS.includes(language)) throw badRequest(`language must be one of: ${SUPPORTED_LANGS.join(", ")}`);
    patch.language = language;
  }
  if (rawContent) patch.rawContent = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  patch.status = STATUS.DRAFT;
  await db.knowledgeDocuments.update(id, patch);
  const updated = await getDocument(id);
  await regenerateChunksForDocument(updated);
  return updated;
}

async function transitionStatus(id, fromStatuses, toStatus) {
  const doc = await getDocument(id);
  if (!fromStatuses.includes(doc.status)) {
    throw badRequest(`Cannot move from '${doc.status}' to '${toStatus}'. Expected current status: ${fromStatuses.join(" or ")}.`);
  }
  await db.knowledgeDocuments.update(id, { status: toStatus });
  await syncChunkStatus(id, toStatus);
  return getDocument(id);
}

const approveDocument = (id) => transitionStatus(id, [STATUS.DRAFT], STATUS.APPROVED);
const activateDocument = (id) => transitionStatus(id, [STATUS.APPROVED], STATUS.ACTIVE);
const archiveDocument = (id) => transitionStatus(id, [STATUS.ACTIVE, STATUS.APPROVED, STATUS.DRAFT], STATUS.ARCHIVED);
// An archived doc can be brought back to draft for re-editing/re-review.
const restoreToDraft = (id) => transitionStatus(id, [STATUS.ARCHIVED], STATUS.DRAFT);

async function deleteDocument(id) {
  await getDocument(id);
  await db.knowledgeDocuments.deleteById(id);
  await db.knowledgeChunks.deleteMany({ documentId: id });
    indexSignal.bump();
}

module.exports = {
  STATUS,
  VALID_CATEGORIES,
  VALID_FORMATS,
  ingestDocument,
  listDocuments,
  getDocument,
  updateDocumentContent,
  approveDocument,
  activateDocument,
  archiveDocument,
  restoreToDraft,
  deleteDocument,
};