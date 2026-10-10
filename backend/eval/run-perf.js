// Task 7: production performance testing. Writes docs/day13/results-perf.json
const fs = require("fs"), path = require("path"), http = require("http");
const { connect } = require("./client");
const OUT = path.join(__dirname, "..", "..", "docs", "day13");
const LABEL = process.argv[2] || "run";
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0; };
const stats = (a) => ({ n: a.length, avg: Math.round(a.reduce((s, x) => s + x, 0) / (a.length || 1) * 10) / 10, p50: q(a, 50), p95: q(a, 95), p99: q(a, 99), max: Math.max(0, ...a) });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await connect();
  const staff = await c.login("staff@zyngram.test", "Staff@12345");
  const admin = await c.login("admin@zyngram.test", "Admin@12345");
  const P = { label: LABEL, at: new Date().toISOString() };
  const QS = ["What is Zyngram?", "What comes after Hub?", "How long does a failed recharge refund take?", "What is the weather in Delhi?", "What are the support working hours for franchise owners?", "How is the wallet balance derived?"];

  // first response (cold conversation, first question)
  const cv = await c.newConv(staff, "perf-first");
  const f = await c.ask(staff, cv.id, "What is Zyngram?");
  P.firstResponseMs = f.wallMs;

  // sequential API latency
  const seq = []; const cs = await c.newConv(staff, "perf-seq");
  for (let i = 0; i < 100; i++) seq.push((await c.ask(staff, cs.id, QS[i % QS.length])).wallMs);
  P.chatSequential100 = stats(seq);
  P.longConversation = { first10: stats(seq.slice(0, 10)), last10: stats(seq.slice(-10)) };

  const lat = async (fn, n = 50) => { const a = []; for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await fn(); a.push(Number(process.hrtime.bigint() - t) / 1e6); } return stats(a.map((x) => Math.round(x * 100) / 100)); };
  P.healthApi = await lat(() => c.call("GET", "/api/health"));
  P.listConversationsApi = await lat(() => c.call("GET", "/api/zynora/conversations", { token: staff }));
  P.monitoringApi = await lat(() => c.call("GET", "/api/admin/monitoring", { token: admin }), 20);

  // concurrency
  async function burst(n) {
    const convs = await Promise.all(Array.from({ length: n }, (_, i) => c.newConv(staff, "burst" + i)));
    const t0 = Date.now();
    const res = await Promise.all(convs.map((cv, i) => c.ask(staff, cv.id, QS[i % QS.length]).catch((e) => ({ status: 0, wallMs: 0, err: e.message }))));
    const wall = Date.now() - t0;
    return { requests: n, ok: res.filter((r) => r.status === 200).length, failed: res.filter((r) => r.status !== 200).length, wallMs: wall, throughputRps: Math.round(n / (wall / 1000)), latency: stats(res.map((r) => r.wallMs)) };
  }
  P.concurrent20 = await burst(20);
  P.concurrent100 = await burst(100);

  // frontend loading
  const t0 = Date.now(); const home = await c.call("GET", "/"); 
  P.frontend = { status: home.status, bytes: (home.raw || "").length || undefined, ms: Date.now() - t0 };

  // in-process-only: DB + retrieval timing on a large knowledge base
  if (!c.live) {
    const { db } = require("../db/store");
    const rag = require("../services/ragService");
    const t = async (fn, n = 20) => { const a = []; for (let i = 0; i < n; i++) { const s = process.hrtime.bigint(); await fn(); a.push(Number(process.hrtime.bigint() - s) / 1e6); } return stats(a.map((x) => Math.round(x * 100) / 100)); };
    P.dbQueryMs = {
      chatHistory_findAll: await t(() => db.chatHistory.findAll({ sessionId: cs.id })),
      conversations_findAll: await t(() => db.conversations.findAll({ userId: "x" })),
      chatHistoryRows: (await db.chatHistory.findAll()).length,
    };
    P.retrievalSmallKbMs = { chunks: (await db.knowledgeChunks.findAll()).length, ...(await t(() => rag.search("What comes after Hub?"))) };
    const words = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu".split(" ");
    const rnd = (n) => Array.from({ length: n }, () => words[Math.floor(Math.random() * words.length)] + Math.floor(Math.random() * 500)).join(" ");
    const bulk = Array.from({ length: 5000 }, (_, i) => ({ id: "BULK" + i, documentId: "DOCB" + (i % 500), title: "Bulk doc " + (i % 500), category: "FAQ", section: "s" + i, version: "v1", source: "bulk", status: "ACTIVE_IN_RAG", content: rnd(60), createdAt: new Date().toISOString() }));
    await db.knowledgeChunks.insertMany(bulk);
    P.retrievalLargeKbMs = { chunks: (await db.knowledgeChunks.findAll()).length, ...(await t(() => rag.search("What comes after Hub?"), 10)) };
    const big = await c.ask(staff, cv.id, "What comes after Hub?");
    P.chatWithLargeKbMs = big.wallMs;
  }
  fs.writeFileSync(path.join(OUT, `results-perf-${LABEL}.json`), JSON.stringify(P, null, 2));
  console.log(JSON.stringify(P, null, 1));
  await c.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
