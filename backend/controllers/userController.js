// controllers/userController.js
const { db } = require("../db/store");
const { requireAdmin } = require("../middleware/auth");

async function updateUserRole(ctx) {
  
  requireAdmin(ctx.req);

  const { role } = ctx.body;
  if (!["admin", "staff"].includes(role)) {
    return { status: 400, body: { error: "Invalid role." } };
  }

  const targetId = ctx.params.id;
  const user = await db.users.findById(targetId);
  if (!user) {
    return { status: 404, body: { error: "User not found." } };
  }

  await db.users.update(targetId, { role });
  return { status: 200, body: { message: "Role updated.", userId: targetId, role } };
}

module.exports = { updateUserRole };