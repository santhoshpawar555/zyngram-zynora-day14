const fs = require("fs");
const path = require("path");
const load = (label) => JSON.parse(fs.readFileSync(path.join(__dirname, `eval-results-${label}.json`), "utf8"));
const B = load("BASELINE"), A = load("AFTER");
const before = Object.fromEntries(B.rows.map((r) => [r.id, r]));

let md = `# Regression report: Baseline vs After\n\nDate: ${A.summary.date}\n\n`;
md += "| Metric | Baseline | After |\n|---|---|---|\n";
for (const k of ["total", "pass", "fail", "passPct", "p50ms", "p95ms"]) md += `| ${k} | ${B.summary[k]} | ${A.summary[k]} |\n`;

md += "\n## Per question\n\n| ID | Type | Question | Baseline | After | Change |\n|---|---|---|---|---|---|\n";
for (const r of A.rows) {
  const b = before[r.id] || { verdict: "-" };
  let change = "same";
  if (b.verdict === "FAIL" && r.verdict === "PASS") change = "FIXED";
  else if (b.verdict === "PASS" && r.verdict === "FAIL") change = "REGRESSION";
  md += `| ${r.id} | ${r.type} | ${r.q.replace(/\|/g, "/")} | ${b.verdict} | ${r.verdict} | ${change} |\n`;
}
const regressions = A.rows.filter((r) => before[r.id] && before[r.id].verdict === "PASS" && r.verdict === "FAIL");
const remaining = A.rows.filter((r) => r.verdict === "FAIL");
md += `\n## Regressions: ${regressions.length}\n` + (regressions.map((r) => `- ${r.id}: ${r.why}`).join("\n") || "None") + "\n";
md += `\n## Remaining failures: ${remaining.length}\n` + (remaining.map((r) => `- ${r.id}: ${r.why}`).join("\n") || "None") + "\n";

fs.writeFileSync(path.join(__dirname, "regression-report.md"), md);
console.log(md);