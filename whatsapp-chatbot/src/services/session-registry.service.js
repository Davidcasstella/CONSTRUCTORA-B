/**
 * ===========================================
 * SESSION REGISTRY SERVICE
 * ===========================================
 *
 * Tracks all phone numbers that have ever connected
 * as the bot's own number. Persists to local JSON
 * so data survives restarts and reconnections.
 *
 * This ensures that even if the bot reconnects with
 * a different number, all previous sessions and their
 * media folders are preserved and accessible.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'session-registry.json');

// In-memory registry
let sessions = [];
let activeSession = null;

/**
 * Load registry from disk on startup
 */
function _loadRegistry() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(REGISTRY_FILE)) {
            const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
            sessions = JSON.parse(raw);
            logger.info(`📋 [SESSION-REGISTRY] ${sessions.length} sessions loaded from disk`);
        }
    } catch (err) {
        logger.warn(`⚠️ [SESSION-REGISTRY] Could not load registry: ${err.message}`);
        sessions = [];
    }
}

/**
 * Save registry to disk
 */
function _saveRegistry() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
        logger.debug(`💾 [SESSION-REGISTRY] Registry saved: ${sessions.length} sessions`);
    } catch (err) {
        logger.error(`❌ [SESSION-REGISTRY] Could not save registry: ${err.message}`);
    }
}

// Load on module init
_loadRegistry();

/**
 * Register a session (bot phone number)
 * Called when the bot connects to WhatsApp
 *
 * @param {string} phoneNumber - The bot's own phone number (digits only)
 */
function registerSession(phoneNumber) {
    if (!phoneNumber) return;

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;

    const now = new Date().toISOString();
    const existing = sessions.find(s => s.phoneNumber === cleanNumber);

    if (existing) {
        existing.lastSeen = now;
        existing.connectionCount = (existing.connectionCount || 0) + 1;
        logger.info(`📋 [SESSION-REGISTRY] Session updated: ${cleanNumber} (connection #${existing.connectionCount})`);
    } else {
        sessions.push({
            phoneNumber: cleanNumber,
            firstSeen: now,
            lastSeen: now,
            connectionCount: 1
        });
        logger.info(`📋 [SESSION-REGISTRY] New session registered: ${cleanNumber}`);
    }

    activeSession = cleanNumber;
    _saveRegistry();
}

/**
 * Get all registered sessions
 * @returns {Array<{phoneNumber: string, firstSeen: string, lastSeen: string, connectionCount: number}>}
 */
function getAllSessions() {
    return sessions.map(s => ({
        ...s,
        isActive: s.phoneNumber === activeSession
    }));
}

/**
 * Get the currently active session (connected bot number)
 * @returns {string|null}
 */
function getActiveSession() {
    return activeSession;
}

/**
 * Set active session without registering (for restoring state)
 * @param {string} phoneNumber
 */
function setActiveSession(phoneNumber) {
    activeSession = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : null;
}

module.exports = {
    registerSession,
    getAllSessions,
    getActiveSession,
    setActiveSession
};
