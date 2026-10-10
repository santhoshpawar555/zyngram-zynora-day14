const c = require("../controllers/conversationController");
module.exports = function (router) {
  router.post("/api/zynora/conversations", c.create);
  router.get("/api/zynora/conversations", c.list);
  router.get("/api/zynora/conversations/:id", c.history);
  router.patch("/api/zynora/conversations/:id", c.rename);
  router.delete("/api/zynora/conversations/:id", c.del);
  router.post("/api/zynora/conversations/:id/clear", c.clear);
};