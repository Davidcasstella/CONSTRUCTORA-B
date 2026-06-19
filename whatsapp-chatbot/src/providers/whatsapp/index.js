/**
 * ===========================================
 * ÍNDICE DE PROVEEDORES WHATSAPP
 * ===========================================
 *
 * Responsabilidades:
 * - Exportar el proveedor activo según configuración
 * - Implementar patrón Factory/Strategy
 * - Abstraer la selección del proveedor
 *
 * USO:
 * const whatsappProvider = require('./providers/whatsapp');
 * await whatsappProvider.sendMessage(to, message);
 *
 * El código que usa este módulo NO necesita saber
 * si está usando Meta o Twilio.
 */

const config = require('../../config');
const logger = require('../../utils/logger');
const MetaProvider = require('./meta.provider');
const TwilioProvider = require('./twilio.provider');
const BaileysProvider = require('./baileys.provider');

// ===========================================
// FACTORY DE PROVEEDORES
// ===========================================

let providerInstance = null;

/**
 * Obtiene la instancia del proveedor activo
 * Implementa patrón Singleton para reutilizar conexión
 */
const getProvider = () => {
  if (providerInstance) {
    return providerInstance;
  }

  const providerType = config.whatsapp.provider;

  switch (providerType) {
    case 'meta':
      providerInstance = new MetaProvider(config.whatsapp.meta);
      break;
    case 'twilio':
      providerInstance = new TwilioProvider(config.whatsapp.twilio);
      break;
    case 'baileys':
      // BaileysProvider ya es un singleton, no hay que instanciarlo
      providerInstance = BaileysProvider;
      break;
    default:
      throw new Error(`Proveedor WhatsApp no soportado: ${providerType}`);
  }

  return providerInstance;
};

// ===========================================
// EXPORTAR MÉTODOS DEL PROVEEDOR ACTIVO
// ===========================================
// Esto permite usar el módulo directamente:
// whatsappProvider.sendMessage(...)

module.exports = {
  /**
   * Envía un mensaje de texto
   * @param {string} to - Número de destino
   * @param {string|Object} message - Mensaje a enviar
   */
  sendMessage: (to, message, options) => getProvider().sendMessage(to, message, options),

  /**
   * Envía una imagen
   * @param {string} to - Número de destino
   * @param {string} imageUrl - URL de la imagen
   * @param {string} caption - Texto opcional
   */
  sendImage: (to, imageUrl, caption) => getProvider().sendImage(to, imageUrl, caption),

  /**
   * Envía un documento
   * @param {string} to - Número de destino
   * @param {string} documentUrl - URL del documento
   * @param {string} filename - Nombre del archivo
   */
  sendDocument: (to, documentUrl, filename) => getProvider().sendDocument(to, documentUrl, filename),

  /**
   * ✅ NUEVO: Envía un video
   * @param {string} to - Número de destino
   * @param {string} videoPath - Ruta del video
   * @param {string} caption - Texto opcional
   */
  sendVideo: (to, videoPath, caption) => getProvider().sendVideo(to, videoPath, caption),

  /**
   * ✅ NUEVO: Envía un audio
   * @param {string} to - Número de destino
   * @param {string} audioUrl - URL del audio
   */
  sendAudio: (to, audioUrl) => getProvider().sendAudio(to, audioUrl),

  /**
   * ✅ NUEVO: Envía un mensaje multimedia genérico
   * @param {string} to - Número de destino
   * @param {Object} mediaData - Datos del multimedia { type, url, filepath, filename, caption }
   */
  sendMediaMessage: async (to, mediaData) => {
    const provider = getProvider();
    const fs = require('fs');
    const path = require('path');

    // 1. Intentar resolver ruta absoluta (si existe y es válida en este SO)
    let fsPath = mediaData.filepath;

    // Si la ruta no existe localmente (ej: subido en otro ambiente), intentar reconstruirla
    if (!fsPath || !fs.existsSync(fsPath)) {
      const type = mediaData.type || 'image';
      const filename = mediaData.filename || path.basename(mediaData.url || '');

      if (filename) {
        // Intentar usar el servicio de media para localizar/recuperar el archivo
        const mediaService = require('../../services/media.service');

        // Esto buscará localmente y si no existe, descargará de S3 (re-poblando el disco local)
        await mediaService.getDashboardMediaBuffer(type, filename);

        // Ahora la ruta local debería ser válida
        const config = require('../../config');
        fsPath = path.resolve(config.media.uploadDir, type, filename);
      }
    }

    // Si después de todo no hay ruta válida, intentar el fallback original (sanitizado)
    if (!fsPath || !fs.existsSync(fsPath)) {
      // Eliminar prefijo /api/conversations si existe en la URL
      const cleanUrl = (mediaData.url || '').replace(/^\/?api\/conversations\//, '');
      fsPath = path.join(process.cwd(), cleanUrl);
    }

    if (!fs.existsSync(fsPath)) {
      throw new Error(`No se pudo localizar el archivo para enviar: ${fsPath}`);
    }

    // ✅ Validate file size before sending
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
   * Obtiene la URL de descarga de un archivo multimedia
   * @param {string} mediaId - ID del archivo
   * @returns {Promise<string>} URL de descarga
   */
  getMediaUrl: (mediaId) => getProvider().getMediaUrl(mediaId),

  /**
   * Descarga un archivo multimedia
   * @param {string} url - URL del archivo
   * @returns {Promise<Buffer>} Contenido del archivo
   */
  downloadMedia: (url) => getProvider().downloadMedia(url),

  /**
   * Marca un mensaje como leído
   * @param {string} messageId - ID del mensaje
   */
  markAsRead: (messageId) => getProvider().markAsRead(messageId),

  /**
   * ✅ NUEVO: Obtiene los chats desde WhatsApp
   * @param {number} limit - Cantidad de chats
   * @returns {Promise<Array>} Lista de chats
   */
  fetchChats: (limit) => getProvider().fetchChats(limit),

  /**
   * ✅ NUEVO: Obtiene mensajes de un chat
   * @param {string} jid - JID del chat
   * @param {number} limit - Cantidad de mensajes
   * @param {string} cursor - Cursor para paginación
   * @returns {Promise<Object>} Mensajes y metadata
   */
  fetchChatMessages: (jid, limit, cursor) => getProvider().fetchChatMessages(jid, limit, cursor),

  /**
   * ✅ NUEVO: Envía indicador de "escribiendo..." (typing)
   * @param {string} to - Número de destino
   */
  sendTyping: (to) => {
    const provider = getProvider();
    if (typeof provider.sendTyping === 'function') return provider.sendTyping(to);
  },

  /**
   * ✅ NUEVO: Limpia el indicador de "escribiendo..."
   * @param {string} to - Número de destino
   */
  clearTyping: (to) => {
    const provider = getProvider();
    if (typeof provider.clearTyping === 'function') return provider.clearTyping(to);
  },

  // Exponer factory por si se necesita acceso directo
  getProvider
};
