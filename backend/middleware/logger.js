const { db } = require("../db/store");
const { generateId } = require("./id");

const SECRET_KEYS = /pass|token|secret|authorization|hash/i;

function scrub(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : scrub(v);
  }
  return out;
}

// Remove connection strings, passwords and tokens from text before it is logged.
function redactSecrets(text) {
  return String(text)
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://[REDACTED]")
    .replace(/(password|pwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;"']+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
}

function log({ level = "info", module, action, status = "OK", user = "anonymous", error = null, traceId = null, meta = {} }) {
  const entry = {
    id: generateId("SLOG"),
    timestamp: new Date().toISOString(),
    level,
    module,
    action,
    status,
    user,
    error: error ? redactSecrets(error.message || error).slice(0, 500) : null,
    traceId,
    meta: scrub(meta),
  };
  const line = JSON.stringify(entry);
  if (process.env.LOG_STDOUT !== "off") (level === "error" ? console.error : console.log)(line);
  // Fire-and-forget: logging must never break a request.
  Promise.resolve(db.systemLogs.insert({ ...entry, createdAt: entry.timestamp })).catch(() => {});
  return entry;
}

module.exports = { log, scrub };
