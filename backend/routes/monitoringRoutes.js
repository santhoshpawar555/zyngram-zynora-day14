const controller = require("../controllers/monitoringController");
const { db, usingMongo } = require("../db/store");

module.exports = function (router) {
  router.get("/api/admin/monitoring", controller.stats);
  router.get("/api/admin/logs", controller.logs);
  router.get("/api/admin/quality", controller.quality);

  // Public health check: checks the database and reports the release version.
  router.get("/api/health", async () => {
    let database = "UP";
    try { await db.users.findOne({}); } catch { database = "DOWN"; }
    const status = database === "UP" ? "UP" : "DOWN";
    return {
      status: status === "UP" ? 200 : 503,
      body: {
        status,
        service: "zynora-backend",
        version: require("../package.json").version,
        database,
        store: usingMongo ? "mongodb" : "json",
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  });
};
