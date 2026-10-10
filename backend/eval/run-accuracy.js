// Tasks 1 + 3: run the 40-question dataset, classify, compute metrics, write evaluation report.
const fs = require("fs"), path = require("path");
const { connect } = require("./client");
const { loadKb, classify, pct } = require("./lib");
const DATA = require("./dataset");
const OUT = path.join(__dirname, "..", "..", "docs", "day13");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await connect();
  const admin = await c.login("admin@zyngram.test", process.env.ADMIN_PASSWORD || "Admin@12345");
  const staff = await c.login("staff@zyngram.test", process.env.STAFF_PASSWORD || "Staff@12345");
  const kb = await loadKb(c, admin);
  const rows = [];
  for (const item of DATA) {
    const conv = await c.newConv(staff, "eval " + item.id);
    for (const t of item.turns || []) await c.ask(staff, conv.id, t);
    const r = await c.ask(staff, conv.id, item.q);
    const [verdict, why] = classify(item, r, kb);
    rows.push({ ...item, must: undefined, verdict, why, grounded: r.body.grounded, usedContext: r.body.usedContext, sources: (r.body.sources || []).map((s) => s.title), answer: r.body.answer || r.body.error, confidence: r.body.confidence, ms: r.body.responseTimeMs });
  }
  const by = (f) => rows.filter(f).length;
  const answerable = rows.filter((r) => r.type === "ANSWER");
  const m = {
    total: rows.length,
    correct: by((r) => r.verdict === "Correct"),
    partial: by((r) => r.verdict === "Partially Correct"),
    incorrect: by((r) => r.verdict === "Incorrect"),
    unsupported: by((r) => r.verdict === "Unsupported"),
    noAnswer: by((r) => r.verdict === "No Answer"),
    hallucination: by((r) => r.verdict === "Hallucination"),
  };
  m.accuracyPct = pct(m.correct, m.total);
  // acceptable = correct or (ambiguous question handled by safe refusal)
  m.answerableAccuracyPct = pct(answerable.filter((r) => r.verdict === "Correct").length, answerable.length);
  const answered = rows.filter((r) => r.grounded);
  m.groundedAnswerPct = pct(answered.filter((r) => r.verdict !== "Unsupported" && r.verdict !== "Hallucination").length, answered.length);
  m.noAnswerRatePct = pct(rows.filter((r) => !r.grounded).length, rows.length);
  m.retrievalSuccessPct = pct(answerable.filter((r) => r.grounded && r.sources.some((s) => [].concat(DATA.find((d) => d.id === r.id).src).includes(s))).length, answerable.length);
  m.hallucinations = m.hallucination;
  fs.writeFileSync(path.join(OUT, "results-accuracy.json"), JSON.stringify({ metrics: m, rows }, null, 2));

  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").slice(0, 140);
  let md = `# Answer Accuracy Evaluation\n\nRun: ${new Date().toISOString()} - target: ${c.live ? process.env.BASE_URL : "local in-process server (isolated DB)"}\n\n## Metrics\n| Metric | Value |\n|---|---|\n`;
  md += `| Questions | ${m.total} |\n| Correct | ${m.correct} |\n| Partially Correct | ${m.partial} |\n| Incorrect | ${m.incorrect} |\n| Unsupported | ${m.unsupported} |\n| No Answer | ${m.noAnswer} |\n| Hallucination | ${m.hallucination} |\n`;
  md += `| **Accuracy % (Correct / all)** | **${m.accuracyPct}%** |\n| Accuracy on answerable questions (D+C types) | ${m.answerableAccuracyPct}% |\n| **Grounded Answer %** (answers whose text is verbatim approved KB) | **${m.groundedAnswerPct}%** |\n| **No-Answer Rate** | **${m.noAnswerRatePct}%** |\n| **Retrieval Success %** (expected source retrieved) | **${m.retrievalSuccessPct}%** |\n\n`;
  md += `## Per-question results\n| ID | Type | Question | Expected | Actual answer (truncated) | Source | Verdict |\n|---|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.id} | ${r.cat} | ${esc((r.turns ? "[after: " + r.turns.join(" > ") + "] " : "") + r.q)} | ${r.type} | ${esc(r.answer)} | ${esc(r.sources.join(", ") || "-")} | **${r.verdict}** ${esc(r.why)} |\n`;
  fs.writeFileSync(path.join(OUT, "02_accuracy_report.md"), md);
  console.log(JSON.stringify(m, null, 1));
  for (const r of rows.filter((r) => !["Correct"].includes(r.verdict))) console.log(`${r.id} ${r.verdict}: ${r.why} | Q="${r.q}" | A="${String(r.answer).slice(0, 100)}" | src=${r.sources}`);
  await c.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
