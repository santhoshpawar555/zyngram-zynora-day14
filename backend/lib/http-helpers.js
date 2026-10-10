

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      if (tooBig) return; // keep draining so the 413 response can be delivered
      raw += chunk;
      if (raw.length > 200_000) {
        tooBig = true;
        raw = "";
        reject(new HttpError("Request body too large.", 413));
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new HttpError("Invalid JSON in request body.", 400));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "X-Request-Id",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(text);
}

// A small custom Error subclass so controllers can `throw httpError(...)`
// and one place in server.js turns it into the right JSON response.
class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 400;
  }
}

function badRequest(message, statusCode = 400) {
  return new HttpError(message, statusCode);
}
function unauthorized(message = "Unauthorized.") {
  return new HttpError(message, 401);
}
function forbidden(message = "Forbidden.") {
  return new HttpError(message, 403);
}
function notFound(message = "Not found.") {
  return new HttpError(message, 404);
}
function tooManyRequests(message = "Too many requests. Please slow down.") {
  return new HttpError(message, 429);
}
function conflict(message) {
  return new HttpError(message, 409);
}

module.exports = {
  readJsonBody,
  sendJson,
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
};
