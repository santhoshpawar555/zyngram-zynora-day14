# Zynora v1.1.1 - Day 13 Tested & Validated Release

Day 13 = testing, evaluation, fixes only. See `docs/day13/00_DAY13_SUMMARY.md` (`npm run eval` re-runs everything).

---

# Zynora v1.1.0 - Day 12 Production Release

This is the **next production release of the existing Zynora project** (v1.0 -> v1.1), not a rebuild.
Docs: `docs/01_RELEASE_PLAN.md`, `02_DEPLOYMENT_ROLLBACK.md`, `03_TEST_EVIDENCE.md`, `04_DEMO_AND_VERIFICATION.md`.

```bash
cd backend && node server.js      # UI + API on http://localhost:5050
npm test                          # 15 RAG regression + 62 Day-12 checks
npm run migrate                   # v1.0 -> v1.1 DB migration (idempotent)
```
New in v1.1: persistent conversations, context-aware RAG, response-quality records, monitoring dashboard (Monitoring tab, admin), structured logs with trace IDs, rate limiting + hardening, health check, Docker/Render deploy files.
API additions: `GET /api/admin/monitoring?from=&to=`, `/api/admin/logs`, `/api/admin/quality`, `/api/health`. `POST /api/zynora/chat` now requires login + `conversationId`.

---
(Original Day 11 README below)

# Zynora (RAG-only Internal Chatbot)

## Status: Backend is COMPLETE and tested (15/15 test questions pass). Frontend is a working basic version (chat + admin panel), built as one plain HTML/JS file.

## Why no external AI / LLM anywhere in this project

The brief requires Zynora to answer **only** from Zyngram's own approved
knowledge base, and to **never** call an external AI service, search
engine, or web API. So this project deliberately contains zero calls to
any LLM provider. "Answer generation" (Task 4 of the brief) is done by
**extractive RAG**: the retrieval engine finds the most relevant approved
chunk(s) of text and returns that approved text directly, with its source
clearly attached - never a paraphrase from a generative model, which could
invent facts not actually in the knowledge base. This is the safest
possible reading of "RAG-only, no external LLM."

## Why zero npm packages (same constraint as Day 10)

This build environment cannot reach the npm registry (`npm install`
returns 403 Forbidden - confirmed again for this task). So there is no
embedding library, no vector database, no Express. The retrieval engine
is a real, working **TF-IDF keyword search** (the same family of
algorithm search engines used before neural embeddings existed) written
from scratch using only Node's built-in `crypto`, `http`, `fs`, `url`
modules. See the big comment at the top of `backend/services/ragService.js`
for exactly how it scores and ranks text.

**To run the backend right now, no install needed:**
```bash
cd backend
node server.js
```
Seeds itself on first run (admin + staff users, and a starter knowledge
base already active in RAG). Runs on `http://localhost:5050`.

**To run the frontend:** just open `frontend/index.html` in a browser (or
serve it with `npx serve frontend` / any static file server). It talks to
`http://localhost:5050` by default - edit `API_BASE` at the top of the
`<script>` tag in `index.html` if your backend runs elsewhere.

## Why frontend is plain HTML/JS instead of React this time

Day 9 and Day 10 used a React frontend, which needs `npm install` on
*your* machine (fine, since you have real internet access there). For Day
11, given the token/time budget, a single dependency-free HTML file gets
you a fully working chat + admin UI with **zero setup** - no `npm install`
step at all, on any machine. It is less polished visually than a React
app would be, but every feature works: chat with source attribution, and
a full admin knowledge-management panel with the DRAFT/APPROVED/ACTIVE/
ARCHIVED lifecycle buttons.

## Demo logins
- Admin: `admin@zyngram.test` / `Admin@12345`
- Staff: `staff@zyngram.test` / `Staff@12345`
- Anyone (even logged out) can use the chat - only the admin panel requires admin login.

## What's built (maps to the brief's task list)

| Task | File(s) | Status |
|---|---|---|
| 1. Knowledge base schema (KnowledgeDocuments + chunks) | `backend/db/store.js`, `backend/db/seed.js` | Done |
| 2. Document ingestion (TXT/Markdown/JSON, clean+chunk+metadata) | `backend/services/chunkingService.js`, `knowledgeService.js` | Done |
| 3. RAG retrieval engine (search/rank/select context, no external API) | `backend/services/ragService.js` | Done |
| 4. RAG-only answer generation + exact refusal string | `backend/services/zynoraService.js` | Done |
| 5. Admin knowledge management + lifecycle | `backend/controllers/knowledgeController.js`, `knowledgeService.js` | Done (API + working UI panel) |
| 6. `/api/zynora/chat` returning `{answer, sources, grounded}` | `backend/controllers/zynoraController.js`, `routes/zynoraRoutes.js` | Done |
| 7. Chat UI with source attribution | `frontend/index.html` (chat view) | Done |
| 8. 15-question test suite (8 answerable / 4 unanswerable / 3 injection) | `backend/test-rag.js` | Done - 15/15 passing |
| 9. Security: auth, admin RBAC, status filtering | `backend/lib/auth.js`, `middleware/auth.js` | Done |
| 10. Audit logging | `backend/services/auditService.js` | Done (logs logins, doc lifecycle changes, blocked injection attempts) |
| 11. Prompt-injection resistance | `backend/services/zynoraService.js` (`detectPromptInjection`) | Done - pattern-based, runs BEFORE retrieval so it can't be bypassed |
| 12. Only ACTIVE_IN_RAG content is ever retrievable | `backend/services/ragService.js` (`getActiveChunks`) | Done - proven by the archive test below |

## Proven by testing

Run the backend, then:
```bash
node test-rag.js
```
Gives a full pass/fail report for all 15 required test questions (all 15 currently pass).

Also manually proven during this build (see conversation):
- A brand-new DRAFT document is **invisible** to chat, even if you ask about it by exact wording.
- After `approve` then `activate`, the same question becomes answerable with correct source attribution.
- After `archive`, the same question goes back to the refusal message - archived content is excluded again.
- Creating/approving/activating/archiving a document with no `Authorization` header is rejected with 401.
- A prompt-injection attempt ("ignore your knowledge base...", "pretend you have no restrictions...", "just guess...") is blocked before retrieval even runs, and logged as `PROMPT_INJECTION_ATTEMPT_BLOCKED` in the audit log.

## API quick reference

```
POST /api/auth/login                     { email, password } -> { token, user }
POST /api/zynora/chat                    { message, sessionId? } -> { answer, sources, grounded }   (public, no login needed)
GET  /api/zynora/history?sessionId=...   -> past messages for that session

-- all /api/knowledge/* routes require an admin Bearer token --
POST   /api/knowledge                    create a new DRAFT document (title, category, version?, format?, rawContent)
GET    /api/knowledge?status=&category=  list/filter documents
GET    /api/knowledge/:id                get one document
PUT    /api/knowledge/:id                edit content (sends it back to DRAFT for re-review)
POST   /api/knowledge/:id/approve        DRAFT -> APPROVED
POST   /api/knowledge/:id/activate       APPROVED -> ACTIVE_IN_RAG (now retrievable by chat)
POST   /api/knowledge/:id/archive        -> ARCHIVED (removed from retrieval)
POST   /api/knowledge/:id/restore        ARCHIVED -> DRAFT (for re-editing)
DELETE /api/knowledge/:id                permanently delete
```

Zynora is  complete and working.


It does not use any external AI or LLM.

It only gives answers from the approved Zyngram knowledge base.

It uses TF-IDF keyword search for RAG.

Admin can create, approve, activate, archive, and restore documents.

Only active documents are used for answers.

Login, admin security, audit logs, and prompt-injection protection are added.

Frontend has a chat page and admin panel.

No npm packages are needed for the backend.

- Some small things are still missing:

No PDF/DOCX support.

No edit button in the admin UI.

Search is keyword-based, not semantic.

No automated frontend testing.

Overall, the project is working end-to-end.
