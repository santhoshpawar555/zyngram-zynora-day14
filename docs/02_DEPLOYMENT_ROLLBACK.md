# Production Deployment & Rollback - v1.1.0

Target: any Docker host (Render / Railway / Fly / VM) + MongoDB Atlas. The backend serves the frontend, so **one URL** = UI + API.

## 0. Pre-deploy
```bash
cd backend && npm test          # must be green (15 RAG + 62 Day-12 checks)
git tag v1.1.0 && git push --tags
```

## 1. Production environment variables
Set on the host (never commit): `NODE_ENV=production`, `ZYNORA_SECRET=$(openssl rand -hex 32)`, `MONGODB_URI=<Atlas URI>`, `MONGODB_DB_NAME=zynora`, `CORS_ORIGIN=https://<your-url>`, optional `RATE_LIMIT_*`. See `backend/.env.example`.
The server exits at boot if `NODE_ENV=production` and the secret is missing or the dev default.

## 2. Database migration (before switching traffic)
Take an Atlas snapshot first (Atlas -> Backup -> Take snapshot now), then:
```bash
cd backend
MONGODB_URI=... node scripts/migrate-v1.0-to-v1.1.js --dry-run   # preview
MONGODB_URI=... node scripts/migrate-v1.0-to-v1.1.js             # JSON backup + migrate + indexes
```

## 3. Deploy backend + frontend
- Render: New -> Blueprint -> select repo (`render.yaml`); or Docker: `docker build -t zynora:1.1.0 . && docker run -p 5050:5050 --env-file backend/.env zynora:1.1.0`.
- Health check path: `/api/health`.

## 4. Post-deploy verification (save the output as evidence)
```bash
URL=https://<your-url>
curl -s $URL/api/health                                              # UP, version 1.1.0, database UP
curl -s -o /dev/null -w "%{http_code}\n" $URL/api/zynora/conversations   # 401 (auth enforced)
TOKEN=$(curl -s -X POST $URL/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@zyngram.test","password":"<password>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -H "Authorization: Bearer $TOKEN" $URL/api/admin/monitoring       # 200 JSON
curl -s -H "Authorization: Bearer $TOKEN" "$URL/api/admin/logs?level=error"   # error check
```
Browser smoke test: login -> New Conversation -> ask the hierarchy question -> follow-up "What comes after Hub?" -> unsupported question -> injection test -> Monitoring tab.
**Change the seeded demo passwords before real use.**

## 5. Rollback procedure
Trigger: health DOWN, error rate > 20 % on dashboard, failed smoke test, or data issue.
1. **App rollback (~2 min):** redeploy the previous image/tag (`git checkout v1.0.0`; Render: Deploys -> last v1.0.0 deploy -> Rollback; Docker: run `zynora:1.0.0`). Data changes are additive, so v1.0 runs on migrated data unchanged.
2. **Verify:** `/api/health` reports `1.0.0`; login works.
3. **Data rollback (only if corrupted):** restore the Atlas snapshot from step 2, or the JSON files in `backend/backups/<timestamp>/` (`conversations`, `aiQueryLogs`, `chatHistory`).
4. Keep `systemLogs` for the post-mortem; use the `traceId` from a failing request to find the cause.
5. Fix, run `npm test`, tag `v1.1.1`, redeploy.
