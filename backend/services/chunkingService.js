const MAX_CHUNK_LENGTH = 500; 

function cleanText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/#+\s*/g, "") 
    .replace(/\*\*(.*?)\*\*/g, "$1") 
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitLongParagraph(paragraph) {
  if (paragraph.length <= MAX_CHUNK_LENGTH) return [paragraph];
  const sentences = paragraph.split(/(?<=[.!?\u0964\u0965])\s+/);
  const pieces = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > MAX_CHUNK_LENGTH && current) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current = (current + " " + sentence).trim();
    }
  }
  if (current) pieces.push(current.trim());
  return pieces;
}


function chunkText(rawContent, format) {
  const chunks = [];

  if (format === "json") {
    const sections = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    if (!Array.isArray(sections)) {
      throw new Error("JSON knowledge input must be an array of {heading, text} sections.");
    }
    sections.forEach((section, index) => {
      const cleaned = cleanText(section.text || "");
      if (!cleaned) return;
      splitLongParagraph(cleaned).forEach((piece, partIndex) => {
        chunks.push({
          section: section.heading || `Section ${index + 1}`,
          content: partIndex === 0 ? piece : `${piece} (continued)`,
        });
      });
    });
    return chunks;
  }

  const cleaned = cleanText(rawContent);
  const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  paragraphs.forEach((paragraph, index) => {
    splitLongParagraph(paragraph).forEach((piece) => {
      chunks.push({ section: `Paragraph ${index + 1}`, content: piece });
    });
  });
  return chunks;
}

module.exports = { chunkText, cleanText, MAX_CHUNK_LENGTH };