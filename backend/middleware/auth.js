
const { verifyToken } = require("../lib/auth");
const { unauthorized, forbidden } = require("../lib/http-helpers");

// Reads "Authorization: Bearer <token>" and returns the decoded payload,
// or null if there is no token at all (anonymous users are allowed to
// chat with Zynora - just not to manage the knowledge base).
function getAuthPayload(req) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return verifyToken(token);
}

//working for both logged in or out.
function optionalAuth(req) {
  return getAuthPayload(req); // may be null
}

// when a route REQUIRES a logged-in user.
function requireAuth(req) {
  const payload = getAuthPayload(req);
  if (!payload) throw unauthorized("Login required.");
  return payload;
}

// when a route is admin-only.
function requireAdmin(req) {
  const payload = requireAuth(req);
  if (payload.role !== "admin") throw forbidden("Admin access only.");
  return payload;
}

module.exports = { getAuthPayload, optionalAuth, requireAuth, requireAdmin };
