# Release Plan - Zynora v1.0 -> v1.1

| Item | Detail |
|---|---|
| Current production version | **v1.0.0** (Day 11: RAG-only chatbot, admin knowledge lifecycle, audit log, basic auth) |
| New version | **v1.1.0** (git tag `v1.1.0`; previous stable tag `v1.0.0`) |
| Type | Minor release - additive, backward-compatible data model |

## Features in v1.1.0
1. Persistent conversations: create, list, continue, rename, clear, delete; messages stored with user, conversation, sources, timestamp.
2. Context-aware RAG: follow-ups ("What comes after Hub?") use previous questions + previous sources to build the retrieval query, still limited to ACTIVE approved KB, with a relevance guard.
3. AI response quality records: question, retrieved chunks (ids, scores), similarity, answer, sources, response time, grounded flag, confidence, status (ANSWERED / NO_ANSWER / BLOCKED_INJECTION).
4. Monitoring dashboard + date filter (admin only), plus `/api/admin/logs` and `/api/admin/quality`.
5. Structured JSON logging with Trace/Request ID (`X-Request-Id`) for login, conversations, questions, retrieval, AI response, API errors, auth failures, KB changes, admin actions.
6. Security: per-IP / per-user rate limits, stronger prompt-injection patterns, strict input validation, security headers, 400/413 for bad bodies, mandatory auth on chat, ownership check on every conversation route, production refuses the default secret.
7. Health endpoint with DB check + version; backend serves frontend (single production URL).

## Bugs fixed from v1.0 (found during review)
- `zynoraService.js` had a stray top-level `await` -> server crashed on start.
- Invalid JSON / oversized body returned HTTP 500 -> now 400 / 413.
- Rename with blank title returned 500 -> now 400.
- Chat accepted non-string messages; login accepted object payloads (NoSQL-style) -> now 400.
- Follow-up logic blindly concatenated old questions (polluted unrelated questions) -> guarded.
- `test-rag.js` used anonymous chat, which no longer exists -> now authenticated.

## Known limitations (not in this release)
- Retrieval is TF-IDF keyword search, not semantic embeddings.
- Rate limiter is in-memory (per instance); use a shared store (Redis) if running more than one instance.
- Token is HMAC-signed; no refresh / revocation list yet.

## Database changes
- New collection `systemLogs`.
- `conversations`: + `messageCount`, `status`. `aiQueryLogs`: + `status`, `usedContext`, `chunkDetails`, `sources`, `category`.
- MongoDB indexes: conversations(userId, updatedAt), chatHistory(sessionId, createdAt), aiQueryLogs(createdAt), systemLogs(timestamp), systemLogs(traceId).
- Migration: `npm run migrate` - idempotent (second run changes 0 rows), takes JSON backup first, supports `--dry-run`. Nothing is dropped.

## API changes
| Change | Endpoint |
|---|---|
| Auth now required | `POST /api/zynora/chat` (needs `conversationId`) |
| New | `GET /api/admin/logs`, `GET /api/admin/quality`; `GET /api/admin/monitoring?from=&to=` extended |
| Changed | `GET /api/health` -> `{status, version, database, store, uptimeSec}`; 503 if DB down |
| Chat response adds | `usedContext`, `quality{status, retrievalFailure, relevance, confidence}` |
| Headers | `X-Request-Id` on every response; `Retry-After` on 429 |

## Deployment changes
- New env vars: `NODE_ENV`, `ZYNORA_SECRET` (required), `MONGODB_URI`, `MONGODB_DB_NAME`, `CORS_ORIGIN`, `RATE_LIMIT_*`.
- Dockerfile + render.yaml added.

## Rollback plan
See `02_DEPLOYMENT_ROLLBACK.md`: redeploy tag `v1.0.0`; data changes are additive so v1.0 runs unchanged on migrated data; restore backup only if data is corrupted.
