
const fs = require("fs");
const path = require("path");
//const { MongoClient } = require("mongodb");


const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "zynora";

const DATA_DIR = process.env.ZYNORA_DATA_DIR || path.join(__dirname, "data-files");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });


function matchesFilter(row, filter) {
  if (!filter) return true;
  return Object.keys(filter).every((key) => row[key] === filter[key]);
}


class JsonTable {
  constructor(name) {
    this.name = name;
    this.filePath = path.join(DATA_DIR, `${name}.json`);
    this.rows = [];
    this._load();
  }

  _load() {
    if (fs.existsSync(this.filePath)) {
      try {
        this.rows = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      } catch {
        this.rows = [];
      }
    }
  }

  // PERF-3: the JSON dev store rewrote the whole file synchronously on every insert, blocking the
  // event loop (100 concurrent chats = ~1 s). Writes are now coalesced (<=1 write per 100 ms,
  // atomic temp-file + rename) and flushed on exit. MongoDB (production) is unaffected.
  _save() {
    if (this._timer) return;
    this._timer = setTimeout(() => this._flush(), 100);
    this._timer.unref();
    JsonTable.pending.add(this);
  }

  _flush() {
    clearTimeout(this._timer); this._timer = null;
    JsonTable.pending.delete(this);
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.rows));
    fs.renameSync(tmp, this.filePath);
  }

  async insert(row) {
    this.rows.push(row);
    this._save();
    return row;
  }

  async insertMany(rows) {
    this.rows.push(...rows);
    this._save();
    return rows;
  }

  async findById(id) {
    return this.rows.find((r) => r.id === id) || null;
  }

  async findOne(filter) {
    return this.rows.find((r) => matchesFilter(r, filter)) || null;
  }

  async findAll(filter) {
    return filter ? this.rows.filter((r) => matchesFilter(r, filter)) : [...this.rows];
  }

  async update(id, patch) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    this._save();
    return row;
  }

  async updateMany(filter, patch) {
    const matched = this.rows.filter((r) => matchesFilter(r, filter));
    matched.forEach((r) => Object.assign(r, patch, { updatedAt: new Date().toISOString() }));
    this._save();
    return matched.length;
  }

  async deleteById(id) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    this._save();
    return this.rows.length < before;
  }

  async deleteMany(filter) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matchesFilter(r, filter));
    this._save();
    return before - this.rows.length;
  }
}

JsonTable.pending = new Set();
process.on("exit", () => { for (const t of [...JsonTable.pending]) { try { t._flush(); } catch {} } });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));

// ---------------------------------------------------------------------
// BACKEND 2: real MongoDB, via the official `mongodb` npm driver.
// Only ever require()'d if MONGODB_URI is actually set, so this sandbox
// (which has neither the package nor network access to Atlas) never
// tries to load it and never crashes because of it.
// ---------------------------------------------------------------------
let mongoClientPromise = null;

function getMongoDb() {
  if (!mongoClientPromise) {
    // Lazy require - only reached when MONGODB_URI is set, i.e. only on
    // a machine that ran `npm install` for real.
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(MONGODB_URI);
    mongoClientPromise = client.connect().then(() => {
      console.log(`Connected to MongoDB Atlas (database: "${MONGODB_DB_NAME}").`);
      return client.db(MONGODB_DB_NAME);
    });
  }
  return mongoClientPromise;
}

class MongoTable {
  constructor(name) {
    this.name = name;
  }

  async _collection() {
    const database = await getMongoDb();
    return database.collection(this.name);
  }

  async insert(row) {
    const collection = await this._collection();
    await collection.insertOne({ ...row });
    return row;
  }

  async insertMany(rows) {
    if (rows.length === 0) return rows;
    const collection = await this._collection();
    await collection.insertMany(rows.map((r) => ({ ...r })));
    return rows;
  }

  async findById(id) {
    const collection = await this._collection();
    return collection.findOne({ id }, { projection: { _id: 0 } });
  }

  async findOne(filter) {
    const collection = await this._collection();
    return collection.findOne(filter || {}, { projection: { _id: 0 } });
  }

  async findAll(filter) {
    const collection = await this._collection();
    return collection.find(filter || {}, { projection: { _id: 0 } }).toArray();
  }

  async update(id, patch) {
    const collection = await this._collection();
    const updatedPatch = { ...patch, updatedAt: new Date().toISOString() };
    const result = await collection.findOneAndUpdate(
      { id },
      { $set: updatedPatch },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    return result && result.value ? result.value : result;
  }

  async updateMany(filter, patch) {
    const collection = await this._collection();
    const updatedPatch = { ...patch, updatedAt: new Date().toISOString() };
    const result = await collection.updateMany(filter, { $set: updatedPatch });
    return result.modifiedCount;
  }

  async deleteById(id) {
    const collection = await this._collection();
    const result = await collection.deleteOne({ id });
    return result.deletedCount > 0;
  }

  async deleteMany(filter) {
    const collection = await this._collection();
    const result = await collection.deleteMany(filter);
    return result.deletedCount;
  }
}

function makeTable(name) {
  return MONGODB_URI ? new MongoTable(name) : new JsonTable(name);
}

const db = {
  users: makeTable("users"),
  knowledgeDocuments: makeTable("knowledgeDocuments"),
  knowledgeChunks: makeTable("knowledgeChunks"),
  chatHistory: makeTable("chatHistory"),
  auditLogs: makeTable("auditLogs"),
  conversations: makeTable("conversations"),
  aiQueryLogs: makeTable("aiQueryLogs"),
  systemLogs: makeTable("systemLogs"),
};


async function connectDb() {
  if (MONGODB_URI) {
    await getMongoDb();
  } else {
    console.log("MONGODB_URI not set - using the local JSON-file store (backend/db/data-files/).");
  }
}

module.exports = { db, connectDb, usingMongo: !!MONGODB_URI };
