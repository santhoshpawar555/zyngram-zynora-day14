# AI Monitoring & Observability Verification

Result: **10/10 passed**.

Recorded per question: user, conversation (sessionId), question, retrieved chunks (id/score), similarity, answer, sources, response time, grounded flag, confidence, status (ANSWERED / NO_ANSWER / BLOCKED_INJECTION), failed retrieval (retrievedChunks = 0), errors and AI service status (/api/health + dashboard).

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| O01 | dashboard exposes all metrics | all keys | all present | PASS |
| O02 | quality records carry question/chunks/similarity/answer/source/time/grounded/confidence | all fields | all present | PASS |
| O03 | failed retrieval is recorded | records with retrievedChunks=0 | 115 | PASS |
| O04 | log rows have user/action/module/status/traceId/timestamp | complete | checked 500 | PASS |
| O05 | boundary refusals are logged with reason | BOUNDARY_REFUSAL rows | 20 | PASS |
| O06 | no passwords/tokens/hashes in logs | none | clean | PASS |
| O07 | question text is not duplicated into structured logs (only length) | no USER_QUESTION row contains question text | checked | PASS |
| O08 | AI service status (health) endpoint | UP + version | {"status":"UP","service":"zynora-backend","version":"1.1.1","database":"UP","store":"mongodb","uptimeSec":58,"timestamp":"2026-10-08T08:24:08.639Z"} | PASS |
| O09 | AI service health in dashboard | HEALTHY/DEGRADED/DOWN | HEALTHY | PASS |
| O10 | API errors are logged with status + trace id | 400 row with traceId | 400 | PASS |

**Data-sensitivity review:** structured logs store only the question *length* (not text); passwords, tokens and hashes are redacted/never logged; question text lives only in admin-only `aiQueryLogs` (needed for the FAQ metric). Failed-login logs include the attempted email address - acceptable for security auditing but should be retention-limited in production.
