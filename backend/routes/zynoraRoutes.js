/*
const zynoraController = require("../controllers/zynoraController");

module.exports = function registerZynoraRoutes(router) {
  router.post("/api/zynora/chat", zynoraController.chat);
  router.get("/api/zynora/history", zynoraController.history);
}; */
const zynoraController = require("../controllers/zynoraController");

module.exports = function registerZynoraRoutes(router) {
  router.post("/api/zynora/chat", zynoraController.chat);
};