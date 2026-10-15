// routes/userRoutes.js
const { updateUserRole } = require("../controllers/userController");

function registerUserRoutes(router) {
  router.post("/api/users/:id/role", updateUserRole);
}

module.exports = { registerUserRoutes };