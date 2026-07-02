/**
 * ===========================================
 * SESSION MANAGER - Multi-Session WhatsApp
 * ===========================================
 *
 * Orchestrates N independent BaileysProvider instances.
 * Each session has its own:
 *   - QR code
 *   - Auth folder
 *   - Socket connection
 *   - State (connected/disconnected/waiting)
 *   - Phone number
 *
 * Events emitted (all include sessionId):
 *   - session:qr        { sessionId, qr }
 *   - session:ready      { sessionId, miNumero, miNombre }
 *   - session:authenticated { sessionId }
 *   - session:disconnected  { sessionId, reason }
 *   - session:expired    { sessionId, reason }
 *   - session:message    { sessionId, message }
 *   - session:outgoing   { sessionId, ...outgoingData }
 *
 * Architecture: Prepared for N sessions. Currently configured
 * with 2 sessions (session1, session2) but extensible.
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const BaileysProvider = require('./baileys.provider');
const logger = require('../../utils/logger');

// Session definitions — add more entries here to support N sessions
const SESSION_CONFIGS = [
  { sessionId: 'session1', authDir: 'baileys_auth_session1' },
  { sessionId: 'session2', authDir: 'baileys_auth_session2' },
];

class SessionManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, BaileysProvider>} */
    this.sessions = new Map();
    this._initialized = false;
  }

  /**
   * Initialize all configured sessions.
   * Migrates legacy auth folder (baileys_auth/) to session1 on first run.
   */
  async initialize() {
    if (this._initialized) {
      logger.warn('[SessionManager] Already initialized, skipping');
      return;
    }

    // Migrate legacy auth folder to session1 if needed
    this._migrateLegacyAuth();

    for (const config of SESSION_CONFIGS) {
      await this._createSession(config);
    }

    this._initialized = true;
    logger.info(`[SessionManager] ${this.sessions.size} sessions created`);
  }

  /**
   * Initialize all sessions' WhatsApp connections.
   * Call this after the HTTP server is listening.
   */
  async connectAll() {
    for (const [sessionId, provider] of this.sessions) {
      try {
        logger.info(`[SessionManager] Connecting session: ${sessionId}`);
        await provider.initialize();
      } catch (error) {
        logger.error(`[SessionManager] Error connecting ${sessionId}:`, error.message);
      }
    }
  }

  /**
   * Migrate legacy `baileys_auth/` folder to `baileys_auth_session1/`
   * so the existing session is preserved as session1.
   */
  _migrateLegacyAuth() {
    const legacyPath = path.join(process.cwd(), 'baileys_auth');
    const session1Path = path.join(process.cwd(), 'baileys_auth_session1');

    // Only migrate if legacy exists AND session1 does NOT exist
    if (fs.existsSync(legacyPath) && !fs.existsSync(session1Path)) {
      try {
        fs.renameSync(legacyPath, session1Path);
        logger.info('[SessionManager] Migrated legacy baileys_auth/ → baileys_auth_session1/');
      } catch (err) {
        logger.error(`[SessionManager] Migration failed: ${err.message}`);
        // Fallback: copy instead of rename
        try {
          fs.cpSync(legacyPath, session1Path, { recursive: true });
          logger.info('[SessionManager] Copied legacy auth via cpSync fallback');
        } catch (cpErr) {
          logger.error(`[SessionManager] Copy fallback also failed: ${cpErr.message}`);
        }
      }
    }
  }

  /**
   * Create a single BaileysProvider session and wire up events.
   * @param {{ sessionId: string, authDir: string }} config
   */
  async _createSession(config) {
    const { sessionId, authDir } = config;
    const authPath = path.join(process.cwd(), authDir);

    logger.info(`[SessionManager] Creating session: ${sessionId} (auth: ${authDir})`);

    const provider = new BaileysProvider({ sessionId, authPath });

    // --- Forward all provider events with sessionId ---

    provider.on('qr', (qr) => {
      logger.info(`[SessionManager] QR for ${sessionId}`);
      this.emit('session:qr', { sessionId, qr });
    });

    provider.on('authenticated', () => {
      logger.info(`[SessionManager] ${sessionId} authenticated`);
      this.emit('session:authenticated', { sessionId });
    });

    provider.on('ready', () => {
      const status = provider.getStatus();
      logger.info(`[SessionManager] ${sessionId} ready — number: ${status.miNumero}`);
      this.emit('session:ready', {
        sessionId,
        miNumero: status.miNumero,
        miNombre: status.miNombre,
      });
    });

    provider.on('disconnected', (reason) => {
      logger.warn(`[SessionManager] ${sessionId} disconnected: ${reason}`);
      this.emit('session:disconnected', { sessionId, reason });
    });

    provider.on('session-expired', (reason) => {
      logger.warn(`[SessionManager] ${sessionId} session expired: ${reason}`);
      this.emit('session:expired', { sessionId, reason });
    });

    provider.on('message', (message) => {
      this.emit('session:message', { sessionId, message });
    });

    provider.on('outgoing-message', (outgoing) => {
      this.emit('session:outgoing', { sessionId, ...outgoing });
    });

    // ✅ FIX: Forward message delivery failure events
    provider.on('message-failed', (data) => {
      logger.error(`[SessionManager] ${sessionId} message failed: to=${data.to}, retries=${data.retries}`);
      this.emit('session:message-failed', { sessionId, ...data });
    });

    // ✅ FIX: Forward session health issue events
    provider.on('session-issue', (data) => {
      logger.error(`[SessionManager] ${sessionId} session issue: ${data.message}`);
      this.emit('session:issue', { sessionId, ...data });
    });

    this.sessions.set(sessionId, provider);
  }

  // ===========================================
  // PUBLIC API
  // ===========================================

  /**
   * Get a specific session by ID.
   * @param {string} sessionId
   * @returns {BaileysProvider|undefined}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get the default session (session1) — for backward compatibility.
   * @returns {BaileysProvider|undefined}
   */
  getDefaultSession() {
    return this.sessions.get('session1');
  }

  /**
   * Get all session IDs.
   * @returns {string[]}
   */
  getSessionIds() {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get the WhatsApp client (sock) for a specific session.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getClient(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.getClient() : null;
  }

  /**
   * Get the default client (session1) — backward compat.
   * @returns {Object|null}
   */
  getDefaultClient() {
    return this.getClient('session1');
  }

  /**
   * Get status for a specific session.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const status = session.getStatus();
    return { ...status, sessionId };
  }

  /**
   * Get status for ALL sessions.
   * @returns {Object} { session1: {...}, session2: {...} }
   */
  getAllStatuses() {
    const result = {};
    for (const [id, provider] of this.sessions) {
      const status = provider.getStatus();
      result[id] = { ...status, sessionId: id };
    }
    return result;
  }

  /**
   * Get QR code for a specific session.
   * @param {string} sessionId
   * @returns {string|null}
   */
  getQRCode(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.getQRCode() : null;
  }

  /**
   * Destroy all sessions gracefully.
   */
  async destroy() {
    for (const [id, provider] of this.sessions) {
      try {
        await provider.destroy();
        logger.info(`[SessionManager] Session ${id} destroyed`);
      } catch (err) {
        logger.warn(`[SessionManager] Error destroying ${id}: ${err.message}`);
      }
    }
  }

  /**
   * Logout a specific session (clears auth and reconnects for new QR).
   * @param {string} sessionId
   */
  async logoutSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Full logout: removes auth files
    if (session.sock) {
      try {
        session.sock.ev.removeAllListeners();
        await session.sock.logout();
        logger.info(`[SessionManager] ${sessionId} logged out`);
      } catch (e) {
        logger.warn(`[SessionManager] Logout error for ${sessionId}: ${e.message}`);
        try { session.sock.end(undefined); } catch (e2) { /* ignore */ }
      }
      session.sock = null;
    }

    // Reset state
    this._resetSessionState(session);

    return session;
  }

  /**
   * Clear session auth files and reinitialize for new QR.
   * @param {string} sessionId
   */
  async clearSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Disconnect socket
    if (session.sock) {
      try {
        session.sock.ev.removeAllListeners();
        await session.sock.logout();
      } catch (e) {
        logger.warn(`[SessionManager] Clear-session logout error for ${sessionId}: ${e.message}`);
        try { session.sock.end(undefined); } catch (e2) { /* ignore */ }
      }
      session.sock = null;
    }

    // Reset state
    this._resetSessionState(session);

    // Delete auth files
    if (fs.existsSync(session.authPath)) {
      fs.rmSync(session.authPath, { recursive: true, force: true });
      logger.info(`[SessionManager] Auth files deleted for ${sessionId}: ${session.authPath}`);
    }

    return session;
  }

  /**
   * Reinitialize a specific session (after logout/clear).
   * @param {string} sessionId
   */
  async reinitializeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    await session.initialize();
  }

  /**
   * Reset internal state of a session.
   * @param {BaileysProvider} session
   * @private
   */
  _resetSessionState(session) {
    if (session.reconnectTimeout) {
      clearTimeout(session.reconnectTimeout);
      session.reconnectTimeout = null;
    }
    if (session.qrTimeout) {
      clearTimeout(session.qrTimeout);
      session.qrTimeout = null;
    }
    session.isReady = false;
    session.isConnecting = false;
    session.status = 'disconnected';
    session.qrCode = null;
    session.qrEmitted = false;
    session.miNumero = null;
    session.miLid = null;
    session.miNombre = null;
    if (typeof session.resetAuthFailures === 'function') {
      session.resetAuthFailures();
    }
  }

  /**
   * Find which session owns a given phone number.
   * Useful for routing replies through the correct session.
   * @param {string} phoneNumber - The bot's own phone number
   * @returns {BaileysProvider|null}
   */
  findSessionByPhone(phoneNumber) {
    if (!phoneNumber) return null;
    const clean = phoneNumber.replace(/[^0-9]/g, '');
    for (const [, provider] of this.sessions) {
      if (provider.miNumero && provider.miNumero.replace(/[^0-9]/g, '') === clean) {
        return provider;
      }
    }
    return null;
  }
}

// Singleton manager
const sessionManager = new SessionManager();

module.exports = sessionManager;
