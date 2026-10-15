// Simple in-memory fixed-window rate limiter (no dependencies).
// Per key (IP, or userId) and per bucket (general / login / chat).
const buckets = new Map();

function check(bucket, key, limit, windowMs) {
  const now = Date.now();
  const id = `${bucket}:${key}`;
  let b = buckets.get(id);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count++;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

function reset() { buckets.clear(); }

// prune old buckets so memory can't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, 60_000).unref();

module.exports = { check, reset };
