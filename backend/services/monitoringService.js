// Monitoring (Day 12, Task 5). Everything is computed from aiQueryLogs,
// conversations and systemLogs, with an optional [from, to] date filter.
const { db, usingMongo } = require("../db/store");

function inRange(iso, from, to) {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  const f = from ? from.slice(0, 10) : null;
  const t = to ? to.slice(0, 10) : null;
  return (!f || day >= f) && (!t || day <= t);
}

async function getStats({ from, to } = {}) {
  const logs = (await db.aiQueryLogs.findAll()).filter((l) => inRange(l.createdAt, from, to));
  const convs = (await db.conversations.findAll()).filter((c) => inRange(c.createdAt, from, to));
  const sysLogs = (await db.systemLogs.findAll()).filter((l) => inRange(l.timestamp, from, to));

  const byDay = {};
  const freq = {};
  const cats = {};
  for (const l of logs) {
    const d = l.createdAt.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
    const q = (l.question || "").trim().toLowerCase();
    if (q) freq[q] = (freq[q] || 0) + 1;
    if (l.grounded && l.category) cats[l.category] = (cats[l.category] || 0) + 1;
  }
  const topQuestions = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([question, count]) => ({ question, count }));
  const knowledgeCategories = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }));

  const answered = logs.filter((l) => l.grounded);
  const blocked = logs.filter((l) => l.status === "BLOCKED_INJECTION");
  const noAnswer = logs.filter((l) => !l.grounded && l.status !== "BLOCKED_INJECTION");
  const errors = sysLogs.filter((l) => l.level === "error" || Number(l.status) >= 500);
  const authFailures = sysLogs.filter((l) => l.action === "AUTH_FAILURE").length;
  const avg = logs.length ? Math.round(logs.reduce((s, l) => s + (l.responseTimeMs || 0), 0) / logs.length) : 0;
  const recentLogs = logs.slice(-50);
  const recentErrRate = recentLogs.length ? sysLogs.filter((l) => l.level === "error").length / Math.max(recentLogs.length, 1) : 0;

  let dbOk = true;
  try { await db.users.findOne({}); } catch { dbOk = false; }
  const knowledgeActive = (await db.knowledgeChunks.findAll()).length;

  let health = "HEALTHY";
  if (!dbOk || recentErrRate > 0.2) health = "DOWN";
  else if (avg > 2000 || (logs.length >= 10 && noAnswer.length / logs.length > 0.5)) health = "DEGRADED";

  return {
    range: { from: from || null, to: to || null },
    totalConversations: convs.length,
    totalQuestions: logs.length,
    dailyQuestions: byDay,
    successfulAnswers: answered.length,
    noAnswerResponses: noAnswer.length,
    blockedInjectionAttempts: blocked.length,
    retrievalFailures: logs.filter((l) => l.status !== "BLOCKED_INJECTION" && (l.retrievedChunks || 0) === 0).length,
    avgResponseTimeMs: avg,
    topQuestions,
    knowledgeCategories,
    errorCount: errors.length,
    authFailures,
    aiServiceHealth: health,
    system: { database: dbOk ? "UP" : "DOWN", store: usingMongo ? "mongodb" : "json", knowledgeChunks: knowledgeActive, version: require("../package.json").version },
  };
}

// Admin log viewer: filter by level/module/traceId/date
async function getLogs({ level, module: mod, traceId, from, to, limit = 100 } = {}) {
  let rows = (await db.systemLogs.findAll()).filter((l) => inRange(l.timestamp, from, to));
  if (level) rows = rows.filter((l) => l.level === level);
  if (mod) rows = rows.filter((l) => l.module === mod);
  if (traceId) rows = rows.filter((l) => l.traceId === traceId);
  return rows.reverse().slice(0, Math.min(Number(limit) || 100, 500)).map(({ createdAt, ...r }) => r);
}

// Per-answer quality records (Task 4)
async function getQualityRecords({ from, to, limit = 50 } = {}) {
  const rows = (await db.aiQueryLogs.findAll()).filter((l) => inRange(l.createdAt, from, to));
  return rows.reverse().slice(0, Math.min(Number(limit) || 50, 200)).map((l) => ({
    id: l.id, question: l.question, retrievedChunks: l.retrievedChunks, chunkDetails: l.chunkDetails || [],
    similarity: l.similarity, answer: (l.answer || "").slice(0, 200), sources: l.sources || [],
    responseTimeMs: l.responseTimeMs, grounded: l.grounded, confidence: l.confidence, status: l.status || (l.grounded ? "ANSWERED" : "NO_ANSWER"),
    usedContext: Boolean(l.usedContext), createdAt: l.createdAt,
  }));
}

module.exports = { getStats, getLogs, getQualityRecords };
