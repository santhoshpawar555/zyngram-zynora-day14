# Production Performance Report

Environment: single Node 22 process, JSON store (local in-process run). Latency shown as avg / p95 / p99 in ms. **Re-run against production with `BASE_URL=https://... node eval/run-perf.js live`** - production (MongoDB Atlas) numbers will differ because of network + DB latency.

| Measurement | Baseline | After optimization |
|---|---|---|
| First response (cold conversation) | 11 ms | 11 ms |
| Chat API, 100 sequential | 5.5 / 8 / 12 | 1.4 / 2 / 10 |
| Long conversation: first 10 vs last 10 turns (avg) | 5.1 vs 6.7 | 2.8 vs 1.3 |
| Health API | 0.5 / 0.98 / 1.57 | 0.5 / 1.05 / 2.66 |
| List conversations API | 1.6 / 2.81 / 3.99 | 0.5 / 0.72 / 3.63 |
| Monitoring API | 2.8 / 4.66 / 4.66 | 0.8 / 1.77 / 1.77 |
| 20 concurrent chats (wall / ok) | 144 ms / 20 | 18 ms / 20 |
| 100 concurrent chats (wall / ok / req/s) | 1001 ms / 100 / 100 | 69 ms / 100 / 1449 |
| DB query: chatHistory by session (442 rows) | 0 / 0.07 / 0.07 | 0 / 0.08 / 0.08 |
| Retrieval, small KB (24 chunks) | 0.8 / 1.13 / 1.13 | 0.2 / 1.07 / 1.07 |
| Retrieval, large KB (5024 chunks) | 190.6 / 225.97 / 225.97 | 58 / 240.69 / 240.69 |
| Full chat request on large KB | 462 ms | 186 ms |
| Frontend load (index.html) | 13 ms | 6 ms |

## Bottlenecks found and fixed
1. **PERF-3 - synchronous whole-file JSON rewrite on every insert** blocked the event loop: 100 concurrent chats took 1001 ms. Writes are now coalesced + atomic: 69 ms. (Production uses MongoDB, where this code path is not used.)
2. **PERF-1/2 - every query re-tokenized every chunk and rebuilt document frequencies**: large-KB retrieval 195.33 ms -> 36.05 ms p50. Token and DF caches are keyed by chunk id/version and invalidate when the active set changes.

## Remaining limits
- First query after a KB change on a very large KB rebuilds the index (about 240.69 ms for 5,000 chunks).
- Retrieval is still linear in KB size; for >50k chunks use an inverted index or a vector DB.
- Rate limiter is per instance (in-memory).
