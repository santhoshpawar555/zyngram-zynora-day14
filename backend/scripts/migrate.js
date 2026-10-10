require("../lib/dotenv-lite-load")();

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "zynora";

const DRY_RUN = process.argv.includes("--dry-run");

if (!MONGODB_URI) {
  console.error("Migration FAILED: MONGODB_URI is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------

const DATA_DIR =
  process.env.ZYNORA_DATA_DIR ||
  path.join(__dirname, "..", "db", "data-files");

const COLLECTIONS = [
  "users",
  "knowledgeDocuments",
  "knowledgeChunks",
  "chatHistory",
  "auditLogs",
  "conversations",
  "aiQueryLogs",
  "systemLogs",
];

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function filePathFor(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function readJsonFile(collection) {
  const file = filePathFor(collection);

  if (!fs.existsSync(file)) {
    return {
      exists: false,
      file,
      rows: [],
    };
  }

  try {
    const raw = fs.readFileSync(file, "utf8").trim();

    if (!raw) {
      return {
        exists: true,
        file,
        rows: [],
      };
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("JSON root is not an array");
    }

    return {
      exists: true,
      file,
      rows: parsed,
    };
  } catch (err) {
    throw new Error(
      `Cannot read ${file}: ${err.message}`
    );
  }
}

function uniqueById(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!row || !row.id) {
      continue;
    }

    if (!map.has(row.id)) {
      map.set(row.id, row);
    }
  }

  return [...map.values()];
}

function ensureBackupDir() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupDir = path.join(
    __dirname,
    "..",
    "backups",
    `json-to-mongo-${stamp}`
  );

  fs.mkdirSync(backupDir, { recursive: true });

  return backupDir;
}

// ---------------------------------------------------------------------
// MONGODB
// ---------------------------------------------------------------------

let client;

async function connectMongo() {
  client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  });

  await client.connect();

  const db = client.db(DB_NAME);

  console.log(
    `Connected to MongoDB Atlas (database: "${DB_NAME}").`
  );

  return db;
}

// ---------------------------------------------------------------------
// INDEXES
// ---------------------------------------------------------------------

async function ensureIndexes(db) {
  if (DRY_RUN) {
    console.log("[dry-run] MongoDB indexes will be ensured.");
    return;
  }

  console.log("Ensuring MongoDB indexes...");

  await db.collection("users").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("knowledgeDocuments").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("knowledgeChunks").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("chatHistory").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("chatHistory").createIndex(
    { sessionId: 1, createdAt: 1 }
  );

  await db.collection("auditLogs").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("conversations").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("conversations").createIndex({
    userId: 1,
    updatedAt: -1,
  });

  await db.collection("aiQueryLogs").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("aiQueryLogs").createIndex({
    createdAt: 1,
  });

  await db.collection("systemLogs").createIndex(
    { id: 1 },
    { unique: true }
  );

  await db.collection("systemLogs").createIndex({
    timestamp: -1,
  });

  await db.collection("systemLogs").createIndex({
    traceId: 1,
  });

  console.log("MongoDB indexes ensured.");
}

// ---------------------------------------------------------------------
// JSON BACKUP
// ---------------------------------------------------------------------

function backupJsonFiles() {
  const backupDir = ensureBackupDir();

  let backedUp = 0;

  for (const collection of COLLECTIONS) {
    const source = filePathFor(collection);

    if (!fs.existsSync(source)) {
      continue;
    }

    const destination = path.join(
      backupDir,
      `${collection}.json`
    );

    fs.copyFileSync(source, destination);
    backedUp++;

    console.log(
      `Backup: ${collection}.json`
    );
  }

  console.log(
    `JSON backup complete: ${backedUp} file(s)`
  );

  return backupDir;
}

// ---------------------------------------------------------------------
// MIGRATION
// ---------------------------------------------------------------------

async function migrateCollection(db, collectionName) {
  const result = readJsonFile(collectionName);

  if (!result.exists) {
    console.log(
      `${collectionName}: JSON file not found - skipped.`
    );

    return {
      collection: collectionName,
      jsonRows: 0,
      uniqueRows: 0,
      inserted: 0,
      skipped: 0,
    };
  }

  const rows = uniqueById(result.rows);

  if (rows.length === 0) {
    console.log(
      `${collectionName}: 0 records - skipped.`
    );

    return {
      collection: collectionName,
      jsonRows: result.rows.length,
      uniqueRows: 0,
      inserted: 0,
      skipped: 0,
    };
  }

  const collection = db.collection(collectionName);

  const ids = rows.map((row) => row.id);

  let existingIds = new Set();

  if (!DRY_RUN) {
    const existing = await collection
      .find(
        { id: { $in: ids } },
        { projection: { id: 1, _id: 0 } }
      )
      .toArray();

    existingIds = new Set(
      existing.map((row) => row.id)
    );
  }

  const toInsert = rows.filter(
    (row) => !existingIds.has(row.id)
  );

  const skipped = rows.length - toInsert.length;

  if (DRY_RUN) {
    console.log(
      `[dry-run] ${collectionName}: ` +
      `${rows.length} JSON record(s), ` +
      `${rows.length} candidate(s), ` +
      `no records inserted.`
    );

    return {
      collection: collectionName,
      jsonRows: result.rows.length,
      uniqueRows: rows.length,
      inserted: 0,
      skipped: 0,
    };
  }

  if (toInsert.length > 0) {
    try {
      await collection.insertMany(
        toInsert.map((row) => ({ ...row })),
        { ordered: false }
      );
    } catch (err) {
      // If a duplicate appears because another process inserted
      // concurrently, continue. Other records are still inserted.
      if (err.code !== 11000) {
        throw err;
      }
    }
  }

  console.log(
    `${collectionName}: ` +
    `JSON=${result.rows.length}, ` +
    `unique=${rows.length}, ` +
    `inserted=${toInsert.length}, ` +
    `skipped=${skipped}`
  );

  return {
    collection: collectionName,
    jsonRows: result.rows.length,
    uniqueRows: rows.length,
    inserted: toInsert.length,
    skipped,
  };
}

// ---------------------------------------------------------------------
// V1.1 BACKFILL
// ---------------------------------------------------------------------

async function backfillV11(db) {
  if (DRY_RUN) {
    console.log(
      "[dry-run] v1.1 backfill would run."
    );
    return {
      conversationsUpdated: 0,
      aiQueryLogsUpdated: 0,
      orphanSessions: 0,
    };
  }

  const conversations = await db
    .collection("conversations")
    .find({})
    .toArray();

  const chats = await db
    .collection("chatHistory")
    .find({})
    .toArray();

  const logs = await db
    .collection("aiQueryLogs")
    .find({})
    .toArray();

  // ---------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------

  const messageCountMap = new Map();

  for (const message of chats) {
    if (!message.sessionId) continue;

    messageCountMap.set(
      message.sessionId,
      (messageCountMap.get(message.sessionId) || 0) + 1
    );
  }

  let conversationsUpdated = 0;

  for (const conversation of conversations) {
    const patch = {};

    if (conversation.messageCount === undefined) {
      patch.messageCount =
        messageCountMap.get(conversation.id) || 0;
    }

    if (!conversation.status) {
      patch.status = "ACTIVE";
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date().toISOString();

      await db.collection("conversations").updateOne(
        { id: conversation.id },
        { $set: patch }
      );

      conversationsUpdated++;
    }
  }

  // ---------------------------------------------------------------
  // AI QUERY LOGS
  // ---------------------------------------------------------------

  let aiQueryLogsUpdated = 0;

  for (const log of logs) {
    const patch = {};

    if (log.status === undefined) {
      patch.status = log.grounded
        ? "ANSWERED"
        : "NO_ANSWER";
    }

    if (log.usedContext === undefined) {
      patch.usedContext = Boolean(
        log.rewrittenQuery &&
        log.rewrittenQuery !== log.question
      );
    }

    if (!log.chunkDetails) {
      patch.chunkDetails = [];
    }

    if (!log.sources) {
      patch.sources = [];
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date().toISOString();

      await db.collection("aiQueryLogs").updateOne(
        { id: log.id },
        { $set: patch }
      );

      aiQueryLogsUpdated++;
    }
  }

  // ---------------------------------------------------------------
  // ORPHAN CHAT SESSIONS
  // ---------------------------------------------------------------

  const conversationIds = new Set(
    conversations.map((c) => c.id)
  );

  const orphanSessions = new Set(
    chats
      .filter(
        (message) =>
          message.sessionId &&
          !conversationIds.has(message.sessionId)
      )
      .map((message) => message.sessionId)
  );

  return {
    conversationsUpdated,
    aiQueryLogsUpdated,
    orphanSessions: orphanSessions.size,
  };
}

// ---------------------------------------------------------------------
// MIGRATION MARKER
// ---------------------------------------------------------------------

async function alreadyMigrated(db) {
  const marker = await db
    .collection("auditLogs")
    .findOne({
      action: "JSON_TO_MONGODB_MIGRATION_V1",
    });

  return !!marker;
}

// ---------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------

async function writeAudit(db, details) {
  if (DRY_RUN) return;

  const now = new Date().toISOString();

  await db.collection("auditLogs").updateOne(
    {
      action: "JSON_TO_MONGODB_MIGRATION_V1",
    },
    {
      $setOnInsert: {
        id:
          "MIG_JSON_TO_MONGO_" +
          now.replace(/[^0-9]/g, ""),
        actorId: "system",
        actorRole: "system",
        action: "JSON_TO_MONGODB_MIGRATION_V1",
        details,
        createdAt: now,
      },
    },
    {
      upsert: true,
    }
  );
}

// ---------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------

(async () => {
  try {
    console.log("");
    console.log("==============================================");
    console.log(" Zynora JSON -> MongoDB Migration v1.0 -> v1.1");
    console.log("==============================================");
    console.log("");

    if (DRY_RUN) {
      console.log("MODE: DRY RUN");
    } else {
      console.log("MODE: LIVE MIGRATION");
    }

    console.log(`MongoDB database: ${DB_NAME}`);
    console.log(`JSON data directory: ${DATA_DIR}`);
    console.log("");

    const db = await connectMongo();

    // ---------------------------------------------------------------
    // Prevent duplicate migration
    // ---------------------------------------------------------------

    if (!DRY_RUN) {
      const migrated = await alreadyMigrated(db);

      if (migrated) {
        console.log(
          "Migration marker already exists."
        );

        console.log(
          "JSON -> MongoDB migration has already been completed."
        );

        console.log(
          "No migration performed. Existing MongoDB data preserved."
        );

        await client.close();
        process.exit(0);
      }
    }

    // ---------------------------------------------------------------
    // Backup
    // ---------------------------------------------------------------

    let backupDir = null;

    if (!DRY_RUN) {
      backupDir = backupJsonFiles();
      console.log("");
    }

    // ---------------------------------------------------------------
    // Collections
    // ---------------------------------------------------------------

    const results = [];

    for (const collectionName of COLLECTIONS) {
      const result = await migrateCollection(
        db,
        collectionName
      );

      results.push(result);
    }

    console.log("");

    // ---------------------------------------------------------------
    // V1.1 backfill
    // ---------------------------------------------------------------

    const backfill = await backfillV11(db);

    console.log(
      `conversations updated: ${backfill.conversationsUpdated}`
    );

    console.log(
      `aiQueryLogs updated: ${backfill.aiQueryLogsUpdated}`
    );

    console.log(
      `orphan chat sessions: ${backfill.orphanSessions}`
    );

    console.log("");

    // ---------------------------------------------------------------
    // Indexes
    // ---------------------------------------------------------------

    await ensureIndexes(db);

    // ---------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------

    const totals = results.reduce(
      (acc, result) => {
        acc.jsonRows += result.jsonRows;
        acc.uniqueRows += result.uniqueRows;
        acc.inserted += result.inserted;
        acc.skipped += result.skipped;

        return acc;
      },
      {
        jsonRows: 0,
        uniqueRows: 0,
        inserted: 0,
        skipped: 0,
      }
    );

    if (!DRY_RUN) {
      await writeAudit(db, {
        migration: "v1.0 -> v1.1",
        type: "JSON_TO_MONGODB",
        database: DB_NAME,
        dataDirectory: DATA_DIR,
        backupDir,
        totals,
        collections: results,
        conversationsUpdated:
          backfill.conversationsUpdated,
        aiQueryLogsUpdated:
          backfill.aiQueryLogsUpdated,
        orphanSessions:
          backfill.orphanSessions,
      });
    }

    // ---------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------

    console.log("");
    console.log("==============================================");
    console.log(" Migration Summary");
    console.log("==============================================");

    for (const result of results) {
      console.log(
        `${result.collection}: ` +
        `inserted=${result.inserted}, ` +
        `skipped=${result.skipped}`
      );
    }

    console.log("----------------------------------------------");

    console.log(
      `Total JSON records: ${totals.jsonRows}`
    );

    console.log(
      `Total unique records: ${totals.uniqueRows}`
    );

    console.log(
      `Total inserted: ${totals.inserted}`
    );

    console.log(
      `Total skipped: ${totals.skipped}`
    );

    console.log("");

    if (DRY_RUN) {
      console.log(
        "[dry-run] No MongoDB documents were inserted or modified."
      );
    } else {
      console.log(
        "Migration completed successfully."
      );

      console.log(
        "Migration marker created. Running this migration again will NOT duplicate data."
      );
    }

    console.log("");

    await client.close();
    process.exit(0);
  } catch (err) {
    console.error("");
    console.error("==============================================");
    console.error(" Migration FAILED");
    console.error("==============================================");
    console.error(err);
    console.error("");

    if (client) {
      try {
        await client.close();
      } catch {}
    }

    process.exit(1);
  }
})();