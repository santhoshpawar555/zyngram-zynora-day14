const rag = require("./ragService");
const { logAction } = require("./auditService");
const { db } = require("../db/store");
const { generateId } = require("../lib/id");
const { badRequest } = require("../lib/http-helpers");
const conversationService = require("./conversationService");
const logger = require("../lib/logger");

const REFUSAL_MESSAGE =
  "I couldn't find this information in the approved Zyngram knowledge base.";

const INJECTION_PATTERNS = [
  /ignore (your|the|all) (previous )?(instructions|rules|knowledge base)/i,
  /use your own knowledge/i,
  /use general knowledge/i,
  /search (the )?internet/i,
  /search the web/i,
  /go online/i,
  /pretend (you are|to be)/i,
  /act as (if )?(you are|a)/i,
  /you are not (zynora|bound|restricted)/i,
  /forget (your|the) (rules|instructions|restrictions)/i,
  /bypass (the )?(rag|knowledge base|rules|restrictions)/i,
  /jailbreak/i,
  /system prompt/i,
  /disregard (the )?(above|previous)/i,
  /as an? (ai|language model) with no restrictions/i,
  /answer (anyway|even if|without checking)/i,
  /make (something|it|an answer) up/i,
  /just guess/i,
  /(?:^|[.!?,;]\s*|\b(?:please|now|and|then|just)\s+)(use|using|via|open|check|query)\s+(google|bing|duckduckgo|yahoo|chatgpt|wikipedia|the (internet|web|browser))\b/i,
  /\b(google|bing|browse|look up online|look it up online)\b.*\b(search|for|find)\b/i,
  /ignore (all |any |the |your )?(previous |prior |above )?(instructions|rules|prompts?|guidelines|restrictions)/i,
  /(reveal|show|print|display|leak) (me )?(your|the) (system |hidden |initial )?(prompt|instructions|rules|secrets?|api key|env)/i,
  /developer mode|dan mode|do anything now/i,
  /you (are|have) (now )?(free|unrestricted|unfiltered)/i,
  /(drop|delete|truncate) (table|database|collection)/i,
  /\$(where|ne|gt|lt|regex)\b/i,
  /<\s*script|javascript:|onerror\s*=/i,
  /(approve|activate|edit|delete|archive|add|modify|change|update) (a |the |this )?(document|knowledge|kb)\b.*(chat|message|for me)/i,
  /override (the )?(knowledge|rules|safety|restrictions)/i,
  /from now on,? (you|zynora)/i,
  /disregard (the |all |any |your )?(above|previous|prior)/i,
  /repeat (the )?(text|words|everything|instructions?) (above|before)/i,
];

function detectPromptInjection(message) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

function buildAnswerFromMatches(matches) {
  return (matches || [])
    .map((m) => m.content)
    .filter((content) => content && content.trim())
    .join("\n\n");
}

function buildSources(matches) {
  const seen = new Map();

  for (const m of matches || []) {
    if (!m.documentId || seen.has(m.documentId)) continue;

    seen.set(m.documentId, {
      documentId: m.documentId,
      title: m.title,
      category: m.category,
      section: m.section,
      version: m.version,
      similarity: Number(m.score || 0),
    });
  }

  return [...seen.values()];
}

// Context-aware retrieval (Day 12, Task 3).
// A follow-up like "What comes after Hub?" has no standalone meaning, so we
// enrich the *retrieval query* with (a) the user's previous question(s) and
// (b) the titles/sections of the sources the previous answer used. The enriched
// query still only searches the approved knowledge base - nothing external.
const FOLLOWUP_RE =
  /\b(it|its|that|this|those|these|they|them|their|he|she|there|then|next|after|before|above|below|previous|earlier|else|also|more|another|same|instead|above one)\b|^\s*(and|so|what about|how about|why|then)\b/i;

function isFollowUp(message) {
  return FOLLOWUP_RE.test(message);
}

function contextAnswerIsRelevant() { return true; } // superseded by boundaryCheck on the raw question

async function rewriteWithContext(sessionId, message) {
  const result = { query: message, usedContext: false, contextTerms: [] };
  if (!sessionId || !isFollowUp(message)) return result;

  const rows = await db.chatHistory.findAll({ sessionId });
  const ordered = rows
    .filter((r) => !r.flaggedAsInjection)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .slice(-8);

  const prevUser = ordered.filter((r) => r.role === "user" && r.message).slice(-2).map((r) => r.message.trim());
  const lastGroundedAnswer = [...ordered].reverse().find((r) => r.role === "assistant" && r.grounded && r.sources && r.sources.length);
  const sourceTerms = lastGroundedAnswer
    ? lastGroundedAnswer.sources.slice(0, 2).map((x) => [x.title, x.section].filter(Boolean).join(" "))
    : [];

  if (prevUser.length === 0 && sourceTerms.length === 0) return result;

  const contextTerms = [...prevUser, ...sourceTerms];
  // current message first (higher weight in TF-IDF), context appended
  result.query = `${message} ${message} ${contextTerms.join(" ")}`;
  result.usedContext = true;
  result.contextTerms = contextTerms;
  return result;
}

// Knowledge-boundary guard (DEF-01 / DEF-02).
// Words that only shape a question and carry no topic. Everything else must exist somewhere in the
// approved knowledge base, otherwise the question is about something Zynora has no knowledge of
// ("salary", "Kerala", "flight") and we refuse instead of returning loosely related chunks.
const GENERIC_WORDS = new Set(["long","take","work","mean","cover","happen","offer","have","has","give","gets","get","make","need","want","use","know","tell","show","explain","describe","list","name","type","kind","part","way","thing","one","ones","any","all","some","more","most","much","many","each","every","other","new","old","first","last","current","exist","exists","available","allow","include","includ","call","called","say","said","said","mention","define","tell","please","also","just","like","between","across","within","per","day","today","now","there","here","them","they","their","then","than","stage","step","process","level","unit","same","above","below","next","after","before","earlier","previous","else","another","instead","comes","come","whole","entire","ever","check","kind","item","items","largest","nobody","those","these","get","back","run","runs","running","operate","operates","available"]);
const NUMERIC_INTENT = /\b(how much|how many|percentage|percent|price|pricing|cost|fee|fees|salary|salaries|rate|amount)\b/i;
const DURATION_INTENT = /\b(how long|how much time|duration|timeline|turnaround|when will)\b/i;
const TIME_RE = /\b\d+(\s*(to|-)\s*\d+)?\s*(business\s+|working\s+)?(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b|\b(instant|instantly|immediately|real[- ]time)\b/i;

async function boundaryCheck(message, matches) {
  const vocab = await rag.knowledgeVocabulary();
  const terms = rag.tokenize(message).filter((w) => !GENERIC_WORDS.has(w) && !GENERIC_WORDS.has(w + "e") && !/^\d+$/.test(w));
  const unknown = terms.filter((w) => !vocab.has(w));
  if (unknown.length > 0) return { ok: false, reason: "UNKNOWN_TERMS", unknown };

    // Asking "how long" is only answerable if the retrieved text states a time.
  if (DURATION_INTENT.test(message) && matches && matches.length && !matches.some((m) => TIME_RE.test(m.content || ""))) {
    return { ok: false, reason: "DURATION_NOT_STATED", unknown: [] };
  }

  // Asking for a number (price, salary, percentage...) is only answerable if the retrieved text contains one.
  if (NUMERIC_INTENT.test(message) && matches && matches.length && !matches.some((m) => /\d|%/.test(m.content || ""))) {
    return { ok: false, reason: "NUMERIC_FACT_MISSING", unknown: [] };
  }
  return { ok: true };
}

function calculateConfidence(topScore) {
  if (topScore >= 0.6) return "HIGH";
  if (topScore >= rag.MIN_RELEVANCE_SCORE) return "MEDIUM";
  return "LOW";
}

async function saveHistory({
  sessionId,
  userId,
  userRole,
  message,
  answer,
  sources,
  grounded,
  confidence,
  responseTimeMs,
  flagged,
}) {
  const now = new Date().toISOString();

  await db.chatHistory.insert({
    id: generateId("CHAT"),
    sessionId,
    userId: userId || null,
    userRole: userRole || "guest",
    role: "user",
    message,
    flaggedAsInjection: Boolean(flagged),
    createdAt: now,
  });

  await db.chatHistory.insert({
    id: generateId("CHAT"),
    sessionId,
    userId: userId || null,
    userRole: userRole || "guest",
    role: "assistant",
    message: answer,
    sources: sources || [],
    grounded: Boolean(grounded),
    confidence,
    responseTimeMs: Number(responseTimeMs || 0),
    createdAt: new Date().toISOString(),
  });
}

async function saveAiQueryLog({
  sessionId,
  userId,
  userRole,
  question,
  rewrittenQuery,
  answer,
  matches,
  grounded,
  confidence,
  responseTimeMs,
  usedContext,
}) {
  await db.aiQueryLogs.insert({
    id: generateId("QLOG"),
    sessionId,
    userId: userId || null,
    userRole: userRole || "guest",
    question,
    rewrittenQuery,
    answer,
    retrievedChunks: matches.length,
    chunkDetails: matches.map((m) => ({ chunkId: m.chunkId || m.id || null, documentId: m.documentId, title: m.title, category: m.category, score: Number(m.score || 0) })),
    category: matches[0]?.category || null,
    sources: [...new Set(matches.map((m) => m.title).filter(Boolean))],
    usedContext: Boolean(usedContext),
    status: grounded && matches.length ? "ANSWERED" : "NO_ANSWER",
    similarity: Number(matches[0]?.score || 0),
    grounded: Boolean(grounded),
    confidence,
    responseTimeMs: Number(responseTimeMs || 0),
    createdAt: new Date().toISOString(),
  });
}

// split a multi-part question into separate questions.
const SPLIT_RE = /\?\s+(?:also,?\s+)?|\s+and\s+(?=(?:what|how|who|which|when|where|why|can|does|do|is|are)\b)|\.\s+(?:also,?\s+)?/i;
function splitQuestion(message) {
  const text = message.replace(/\?+\s*$/, "").trim();
  const parts = text.split(SPLIT_RE).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
  return parts.length > 1 ? parts : [message];
}

// Answer one part: search, boundary check, then build the answer or the fallback.
async function answerPart(question) {
  const retrieval = await rag.search(question.replace(/\b(what|happens?|happened)\b/gi, " "));
  const matches = retrieval.matches || [];
  let grounded = Boolean(retrieval.grounded) && matches.length > 0;
  if (grounded) {
    const bc = await boundaryCheck(question, matches);
    if (!bc.ok) grounded = false;
  }
  if (!grounded) return { question, answer: REFUSAL_MESSAGE, grounded: false, sources: [] };
  const answer = buildAnswerFromMatches(matches) || REFUSAL_MESSAGE;
  return { question, answer, grounded: answer !== REFUSAL_MESSAGE, sources: buildSources(matches) };
}

async function chat({
  message,
  userId,
  userRole,
  sessionId,
  traceId,
}) {
  await conversationService.getOwned(
    sessionId,
    userId
  );
  const startedAt = Date.now();

  if (typeof message !== "string" || !message.trim()) {
    throw badRequest("message is required.");
  }

  const cleanMessage = message.trim();
  logger.log({ module: "chat", action: "USER_QUESTION", user: userId, traceId, meta: { sessionId, length: cleanMessage.length } });

  if (cleanMessage.length > 5000) {
    throw badRequest(
      "Message is too long. Maximum 5000 characters."
    );
  }

  if (!sessionId) {
    throw badRequest("conversationId is required.");
  }

  if (detectPromptInjection(cleanMessage)) {
    const responseTimeMs = Date.now() - startedAt;

    await logAction({
      actorId: userId,
      actorRole: userRole,
      action: "PROMPT_INJECTION_ATTEMPT_BLOCKED",
      details: {
        sessionId,
        traceId,
      },
    });
    logger.log({ level: "warn", module: "security", action: "PROMPT_INJECTION_BLOCKED", status: "BLOCKED", user: userId, traceId, meta: { sessionId } });
    await db.aiQueryLogs.insert({
      id: generateId("QLOG"), sessionId, userId, userRole, question: cleanMessage, rewrittenQuery: cleanMessage,
      answer: REFUSAL_MESSAGE, retrievedChunks: 0, chunkDetails: [], sources: [], similarity: 0, grounded: false,
      confidence: "NONE", status: "BLOCKED_INJECTION", usedContext: false, responseTimeMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
    });

    await saveHistory({
      sessionId,
      userId,
      userRole,
      message: cleanMessage,
      answer: REFUSAL_MESSAGE,
      sources: [],
      grounded: false,
      confidence: "NONE",
      responseTimeMs,
      flagged: true,
    });

    return {
      answer: REFUSAL_MESSAGE,
      sources: [],
      grounded: false,
      similarity: 0,
      confidence: "NONE",
      responseTimeMs,
      sessionId,
    };
  }
// split question parts and answer each part separately, then combine the results. This is useful for multi-part questions like "What is X? And how does it relate to Y?"
  const parts = splitQuestion(cleanMessage);
  if (parts.length > 1) {
    const results = [];
    for (const p of parts) results.push(await answerPart(p));
    const anyGrounded = results.some((r) => r.grounded);
    const answer = anyGrounded
      ? results.map((r, i) => `${i + 1}. ${r.answer}`).join("\n\n")
      : REFUSAL_MESSAGE;
    const seen = new Set();
    const sources = anyGrounded
      ? results.flatMap((r) => r.sources).filter((s) => !seen.has(s.title) && seen.add(s.title))
      : [];
    const confidence = anyGrounded ? "MEDIUM" : "NONE";
    const responseTimeMs = Date.now() - startedAt;
    await saveHistory({ sessionId, userId, userRole, message: cleanMessage, answer, sources, grounded: anyGrounded, confidence, responseTimeMs, flagged: false });
    await conversationService.touch(sessionId, userId, cleanMessage);
    return { answer, sources, grounded: anyGrounded, similarity: 0, confidence, responseTimeMs, sessionId, retrievedChunks: 0, usedContext: false, parts: results };
  }


  const ctxInfo = await rewriteWithContext(sessionId, cleanMessage);
  const rewrittenQuery = ctxInfo.query;

  // Retrieve with the raw question first; for follow-ups also try the context-enriched query and
  // keep it only when it covers the user's own topic words at least as well as the raw query
  // (DEF-05: an explicit term like "Hub" must not be overridden by the previous topic).
  let retrieval = await rag.search(cleanMessage);
  let usedContext = false;
  if (ctxInfo.usedContext) {
    const topical = rag.tokenize(cleanMessage).filter((w) => !GENERIC_WORDS.has(w) && !GENERIC_WORDS.has(w + "e") && !/^\d+$/.test(w));
    const coverage = (res) => {
      if (!topical.length) return 1;
      const text = new Set(rag.tokenize((res.matches || []).map((m) => `${m.title || ""} ${m.section || ""} ${m.content || ""}`).join(" ")));
      return topical.filter((w) => text.has(w)).length / topical.length;
    };
    const rawOk = retrieval.grounded && retrieval.matches?.length;
    const enriched = await rag.search(rewrittenQuery);
    const enrichedOk = enriched.grounded && enriched.matches?.length;
    if (enrichedOk && (!rawOk || coverage(enriched) >= coverage(retrieval))) {
      retrieval = enriched; usedContext = true;
    }
  }
  if (retrieval.grounded) {
    const bc = await boundaryCheck(cleanMessage, retrieval.matches || []);
    if (!bc.ok) {
      logger.log({ module: "rag", action: "BOUNDARY_REFUSAL", status: bc.reason, user: userId, traceId, meta: { sessionId, unknown: bc.unknown } });
      retrieval = { matches: [], grounded: false, topScore: 0 };
    }
  }

  const matches = retrieval.matches || [];
  const grounded = Boolean(retrieval.grounded);
  const topScore = Number(matches[0]?.score || 0);
  const confidence = grounded
    ? calculateConfidence(topScore)
    : "NONE";

  let answer;
  let sources;

  if (!grounded || matches.length === 0) {
    answer = REFUSAL_MESSAGE;
    sources = [];
  } else {
    answer = buildAnswerFromMatches(matches);
    sources = buildSources(matches);

    if (!answer) {
      answer = REFUSAL_MESSAGE;
      sources = [];
    }
  }

  const responseTimeMs = Date.now() - startedAt;

  await saveAiQueryLog({
    sessionId,
    userId,
    userRole,
    question: cleanMessage,
    rewrittenQuery,
    answer,
    matches,
    grounded,
    confidence,
    responseTimeMs,
    usedContext,
  });

  await saveHistory({
    sessionId,
    userId,
    userRole,
    message: cleanMessage,
    answer,
    sources,
    grounded,
    confidence,
    responseTimeMs,
    flagged: false,
  });

  await conversationService.touch(sessionId, userId, cleanMessage);
  logger.log({
    module: "rag", action: "RETRIEVAL", status: matches.length ? "OK" : "NO_MATCH", user: userId, traceId,
    meta: { sessionId, chunks: matches.length, topScore, usedContext },
  });
  logger.log({
    module: "ai", action: "AI_RESPONSE", status: grounded ? "GROUNDED" : "NOT_GROUNDED", user: userId, traceId,
    meta: { sessionId, confidence, responseTimeMs },
  });

  return {
    answer,
    sources,
    grounded,
    similarity: topScore,
    confidence,
    responseTimeMs,
    sessionId,
    retrievedChunks: matches.length,
    usedContext,
    quality: {
      status: grounded && matches.length ? "ANSWERED" : "NO_ANSWER",
      retrievalFailure: matches.length === 0,
      relevance: topScore,
      confidence,
    },
  };
}

async function getHistory(sessionId, userId) {
  if (!sessionId || !userId) {
    throw badRequest("sessionId and userId are required.");
  }

  const conversation = await db.conversations.findById(sessionId);

  if (!conversation) {
    return [];
  }

  if (conversation.userId !== userId) {
    const { forbidden } = require("../lib/http-helpers");
    throw forbidden(
      "You cannot access another user's conversation."
    );
  }

  const history = await db.chatHistory.findAll({
    sessionId,
    userId,
  });

  return history.sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

module.exports = {
  chat,
  getHistory,
  detectPromptInjection,
  REFUSAL_MESSAGE,
};