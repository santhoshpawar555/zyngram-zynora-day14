require("./lib/dotenv-lite-load")();
const http = require("http");
const url = require("url");
const crypto = require("crypto");
const { Router } = require("./lib/router");
const { readJsonBody, sendJson, HttpError } = require("./lib/http-helpers");
const { connectDb, usingMongo } = require("./db/store");
const { seedAll } = require("./db/seed");
const logger = require("./lib/logger");
const rateLimit = require("./lib/rateLimit");
const { getAuthPayload } = require("./middleware/auth");

const VERSION = require("./package.json").version;
const PORT = process.env.PORT || 5050;
const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD && (!process.env.ZYNORA_SECRET || process.env.ZYNORA_SECRET.includes("dev-secret"))) {
  console.error("FATAL: set a strong ZYNORA_SECRET in production.");
  process.exit(1);
}

const fs = require("fs");
const path = require("path");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".js": "text/javascript", ".css": "text/css" };

// Serves the frontend from the same origin so one production URL covers UI + API.
function serveStatic(req, res, pathname) {
  if (req.method !== "GET" || pathname.startsWith("/api/")) return false;
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(FRONTEND_DIR, rel));
  if (!file.startsWith(FRONTEND_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
  fs.createReadStream(file).pipe(res);
  return true;
}

const router = new Router();
require("./routes/authRoutes")(router);
require("./routes/knowledgeRoutes")(router);
require("./routes/zynoraRoutes")(router);
require("./routes/conversationRoutes")(router);
require("./routes/monitoringRoutes")(router);

// Rate limits (per IP). Tunable via env.
const limits = () => ({
  general: Number(process.env.RATE_LIMIT_PER_MIN || 120),
  login: Number(process.env.RATE_LIMIT_LOGIN_PER_MIN || 10),
  chat: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30),
});

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().split(",")[0].trim();
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const incoming = req.headers["x-request-id"];
  const traceId = typeof incoming === "string" && /^[\w-]{6,64}$/.test(incoming) ? incoming : "REQ_" + crypto.randomBytes(6).toString("hex");
  const hdr = { "X-Request-Id": traceId };

  if (req.method === "OPTIONS") return sendJson(res, 204, {}, hdr);

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  if (serveStatic(req, res, pathname)) return;
  const ip = clientIp(req);
  const payload = getAuthPayload(req);
  const user = payload ? payload.userId : "anonymous";

  const finish = (status, body, err) => {
    sendJson(res, status, body, hdr);
    if (pathname === "/api/health") return;
    logger.log({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      module: "api", action: `${req.method} ${pathname}`,
      status: String(status), user, error: err, traceId,
      meta: { ms: Date.now() - startedAt, ip },
    });
    if (status === 401 || status === 403) {
      logger.log({ level: "warn", module: "auth", action: "AUTH_FAILURE", status: String(status), user, error: body.error, traceId, meta: { path: pathname, ip } });
    }
  };

  // --- abuse protection ---
  const L = limits();
  const gen = rateLimit.check("general", ip, L.general, 60_000);
  let limited = !gen.allowed;
  if (!limited && pathname === "/api/auth/login") limited = !rateLimit.check("login", ip, L.login, 60_000).allowed;
  if (!limited && pathname === "/api/zynora/chat") limited = !rateLimit.check("chat", payload ? payload.userId : ip, L.chat, 60_000).allowed;
  if (limited) {
    hdr["Retry-After"] = String(gen.retryAfterSec || 60);
    return finish(429, { error: "Too many requests. Please slow down." });
  }

  const matched = router.match(req.method, pathname);
  if (!matched) return finish(404, { error: `No route for ${req.method} ${pathname}` });

  try {
    const body = req.method === "GET" ? {} : await readJsonBody(req);
    const ctx = { req, res, params: matched.params, query: parsedUrl.query, body, traceId };
    const result = await matched.handler(ctx);
    finish(result.status, result.body);
  } catch (err) {
    if (err instanceof HttpError) {
      finish(err.statusCode, { error: err.message, traceId });
    } else {
      console.error("Unexpected error:", err);
      finish(500, { error: "Internal server error.", traceId }, err);
    }
  }
});

async function start() {
  try {
    await connectDb();
  } catch (err) {
    console.error("Could not connect to the database:", err.message);
    process.exit(1);
  }
  await seedAll();
  server.listen(PORT, () => {
    console.log(`Zynora backend v${VERSION} running on http://localhost:${PORT}`);
    console.log(`Data store: ${usingMongo ? "MongoDB Atlas" : "local JSON files"}`);
    logger.log({ module: "system", action: "SERVER_STARTED", meta: { version: VERSION, port: PORT, store: usingMongo ? "mongodb" : "json" } });
  });
}

if (require.main === module) start();

module.exports = { server, start, router };
