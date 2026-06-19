// Utility formatters — migrated from dashboard-core.js

/**
 * Normalize phone number for display.
 * Converts WhatsApp formats to clean display format.
 */
export function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';

  let normalized = String(phoneNumber).trim();

  // Remove "whatsapp:" prefix
  normalized = normalized.replace(/^whatsapp:/i, '');

  // Remove @s.whatsapp.net, @lid suffix
  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0];
  }

  // Remove non-digit characters
  normalized = normalized.replace(/[^\d]/g, '');

  // Format Colombian numbers (+57 3XX XXX XXXX)
  if (normalized.startsWith('57') && normalized.length === 12) {
    const local = normalized.substring(2);
    return `+57 ${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6)}`;
  }

  // Other countries: show with + if country code present
  if (normalized.length > 10) {
    return '+' + normalized;
  }

  return normalized;
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return formatDate(dateString);
}

/**
 * Get initials from a name
 */
export function getInitials(name) {
  if (!name) return '??';
  const words = name.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

/**
 * Truncate text
 */
export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
