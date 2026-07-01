/**
 * ===========================================
 * BUBBLE SPLITTER UTILITY
 * ===========================================
 *
 * Splits a bot response into multiple WhatsApp bubbles so the
 * conversation looks natural and human-like.
 *
 * Rules:
 *  1. Split on double line-breaks (\n\n) first — the AI is
 *     instructed to use them to separate ideas.
 *  2. If a paragraph is still very long (> MAX_CHARS), split it
 *     at sentence endings (. ! ?) to keep bubbles short.
 *  3. Remove leading ¿ from any bubble.
 *  4. Discard empty bubbles.
 *  5. Never return more than MAX_BUBBLES messages.
 */

const MAX_CHARS   = 300;  // Max characters per bubble
const MAX_BUBBLES = 5;    // Max number of bubbles to send

/**
 * Remove inverted question mark (¿) at start of sentences.
 * @param {string} text
 * @returns {string}
 */
function removeInvertedQuestionMark(text) {
  // Remove ¿ at very start of text or after whitespace/newline
  return text.replace(/(^|[\n\r\s])¿/g, '$1');
}

/**
 * Split a long paragraph at sentence boundaries.
 * @param {string} para
 * @returns {string[]}
 */
function splitLongParagraph(para) {
  if (para.length <= MAX_CHARS) return [para];

  const parts = [];
  // Split at sentence ends: ., !, ? followed by space or end
  const sentences = para.split(/(?<=[.!?])\s+/);

  let current = '';
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > MAX_CHARS && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.length > 0 ? parts : [para];
}

/**
 * Main function: split a bot response string into bubble strings.
 *
 * @param {string} text - Full bot response text
 * @returns {string[]} Array of bubble strings (at least 1)
 */
function splitIntoBubbles(text) {
  if (!text || typeof text !== 'string') return [];

  // 1. Clean inverted question marks
  const cleaned = removeInvertedQuestionMark(text.trim());

  // 2. Split by double newlines (paragraph separator)
  const rawParagraphs = cleaned
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // 3. Split any paragraph that's still too long
  const bubbles = [];
  for (const para of rawParagraphs) {
    const parts = splitLongParagraph(para);
    bubbles.push(...parts);
  }

  // 4. Limit to MAX_BUBBLES
  const limited = bubbles.slice(0, MAX_BUBBLES);

  // 5. Fallback: if nothing was produced, return the cleaned text as-is
  return limited.length > 0 ? limited : [cleaned];
}

module.exports = { splitIntoBubbles, removeInvertedQuestionMark };
