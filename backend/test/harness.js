// Starts the real server in-process on a random port with an isolated temp data dir.
const os = require("os"), fs = require("fs"), path = require("path"), http = require("http");

async function boot(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zynora-test-"));
  Object.assign(process.env, { ZYNORA_DATA_DIR: dir, LOG_STDOUT: "off", ZYNORA_SECRET: "test-secret-" + Date.now(), ...env });
  delete process.env.MONGODB_URI;
  const { server } = require("../server");
  const { connectDb } = require("../db/store");
  const { seedAll } = require("../db/seed");
  await connectDb(); await seedAll();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  function call(method, p, { body, token, headers = {}, raw } = {}) {
    return new Promise((resolve, reject) => {
      const data = raw !== undefined ? raw : body ? JSON.stringify(body) : null;
      const h = { "Content-Type": "application/json", ...headers };
      if (token) h.Authorization = "Bearer " + token;
      if (data) h["Content-Length"] = Buffer.byteLength(data);
      const req = http.request({ hostname: "127.0.0.1", port, path: p, method, headers: h }, (res) => {
        let s = ""; res.on("data", (c) => (s += c));
        res.on("end", () => { let j = {}; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j, headers: res.headers }); });
      });
      req.on("error", reject); if (data) req.write(data); req.end();
    });
  }
  const login = async (email, password) => (await call("POST", "/api/auth/login", { body: { email, password } })).body.token;
  return { call, login, port, close: () => new Promise((r) => server.close(r)), dir };
}

let pass = 0, fail = 0; const results = [];
function check(name, cond, extra = "") {
  if (cond) pass++; else fail++;
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? "  -> " + extra : ""}`);
}
const summary = () => { console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`); return fail; };
module.exports = { boot, check, summary };
