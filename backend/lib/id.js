// to create unique IDs, e.g. generateId("DOC") -> "DOC_4F91A2"
const crypto = require("crypto");

function generateId(prefix) {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}_${random}`;
}

module.exports = { generateId };
