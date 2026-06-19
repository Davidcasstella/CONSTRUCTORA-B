/**
 * Format WhatsApp-style text to React elements.
 * Converts *bold* syntax to <strong> tags.
 * Preserves newlines as <br/>.
 *
 * @param {string} text - Raw message text
 * @returns {React.ReactNode[]} Array of React elements
 */
export function formatWhatsAppText(text) {
  if (!text || typeof text !== 'string') return text || '';

  // Split by newlines first, then process each line for bold
  const lines = text.split('\n');
  const result = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      result.push(<br key={`br-${lineIdx}`} />);
    }

    // Process *bold* patterns in this line
    // Regex: match *text* where text doesn't contain * and is not empty
    const parts = line.split(/(\*[^*]+\*)/g);

    parts.forEach((part, partIdx) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        // Bold text — remove surrounding asterisks
        result.push(
          <strong key={`b-${lineIdx}-${partIdx}`}>{part.slice(1, -1)}</strong>
        );
      } else if (part) {
        // Wrap plain text in a span with a key so React can track it
        result.push(
          <span key={`t-${lineIdx}-${partIdx}`}>{part}</span>
        );
      }
    });
  });

  return result;
}
