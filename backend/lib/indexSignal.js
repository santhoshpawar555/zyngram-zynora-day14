// A tiny counter. Knowledge changes bump it; the RAG cache compares it to know when to reload.
let version = 0;
module.exports = {
  bump() { version += 1; },
  current() { return version; },
};