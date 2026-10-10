// Database migration v1.0 -> v1.1 (idempotent, safe to run twice).
//  1. conversations: add messageCount, status
//  2. aiQueryLogs: backfill status/usedContext/chunkDetails/sources
//  3. orphan chat sessions (no conversation row) are reported, never deleted
//  4. MongoDB: ensure indexes (incl. new systemLogs collection)
//  5. JSON backup of touched collections in ./backups/<timestamp>/ + audit record
// Usage: node scripts/migrate-v1.0-to-v1.1.js [--dry-run]
require("../lib/dotenv-lite-load")();
const fs = require("fs"), path = require("path");
const { db, connectDb, usingMongo } = require("../db/store");

const DRY = process.argv.includes("--dry-run");

(async () => {
  await connectDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "..", "backups", stamp);
  const convs = await db.conversations.findAll();
  const logs = await db.aiQueryLogs.findAll();
  const chats = await db.chatHistory.findAll();

  if (!DRY) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "conversations.json"), JSON.stringify(convs, null, 2));
    fs.writeFileSync(path.join(backupDir, "aiQueryLogs.json"), JSON.stringify(logs, null, 2));
    fs.writeFileSync(path.join(backupDir, "chatHistory.json"), JSON.stringify(chats, null, 2));
    console.log("Backup written to", backupDir);
  }

  let c1 = 0, c2 = 0;
  for (const c of convs) {
    const patch = {};
    if (c.messageCount === undefined) patch.messageCount = chats.filter((m) => m.sessionId === c.id).length;
    if (!c.status) patch.status = "ACTIVE";
    if (Object.keys(patch).length) { c1++; if (!DRY) await db.conversations.update(c.id, patch); }
  }
  for (const l of logs) {
    const patch = {};
    if (l.status === undefined) patch.status = l.grounded ? "ANSWERED" : "NO_ANSWER";
    if (l.usedContext === undefined) patch.usedContext = Boolean(l.rewrittenQuery && l.rewrittenQuery !== l.question);
    if (!l.chunkDetails) patch.chunkDetails = [];
    if (!l.sources) patch.sources = [];
    if (Object.keys(patch).length) { c2++; if (!DRY) await db.aiQueryLogs.update(l.id, patch); }
  }
  const convIds = new Set(convs.map((c) => c.id));
  const orphans = new Set(chats.filter((m) => !convIds.has(m.sessionId)).map((m) => m.sessionId));

  if (usingMongo && !DRY) {
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI); await client.connect();
    const d = client.db(process.env.MONGODB_DB_NAME || "zynora");
    await d.collection("conversations").createIndex({ userId: 1, updatedAt: -1 });
    await d.collection("chatHistory").createIndex({ sessionId: 1, createdAt: 1 });
    await d.collection("aiQueryLogs").createIndex({ createdAt: 1 });
    await d.collection("systemLogs").createIndex({ timestamp: -1 });
    await d.collection("systemLogs").createIndex({ traceId: 1 });
    await client.close();
    console.log("MongoDB indexes ensured.");
  }
  if (!DRY) await db.auditLogs.insert({ id: "MIG_" + stamp, actorId: "system", actorRole: "system", action: "DB_MIGRATION_1_0_TO_1_1", details: { conversationsUpdated: c1, queryLogsUpdated: c2, orphanSessions: orphans.size }, createdAt: new Date().toISOString() });
  console.log(`${DRY ? "[dry-run] " : ""}conversations updated: ${c1}, aiQueryLogs updated: ${c2}, orphan chat sessions (left untouched): ${orphans.size}`);
  console.log("Migration complete.");
  process.exit(0);
})().catch((e) => { console.error("Migration FAILED:", e.message); process.exit(1); });
