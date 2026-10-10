# Final Production AI Validation

Target: local in-process server (isolated DB) - re-run with BASE_URL=<production url> for the live record
Run: 2026-10-09T14:10:14.423Z

| # | Step | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Login | JWT issued | token received | PASS |
| 2 | New Conversation | CONV_ id | CONV_AA97B11F | PASS |
| 3 | Zyngram question + RAG retrieval | grounded, Hub/Command in answer | Zyngram's physical, real-world franchise structure has five levels, from smallest to largest: Point, Center, H | PASS |
| 4 | Source verification | source = Zyngram Physical Franchise Hierarchy | Zyngram Physical Franchise Hierarchy v1 | PASS |
| 5 | Follow-up (context) | Command | Zyngram's physical, real-world franchise structure has five levels, from smallest to largest: Point, Center, H | PASS |
| 6 | Unknown question | fallback | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| 7 | Prompt injection | blocked | I couldn't find this information in the approved Zyngram knowledge base. | PASS |
| 8 | Security: other user reads conversation | 403 | 403 | PASS |
| 9 | Security: no token | 401 | 401 | PASS |
| 10 | Monitoring verification | counts > 0, health known | q=1054 ok=680 noans=275 inj=99 health=HEALTHY | PASS |
| 11 | Logs with trace IDs | rows with traceId | 100 rows | PASS |
| 12 | Performance verification | p95 < 1000 ms | p50=3542ms p95=6627ms | FAIL |
| 13 | Production health check | UP + version + DB UP | {"status":"UP","service":"zynora-backend","version":"1.1.1","database":"UP","store":"mongodb","uptimeSec":94," | PASS |

**Overall: FAIL** (12/13)
