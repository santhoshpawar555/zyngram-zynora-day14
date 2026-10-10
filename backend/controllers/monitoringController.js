const { requireAdmin } = require("../middleware/auth");
const { getStats, getLogs, getQualityRecords } = require("../services/monitoringService");
const logger = require("../lib/logger");

async function stats(ctx) {
  const admin = requireAdmin(ctx.req);
  logger.log({ module: "admin", action: "VIEW_MONITORING", user: admin.userId, traceId: ctx.traceId });
  return { status: 200, body: await getStats({ from: ctx.query.from, to: ctx.query.to }) };
}
async function logs(ctx) {
  requireAdmin(ctx.req);
  return { status: 200, body: await getLogs(ctx.query) };
}
async function quality(ctx) {
  requireAdmin(ctx.req);
  return { status: 200, body: await getQualityRecords(ctx.query) };
}
module.exports = { stats, logs, quality };
