// Test client: talks to a live deployment when BASE_URL is set, otherwise boots the server in-process
// on an isolated temp database (same code, same HTTP stack).
const http = require("http"), https = require("https");

async function connect() {
  const base = process.env.BASE_URL;
  let closer = async () => {}, doRequest;
  if (!base) {
    const { boot } = require("../test/harness");
    const t = await boot({ 
      RATE_LIMIT_CHAT_PER_MIN: "100000", 
      RATE_LIMIT_PER_MIN: "1000000",
       RATE_LIMIT_LOGIN_PER_MIN: "100000" });
    closer = t.close;
    doRequest = (m, p, o) => t.call(m, p, o);
  } else {
    const u = new URL(base), 
    lib = u.protocol === "https:" ? https : http;
    doRequest = (method, p, { 
      body, token, 
      headers = {}, raw } = {}) => new Promise((resolve, reject) => {
      const data = raw !== undefined ? raw : body ? JSON.stringify(body) : null;
      const h = { 
        "Content-Type": "application/json", ...headers 
      };
      if (token) h.Authorization = "Bearer " + token;
      if (data) h["Content-Length"] = Buffer.byteLength(data);
      const req = lib.request({ 
        hostname: u.hostname, 
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: p, method, headers: h }, (res) => {
        let s = ""; res.on("data", (c) => (s += c));
        res.on("end", () => { let j = {}; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j, headers: res.headers, raw: s }); });
      });
      req.on("error", reject); if (data) req.write(data); req.end();
    });
  }
  const login = async (email, password) => (
    await doRequest("POST", "/api/auth/login",
       { body: { email, password } })).body.token;
  const newConv = async (token, title) => (
    await doRequest("POST", "/api/zynora/conversations", { 
      token, body: { title } })).body;
  const ask = async (token, conversationId, message) => {
    const t0 = Date.now();
    const r = await doRequest("POST", "/api/zynora/chat", { 
      token, body: { conversationId, message 

      } 
    });
    return { ...r, wallMs: Date.now() - t0 };
  };
  return { call: doRequest, login, newConv, ask, close: closer, live: !!base };
}
module.exports = { connect };
