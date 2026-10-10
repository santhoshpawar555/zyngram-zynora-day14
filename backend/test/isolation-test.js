// Day 14 Task 5: session isolation test. Run while the server is running:  node test/isolation-test.js
const BASE = process.env.BASE_URL || "http://localhost:5050";

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail || ""}`);
}

(async () => {
  const admin = (await call("POST", "/api/auth/login", null, { email: "admin@zyngram.test", password: "Admin@12345" })).body.token;
  const staff = (await call("POST", "/api/auth/login", null, { email: "staff@zyngram.test", password: "Staff@12345" })).body.token;
  if (!admin || !staff) { console.log("Login failed. Check the passwords in the script."); process.exit(1); }

  // Admin makes a private conversation.
  const conv = (await call("POST", "/api/zynora/conversations", admin, { title: "admin private" })).body;
  await call("POST", "/api/zynora/chat", admin, { conversationId: conv.id, message: "What is Zyngram?" });

  // Staff tries to touch it.
  let r = await call("GET", `/api/zynora/conversations/${conv.id}`, staff);
  check("staff cannot read admin's conversation", [403, 404].includes(r.status), "HTTP " + r.status);

  r = await call("POST", "/api/zynora/chat", staff, { conversationId: conv.id, message: "What did I ask before?" });
  check("staff cannot chat inside admin's conversation", [403, 404].includes(r.status), "HTTP " + r.status);

  r = await call("PATCH", `/api/zynora/conversations/${conv.id}`, staff, { title: "hacked" });
  check("staff cannot rename admin's conversation", [403, 404].includes(r.status), "HTTP " + r.status);

  r = await call("POST", `/api/zynora/conversations/${conv.id}/clear`, staff);
  check("staff cannot clear admin's conversation", [403, 404].includes(r.status), "HTTP " + r.status);

  r = await call("DELETE", `/api/zynora/conversations/${conv.id}`, staff);
  check("staff cannot delete admin's conversation", [403, 404].includes(r.status), "HTTP " + r.status);

  r = await call("GET", "/api/zynora/conversations", staff);
  const list = Array.isArray(r.body) ? r.body : (r.body.conversations || []);
  check("staff's list does not contain admin's conversation", !list.some((c) => c.id === conv.id), `${list.length} conversations`);

  r = await call("GET", `/api/zynora/conversations/${conv.id}`, null);
  check("no token -> 401", r.status === 401, "HTTP " + r.status);

  // Admin's conversation must still be intact.
  r = await call("GET", `/api/zynora/conversations/${conv.id}`, admin);
  check("admin's conversation is still intact", r.status === 200, "HTTP " + r.status);

  // Follow-up memory must not leak across users: staff asks a follow-up in a brand-new conversation.
  const sc = (await call("POST", "/api/zynora/conversations", staff, { title: "staff new" })).body;
  r = await call("POST", "/api/zynora/chat", staff, { conversationId: sc.id, message: "What did I ask before?" });
  check("new conversation has no memory of another user's chat", !/hyperlocal/i.test(r.body.answer || ""), String(r.body.answer).slice(0, 60));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });