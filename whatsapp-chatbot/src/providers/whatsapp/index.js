/**
 * ===========================================
 * ÍNDICE DE PROVEEDORES WHATSAPP
 * ===========================================
 *
 * Responsibilities:
 * - Export the active provider via Factory/Strategy pattern
 * - Maintain backward compatibility (single-session API)
 * - Expose SessionManager for multi-session access
 *
 * USAGE (single-session, backward compat):
 *   const whatsappProvider = require('./providers/whatsapp');
 *   await whatsappProvider.sendMessage(to, message);
 *
 * USAGE (multi-session):
 *   const { getSessionManager } = require('./providers/whatsapp');
 *   const manager = getSessionManager();
 *   const session = manager.getSession('session2');
 *   await session.sendMessage(to, message);
 */

const config = require('../../config');
const logger = require('../../utils/logger');
const MetaProvider = require('./meta.provider');
const TwilioProvider = require('./twilio.provider');
const sessionManager = require('./session-manager');

// ===========================================
// FACTORY DE PROVEEDORES
// ===========================================

let nonBaileysInstance = null;

/**
 * Get the default provider (session1 for Baileys, or the single Meta/Twilio instance).
 * Backward-compatible — returns a single provider instance.
 */
const getProvider = () => {
  const providerType = config.whatsapp.provider;

  if (providerType === 'baileys') {
    // Return the default session (session1) from SessionManager
    const defaultSession = sessionManager.getDefaultSession();
    if (defaultSession) return defaultSession;
    // Fallback: SessionManager may not be initialized yet — this is fine during startup
    logger.warn('[WhatsApp-Index] Default session not available yet (SessionManager not initialized)');
    return null;
  }

  // Non-Baileys providers: singleton as before
  if (nonBaileysInstance) return nonBaileysInstance;

  switch (providerType) {
    case 'meta':
      nonBaileysInstance = new MetaProvider(config.whatsapp.meta);
      break;
    case 'twilio':
      nonBaileysInstance = new TwilioProvider(config.whatsapp.twilio);
      break;
    default:
      throw new Error(`Proveedor WhatsApp no soportado: ${providerType}`);
  }

  return nonBaileysInstance;
};

// ===========================================
// EXPORT PROVIDER API (backward compatible)
// ===========================================

module.exports = {
  /**
   * Send a text message
   * @param {string} to - Destination number
   * @param {string|Object} message - Message to send
   * @param {Object} [options] - Additional options
   */
  sendMessage: (to, message, options) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    return provider.sendMessage(to, message, options);
  },

  /**
   * Send an image
   */
  sendImage: (to, imageUrl, caption) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    return provider.sendImage(to, imageUrl, caption);
  },

  /**
   * Send a document
   */
  sendDocument: (to, documentUrl, filename) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    return provider.sendDocument(to, documentUrl, filename);
  },

  /**
   * Send a video
   */
  sendVideo: (to, videoPath, caption) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    return provider.sendVideo(to, videoPath, caption);
  },

  /**
   * Send an audio
   */
  sendAudio: (to, audioUrl) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    return provider.sendAudio(to, audioUrl);
  },

  /**
   * Send a generic multimedia message
   * @param {string} to - Destination number
   * @param {Object} mediaData - { type, url, filepath, filename, caption }
   */
  sendMediaMessage: async (to, mediaData) => {
    const provider = getProvider();
    if (!provider) throw new Error('WhatsApp provider not available');
    const fs = require('fs');
    const path = require('path');

    // Resolve file path (same logic as before)
    let fsPath = mediaData.filepath;

    if (!fsPath || !fs.existsSync(fsPath)) {
      const type = mediaData.type || 'image';
      const filename = mediaData.filename || path.basename(mediaData.url || '');

      if (filename) {
        const mediaService = require('../../services/media.service');
        await mediaService.getDashboardMediaBuffer(type, filename);
        const mediaConfig = require('../../config');
        fsPath = path.resolve(mediaConfig.media.uploadDir, type, filename);
      }
    }

    if (!fsPath || !fs.existsSync(fsPath)) {
      const cleanUrl = (mediaData.url || '').replace(/^\/?api\/conversations\//, '');
      fsPath = path.join(process.cwd(), cleanUrl);
    }

    if (!fs.existsSync(fsPath)) {
      throw new Error(`No se pudo localizar el archivo para enviar: ${fsPath}`);
    }

    const fileStats = fs.statSync(fsPath);
    logger.info(`📤 [WHATSAPP-INDEX] Enviando media: path=${fsPath}, size=${fileStats.size} bytes, type=${mediaData.type}`);

    if (fileStats.size === 0) {
      throw new Error(`Archivo vacío (0 bytes): ${fsPath}`);
    }

    switch (mediaData.type) {
      case 'audio':
        return await provider.sendAudio(to, fsPath);
      case 'image':
        return await provider.sendImage(to, fsPath, mediaData.caption || '');
      case 'video':
        return await provider.sendVideo(to, fsPath, mediaData.caption || '');
      case 'document':
        return await provider.sendDocument(to, fsPath, mediaData.filename, mediaData.caption || '');
      default:
        throw new Error(`Tipo multimedia no soportado: ${mediaData.type}`);
    }
  },

  /**
   * Get media download URL
   */
  getMediaUrl: (mediaId) => {
    const provider = getProvider();
    if (!provider) return null;
    return provider.getMediaUrl(mediaId);
  },

  /**
   * Download media
   */
  downloadMedia: (url) => {
    const provider = getProvider();
    if (!provider) return null;
    return provider.downloadMedia(url);
  },

  /**
   * Mark message as read
   */
  markAsRead: (messageId) => {
    const provider = getProvider();
    if (!provider) return;
    return provider.markAsRead(messageId);
  },

  /**
   * Fetch chats from WhatsApp
   */
  fetchChats: (limit) => {
    const provider = getProvider();
    if (!provider) return [];
    return provider.fetchChats(limit);
  },

  /**
   * Fetch chat messages
   */
  fetchChatMessages: (jid, limit, cursor) => {
    const provider = getProvider();
    if (!provider) return { messages: [] };
    return provider.fetchChatMessages(jid, limit, cursor);
  },

  /**
   * Get profile picture URL
   */
  getProfilePictureUrl: (jid) => {
    const provider = getProvider();
    if (!provider || typeof provider.getProfilePictureUrl !== 'function') return Promise.resolve(null);
    return provider.getProfilePictureUrl(jid);
  },

  /**
   * Send typing indicator
   */
  sendTyping: (to) => {
    const provider = getProvider();
    if (provider && typeof provider.sendTyping === 'function') return provider.sendTyping(to);
  },

  /**
   * Clear typing indicator
   */
  clearTyping: (to) => {
    const provider = getProvider();
    if (provider && typeof provider.clearTyping === 'function') return provider.clearTyping(to);
  },

  // Expose factories for direct access
  getProvider,

  /**
   * Get the SessionManager singleton for multi-session operations.
   * @returns {import('./session-manager')}
   */
  getSessionManager: () => sessionManager,
};
