const { db } = require("../db/store");
const { generateId } = require("../lib/id");

function logAction({ actorId, actorRole, action, details }) {
  const entry = {
    id: generateId("LOG"),
    actorId: actorId || "anonymous",
    actorRole: actorRole || "anonymous",
    action, 
    details: details || {},
    createdAt: new Date().toISOString(),
  };
  const promise = db.auditLogs.insert(entry).catch((err) => {
    console.error("Failed to write audit log:", err.message);
  });
  return promise; 
}

async function getRecentLogs(limit = 50) {
  const all = await db.auditLogs.findAll();
  return [...all].reverse().slice(0, limit);
}

module.exports = { logAction, getRecentLogs };
