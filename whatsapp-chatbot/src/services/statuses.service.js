/**
 * ===========================================
 * STATUSES SERVICE - NORBOY CHATBOT
 * ===========================================
 *
 * Manages the internal "Stories/Estados" system.
 * Data is persisted in data/statuses.json.
 * Images and videos are stored in uploads/statuses/.
 * Statuses expire automatically after 24 hours.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─── Paths ───────────────────────────────────────────────────────────────────
const DATA_DIR    = path.join(process.cwd(), 'data');
const DATA_FILE   = path.join(DATA_DIR, 'statuses.json');
const UPLOAD_DIR  = path.join(process.cwd(), 'uploads', 'statuses');

// ─── Ensure directories exist ─────────────────────────────────────────────────
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR))   fs.mkdirSync(DATA_DIR,   { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Read / Write helpers ─────────────────────────────────────────────────────
function readData() {
  ensureDirs();
  if (!fs.existsSync(DATA_FILE)) {
    return { statuses: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    logger.warn('statuses.service: error reading JSON, resetting.', err.message);
    return { statuses: [] };
  }
}

function writeData(data) {
  ensureDirs();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Purge expired entries (called before every read) ────────────────────────
function purgeExpired() {
  const data = readData();
  const now = Date.now();
  const before = data.statuses.length;
  data.statuses = data.statuses.filter(s => new Date(s.expiresAt).getTime() > now);
  const removed = before - data.statuses.length;

  if (removed > 0) {
    logger.info(`statuses.service: purged ${removed} expired status(es)`);
    writeData(data);
  }
  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all active (non-expired) statuses, newest first.
 */
function getAllActiveStatuses() {
  const data = purgeExpired();
  return [...data.statuses].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Creates a new text status.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.userName
 * @param {string} opts.content   - The text content
 * @param {string} [opts.color]   - Background color hex
 * @param {string} [opts.textColor]
 */
function createTextStatus({ userId, userName, content, color = '#075E54', textColor = '#ffffff' }) {
  if (!content || !content.trim()) throw new Error('El contenido no puede estar vacío');

  const now     = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 h

  const status = {
    id:        uuidv4(),
    userId,
    userName,
    type:      'text',
    content:   content.trim(),
    color,
    textColor,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  const data = readData();
  data.statuses.push(status);
  writeData(data);

  logger.info(`statuses.service: text status created by ${userName} (${userId})`);
  return status;
}

/**
 * Creates a new image status.
 * @param {object} opts
 * @param {string}   opts.userId
 * @param {string}   opts.userName
 * @param {Buffer}   opts.fileBuffer  - Raw image buffer
 * @param {string}   opts.mimetype    - e.g. 'image/jpeg'
 * @param {string}   opts.originalName
 * @param {string}   [opts.caption]
 */
function createImageStatus({ userId, userName, fileBuffer, mimetype, originalName, caption = '' }) {
  ensureDirs();

  // Determine extension
  const extMap  = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const ext     = extMap[mimetype] || path.extname(originalName) || '.jpg';
  const fileId  = uuidv4();
  const fileName = `${fileId}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  fs.writeFileSync(filePath, fileBuffer);

  const now     = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const status = {
    id:        fileId,
    userId,
    userName,
    type:      'image',
    content:   `/uploads/statuses/${fileName}`,  // served as static
    caption:   caption.trim(),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  const data = readData();
  data.statuses.push(status);
  writeData(data);

  logger.info(`statuses.service: image status created by ${userName} (${userId}) → ${fileName}`);
  return status;
}

/**
 * Creates a new video status.
 * @param {object} opts
 * @param {string}   opts.userId
 * @param {string}   opts.userName
 * @param {Buffer}   opts.fileBuffer  - Raw video buffer
 * @param {string}   opts.mimetype    - e.g. 'video/mp4'
 * @param {string}   opts.originalName
 * @param {string}   [opts.caption]
 */
function createVideoStatus({ userId, userName, fileBuffer, mimetype, originalName, caption = '' }) {
  ensureDirs();

  // Determine extension
  const extMap  = {
    'video/mp4':       '.mp4',
    'video/webm':      '.webm',
    'video/ogg':       '.ogv',
    'video/quicktime': '.mov',
  };
  const ext      = extMap[mimetype] || path.extname(originalName) || '.mp4';
  const fileId   = uuidv4();
  const fileName = `${fileId}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  fs.writeFileSync(filePath, fileBuffer);

  const now     = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const status = {
    id:        fileId,
    userId,
    userName,
    type:      'video',
    content:   `/uploads/statuses/${fileName}`,  // served as static
    caption:   caption.trim(),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  const data = readData();
  data.statuses.push(status);
  writeData(data);

  logger.info(`statuses.service: video status created by ${userName} (${userId}) → ${fileName}`);
  return status;
}

/**
 * Saves the WhatsApp message key of a published status.
 * Called automatically after auto-publishing so the key is available for deletion.
 *
 * @param {string} id          - Internal status ID
 * @param {object} waMessageKey - Baileys MessageKey: { id, remoteJid, fromMe, participant }
 */
function saveWhatsAppKey(id, waMessageKey) {
  const data = readData();
  const status = data.statuses.find(s => s.id === id);
  if (!status) return;    // Already purged — nothing to do
  status.waMessageKey = waMessageKey;
  writeData(data);
  logger.info(`statuses.service: saved waMessageKey for status ${id} (msgId=${waMessageKey?.id})`);
}

/**
 * Deletes a status by ID. Also removes the image file if applicable.
 * Returns the full deleted status object (including waMessageKey if present).
 *
 * @param {string} id
 * @param {string} requestingUserId  - only owner can delete
 * @returns {object} deleted status record
 */
function deleteStatus(id, requestingUserId) {
  const data = readData();
  const idx  = data.statuses.findIndex(s => s.id === id);

  if (idx === -1) throw new Error('Estado no encontrado');

  const status = data.statuses[idx];
  if (status.userId !== requestingUserId) {
    throw new Error('No tienes permiso para eliminar este estado');
  }

  // Remove media file if it was an image or video status
  if (status.type === 'image' || status.type === 'video') {
    const fileName = path.basename(status.content);
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`statuses.service: removed ${status.type} file ${fileName}`);
    }
  }

  data.statuses.splice(idx, 1);
  writeData(data);
  logger.info(`statuses.service: deleted status ${id} by ${requestingUserId}`);

  // Return the deleted status so callers can use waMessageKey to revoke on WhatsApp
  return status;
}

/**
 * Runs a full purge of expired statuses and cleans orphaned image files.
 * Intended to be called on a scheduled interval from server startup.
 */
function runMaintenancePurge() {
  purgeExpired();

  // Clean orphaned media files (image + video) with no matching JSON entry
  const data = readData();
  const knownFiles = new Set(
    data.statuses
      .filter(s => s.type === 'image' || s.type === 'video')
      .map(s => path.basename(s.content))
  );

  if (!fs.existsSync(UPLOAD_DIR)) return;
  const files = fs.readdirSync(UPLOAD_DIR);
  let cleaned = 0;
  for (const f of files) {
    if (!knownFiles.has(f)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, f));
      cleaned++;
    }
  }
  if (cleaned > 0) logger.info(`statuses.service: cleaned ${cleaned} orphaned image file(s)`);
}

module.exports = {
  getAllActiveStatuses,
  createTextStatus,
  createImageStatus,
  createVideoStatus,
  saveWhatsAppKey,
  deleteStatus,
  runMaintenancePurge,
};
