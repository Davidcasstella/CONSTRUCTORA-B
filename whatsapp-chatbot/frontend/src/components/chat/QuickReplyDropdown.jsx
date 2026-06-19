import './QuickReplyDropdown.css';

const PREVIEW_MAX = 70;

// Type icons — shown in dropdown for each quick reply
const TYPE_ICONS = {
  text: '⚡',
  image: '🖼️',
  video: '🎬',
  audio: '🎤',
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function QuickReplyDropdown({ visible, query, items, focusedIndex, onSelect }) {
  if (!visible) return null;

  return (
    <div className="qr-dropdown">
      <div className="qr-dropdown-header">
        ⚡ Respuestas Rápidas{query ? ` — "${query}"` : ''}
      </div>

      {items.length === 0 ? (
        <div className="qr-dropdown-empty">
          Sin resultados{query ? ` para "${query}"` : ''}
        </div>
      ) : (
        items.map((item, i) => {
          const itemType = item.type || 'text';
          const icon = TYPE_ICONS[itemType] || TYPE_ICONS.text;

          // For text: preview the content; for multimedia: preview the caption
          const rawPreview = itemType === 'text'
            ? (item.content || '')
            : (item.content || `[${itemType}]`);
          const preview = rawPreview.length > PREVIEW_MAX
            ? rawPreview.substring(0, PREVIEW_MAX) + '…'
            : rawPreview;

          return (
            <div
              key={item.id || i}
              className={`qr-dropdown-item${i === focusedIndex ? ' focused' : ''}`}
              onMouseDown={(e) => {
                // Use mousedown instead of click to fire before blur
                e.preventDefault();
                onSelect(item);
              }}
            >
              <span className="qr-dropdown-item-title">
                <span style={{ marginRight: 5, fontSize: 14 }}>{icon}</span>
                {item.title}
              </span>
              <span className="qr-dropdown-item-preview">{preview}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
