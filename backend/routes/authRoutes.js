const authController = require("../controllers/authController");

module.exports = function registerAuthRoutes(router) {
  router.post("/api/auth/login", authController.login);
};
