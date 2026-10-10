const knowledgeController = require("../controllers/knowledgeController");

module.exports = function registerKnowledgeRoutes(router) {
  router.post("/api/knowledge", knowledgeController.create);
  router.get("/api/knowledge", knowledgeController.list);
  router.get("/api/knowledge/:id", knowledgeController.getOne);
  router.put("/api/knowledge/:id", knowledgeController.update);
  router.post("/api/knowledge/:id/approve", knowledgeController.approve);
  router.post("/api/knowledge/:id/activate", knowledgeController.activate);
  router.post("/api/knowledge/:id/archive", knowledgeController.archive);
  router.post("/api/knowledge/:id/restore", knowledgeController.restore);
  router.delete("/api/knowledge/:id", knowledgeController.remove);
};
