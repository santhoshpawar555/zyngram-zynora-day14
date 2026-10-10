const { spawnSync } = require("child_process"); const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."); const OUT = path.join(root, "..", "docs", "day13");
const jobs = [
  ["Day 1 RAG regression (15 q)", ["test-rag.js"], /Total: (\d+) passed, (\d+) failed/],
  ["Day 2 integration + security (62 checks)", ["test-day12.js"], /(\d+) passed, (\d+) failed/],
  ["Day 3 accuracy dataset (40 q)", ["eval/run-accuracy.js"], null],
  ["Day 3 RAG/hallucination/context/security/monitoring suites", ["eval/run-suites.js"], null],
  ["Day 3 final validation flow", ["eval/run-final.js"], null],
];
let md = `# Regression Report\n\nRun: ${new Date().toISOString()}\n\n| Suite | Result | Detail |\n|---|---|---|\n`; let bad = 0;
for (const [name, args, re] of jobs) {
  const r = spawnSync("node", args, { cwd: root, encoding: "utf8", env: { ...process.env, LOG_STDOUT: "off" } }); const out = (r.stdout || "") + (r.stderr || "");
  let detail = "", ok = r.status === 0;
  if (re) { const m = out.match(re); detail = m ? `${m[1]} passed, ${m[2]} failed` : "no summary"; ok = ok && m && m[2] === "0"; }
  else if (args[0].includes("accuracy")) { const m = JSON.parse(fs.readFileSync(path.join(OUT, "results-accuracy.json"))).metrics; detail = `accuracy ${m.accuracyPct}%, grounded ${m.groundedAnswerPct}%, hallucinations ${m.hallucination}`; ok = m.accuracyPct >= 95 && m.hallucination === 0 && m.groundedAnswerPct === 100; }
  else if (args[0].includes("suites")) { const rs = JSON.parse(fs.readFileSync(path.join(OUT, "results-suites.json"))); const f = rs.filter((x) => !x.pass); detail = `${rs.length - f.length}/${rs.length} checks passed` + (f.length ? " - FAILED: " + f.map((x) => x.id).join(",") : ""); ok = f.length === 0; }
  else detail = out.split("\n").filter((l) => /^(PASS|FAIL)/.test(l)).length + " steps";
  if (!ok) bad++; md += `| ${name} | ${ok ? "PASS" : "FAIL"} | ${detail} |\n`; console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}
md += `\n**Regression result: ${bad ? bad + " suite(s) FAILED" : "all suites green"}**\n`;
fs.writeFileSync(path.join(OUT, "11_regression_report.md"), md); process.exit(bad ? 1 : 0);
