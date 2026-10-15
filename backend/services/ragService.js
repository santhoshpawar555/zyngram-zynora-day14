const { db } = require("../db/store");
const { STATUS } = require("./knowledgeService");
const indexSignal = require("../lib/indexSignal");
const langLib = require("../lib/lang");

const STOPWORDS = new Set([
  "the", "is", "a", "an", "and", "or", "of", "to", "in", "on", "for",
  "it", "this", "that", "are", "was", "were", "be", "been", "with",
  "as", "at", "by", "from", "do", "does", "did", "can", "could",
  "will", "would", "what", "how", "why", "who", "when", "where",
  "i", "my", "me", "you", "your", "we", "our", "us", "please",
  "tell", "about", "which"
]);

const MIN_RELEVANCE_SCORE = 0.35;
const TOP_K = 3;
const MIN_RELATIVE_SCORE = 0.70;

/*
 * Detect the intent of the user's question.
 *
 * This is still keyword-based RAG.
 * We are only adding query-intent signals so that
 * "what is Zyngram" does not prefer a founder FAQ.
 */
function detectQueryIntent(query) {
  const text = (query || "").toLowerCase().trim();

  if (
    /\bwho\s+(is|was)\b/.test(text) &&
    /\bfounder\b/.test(text)
  ) {
    return "FOUNDER";
  }

  if (
    /\bfounder\b/.test(text) ||
    /\bstarted\s+by\b/.test(text) ||
    /\bstarted\s+zyngram\b/.test(text)
  ) {
    return "FOUNDER";
  }

  if (
    /\bwhat\s+is\b/.test(text) ||
    /\bwhat\s+does\b/.test(text) ||
    /\bwhat\s+are\b/.test(text) ||
    /\btell\s+me\s+about\b/.test(text) ||
    /\babout\s+zyngram\b/.test(text)
  ) {
    return "GENERAL";
  }

  if (
    /\bcommission\b/.test(text)
  ) {
    return "COMMISSION";
  }

  if (
    /\bpricing\b/.test(text) ||
    /\bprice\b/.test(text) ||
    /\bcost\b/.test(text)
  ) {
    return "PRICING";
  }

  if (
    /\bservice\b/.test(text) ||
    /\bservices\b/.test(text)
  ) {
    return "SERVICE";
  }

  return "GENERAL";
}

// Light suffix stemmer (DEF-04): "calculates"/"calculated"/"calculate" -> "calculat",
// "settles"/"settled" -> "settl". Applied identically to queries and chunks.
function stem(word) {
  if (word.length <= 4 || /^\d+$/.test(word)) return word;
  let w = word;
  if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  else if (w.endsWith("e")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("y")) w = w.slice(0, -1);
  return w.length >= 3 ? w : word;
}

function stemFor(word, lang) {
  return lang === "en" ? stem(word) : langLib.stemNonEnglish(word, lang);
}

// lang = "en" keeps the original English behaviour byte-for-byte; hi/te use a Unicode-aware tokenizer.
function tokenize(text, lang = "en") {
  let t = (text || "").toLowerCase();
  let stop = STOPWORDS;
  if (lang === "en") {
    t = t
      .replace(/around the clock/g, "24 hours")
      .replace(/office timings?/g, "working hours")
      .replace(/money back/g, "refund")
      .replace(/[^a-z0-9\s]/g, " ");
  } else {
    // keep letters, combining marks (matras / virama) and digits
    t = t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ");
    stop = langLib.stopwordsFor(lang);
  }
  return t
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stop.has(word))
    .map((word) => stemFor(word, lang));
}

const chunkLang = (c) => c.language || "en"; // documents created before multi-language support are English

// Vocabulary of the approved (ACTIVE) knowledge base, cached by chunk count + newest update.
let vocabCache = { key: null, set: null };
async function knowledgeVocabulary(lang = "en") {
  const chunks = (await getActiveChunks()).filter((c) => chunkLang(c) === lang);
  const key = lang + "|" + chunks.length + ":" + chunks.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), "");
  if (vocabCache.key !== key) {
    const set = new Set();
    for (const c of chunks) for (const w of tokenize([c.content, c.title, c.section].filter(Boolean).join(" "), lang)) set.add(w);
    vocabCache = { key, set };
  }
  return vocabCache.set;
}

function versionNumber(v) {
  const m = String(v || "").match(/\d+(\.\d+)*/);
  return m ? m[0].split(".").reduce((acc, n, i) => acc + Number(n) / Math.pow(1000, i), 0) : 0;
}

// DEF-03: when several ACTIVE documents share a title (e.g. "Refund Policy" v1 and v2),
// only the newest version is retrievable, so superseded text can never be served.
async function loadActiveChunks() {
  const chunks = await db.knowledgeChunks.findAll({ status: STATUS.ACTIVE });
  const newest = new Map();
  for (const c of chunks) {
    const key = chunkLang(c) + "|" + (c.title || "").trim().toLowerCase();
    const v = versionNumber(c.version);
    if (!newest.has(key) || v > newest.get(key)) newest.set(key, v);
  }
  return chunks.filter((c) => versionNumber(c.version) === newest.get(chunkLang(c) + "|" + (c.title || "").trim().toLowerCase()));
}
// Day 14: cache the approved chunks in memory; reload when knowledge changes or after 60 s.
let activeCache = { v: -1, at: 0, chunks: null };
async function getActiveChunks() {
  const v = indexSignal.current();
  if (activeCache.chunks && activeCache.v === v && Date.now() - activeCache.at < 60000) return activeCache.chunks;
  const chunks = await loadActiveChunks();
  activeCache = { v, at: Date.now(), chunks };
  return chunks;
}
const dfCache = new Map();
function buildDocFrequency(chunks) {
  const key = require("crypto").createHash("md5").update(chunks.map((c) => c.id + (c.updatedAt || "")).join(",")).digest("hex");
  if (dfCache.has(key)) return dfCache.get(key); // PERF-2: reuse until the active chunk set changes
  const docFreq = new Map();
  for (const chunk of chunks) {
    const f = getFieldText(chunk);
    for (const word of new Set([...f.content, ...f.title, ...f.section])) {
      docFreq.set(word, (docFreq.get(word) || 0) + 1);
    }
  }
  if (dfCache.size > 20) dfCache.clear();
  dfCache.set(key, docFreq);
  return docFreq;
}

/*
 * Give extra weight to words appearing in title/section.
 *
 * Example:
 *
 * Query: "what is zyngram"
 *
 * A document titled:
 * "About Zyngram"
 *
 * should normally be preferred over:
 * "Who is the founder of Zyngram?"
 */
// PERF-1: tokenizing every chunk on every query was O(KB size) CPU. Cache per chunk version.
const fieldCache = new Map();
function getFieldText(chunk) {
  const key = chunk.id + "|" + (chunk.updatedAt || chunk.createdAt || "");
  let f = fieldCache.get(key);
  if (!f) {
    const L = chunkLang(chunk);
    f = { content: tokenize(chunk.content, L), title: tokenize(chunk.title, L), section: tokenize(chunk.section, L) };
    if (fieldCache.size > 50000) fieldCache.clear();
    fieldCache.set(key, f);
  }
  return f;
}

function scoreChunk(
  chunk,
  queryWords,
  docFreq,
  totalChunks,
  queryIntent
) {
  const fields = getFieldText(chunk);

  const contentCounts = new Map();
  const titleCounts = new Map();
  const sectionCounts = new Map();

  for (const word of fields.content) {
    contentCounts.set(
      word,
      (contentCounts.get(word) || 0) + 1
    );
  }

  for (const word of fields.title) {
    titleCounts.set(
      word,
      (titleCounts.get(word) || 0) + 1
    );
  }

  for (const word of fields.section) {
    sectionCounts.set(
      word,
      (sectionCounts.get(word) || 0) + 1
    );
  }

  let score = 0;

  for (const queryWord of queryWords) {
    const chunksContainingWord =
      docFreq.get(queryWord) || 1;

    const idf =
      Math.log(
        (totalChunks + 1) /
          chunksContainingWord
      ) + 1;

    const contentFrequency =
      contentCounts.get(queryWord) || 0;

    const titleFrequency =
      titleCounts.get(queryWord) || 0;

    const sectionFrequency =
      sectionCounts.get(queryWord) || 0;

    /*
     * Content = normal weight
     * Title = stronger signal
     * Section = stronger signal
     */
    score +=
      contentFrequency * idf;

    score +=
      titleFrequency * idf * 2.5;

    score +=
      sectionFrequency * idf * 2;
  }

  /*
   * Intent-based bonus / penalty.
   *
   * GENERAL:
   * Prefer general/company documents.
   * Penalize obvious founder documents.
   *
   * FOUNDER:
   * Prefer founder documents.
   *
   * COMMISSION:
   * Prefer commission documents.
   *
   * This prevents common words such as "Zyngram"
   * from dominating the result.
   */

  const metadata = [
    chunk.title,
    chunk.section,
    chunk.category,
    chunk.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (queryIntent === "GENERAL") {
    if (
      /\bfounder\b|\bwho is\b/.test(metadata)
    ) {
      score *= 0.45;
    }

    if (
      /\babout\b|\boverview\b|\bcompany\b|\bzyngram\b/.test(
        metadata
      )
    ) {
      score *= 1.35;
    }
  }

  if (queryIntent === "FOUNDER") {
    if (
      /\bfounder\b|\bwho is\b|\bstarted by\b/.test(
        metadata
      )
    ) {
      score *= 2.5;
    }
  }

  if (queryIntent === "COMMISSION") {
    if (/\bcommission\b/.test(metadata)) {
      score *= 2;
    }
  }

  if (queryIntent === "PRICING") {
    if (
      /\bpricing\b|\bprice\b|\bcost\b|\bfee\b/.test(
        metadata
      )
    ) {
      score *= 2;
    }
  }

  if (queryIntent === "SERVICE") {
    if (
      /\bservice\b|\bservices\b/.test(metadata)
    ) {
      score *= 2;
    }
  }

  const totalWords =
    fields.content.length +
    fields.title.length +
    fields.section.length;

  return totalWords
    ? score / Math.sqrt(totalWords)
    : 0;
}

async function search(query, language = "en") {
  // only chunks written in the user's language are searched (no translation, no guessing)
  const activeChunks = (await getActiveChunks()).filter((c) => chunkLang(c) === language);

  if (activeChunks.length === 0) {
    return {
      matches: [],
      grounded: false,
      topScore: 0,
    };
  }

  const queryWords = tokenize(query, language);

  if (queryWords.length === 0) {
    return {
      matches: [],
      grounded: false,
      topScore: 0,
    };
  }

  const queryIntent = language === "en" ? detectQueryIntent(query) : "NONE"; // intent rules are English-only

  const docFreq =
    buildDocFrequency(activeChunks);

  const scored = activeChunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(
        chunk,
        queryWords,
        docFreq,
        activeChunks.length,
        queryIntent
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      matches: [],
      grounded: false,
      topScore: 0,
    };
  }

  const candidates =
    scored.slice(0, TOP_K);

  const topScore =
    candidates[0].score;

  const relevant =
    candidates.filter(
      (item) =>
        item.score >= MIN_RELEVANCE_SCORE &&
        item.score >=
          topScore * MIN_RELATIVE_SCORE
    );

  const matches =
    relevant.map((item) => ({
      ...item.chunk,
      score:
        Math.round(item.score * 1000) / 1000,
    }));

  return {
    matches,
    grounded: matches.length > 0,
    topScore:
      Math.round(topScore * 1000) / 1000,
  };
}

module.exports = {
  search,
  knowledgeVocabulary,
  stem,
  tokenize,
  MIN_RELEVANCE_SCORE,
  TOP_K,
  MIN_RELATIVE_SCORE,
};