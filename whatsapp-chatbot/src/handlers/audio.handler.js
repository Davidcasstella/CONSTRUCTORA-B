/**
 * ===========================================
 * HANDLER DE AUDIOS (NOTAS DE VOZ)
 * ===========================================
 *
 * Responsabilidades:
 * - Procesar audios/notas de voz recibidas
 * - Descargar audio de WhatsApp
 * - Transcribir con Whisper
 * - Generar respuesta basada en transcripción
 * - Limpiar archivos temporales
 */

const logger = require('../utils/logger');
const chatService = require('../services/chat.service');
const mediaService = require('../services/media.service');

class AudioHandler {
  constructor() {
    this.name = 'AudioHandler';
  }

  /**
   * Procesa un audio recibido
   * @param {Object} message - Mensaje normalizado
   * @returns {Promise<string>} Respuesta
   */
  async process(message) {
    let audioPath = null;

    try {
      const userId = message.from;
      const mediaId = message.content?.mediaId;
      const mimeType = message.content?.mimeType || 'audio/ogg';

      logger.debug(`Procesando audio de ${userId}`, { mediaId });

      // 1. Descargar el audio
      audioPath = await mediaService.downloadMedia(mediaId, mimeType);

      // 2. Transcribir y generar respuesta
      const result = await chatService.processAudioMessage(userId, audioPath);

      // 3. Formatear respuesta
      const response = this._formatResponse(result);

      return response;

    } catch (error) {
      logger.error('Error en AudioHandler:', error);
      return 'Lo siento, no pude procesar el audio. Por favor intenta enviarlo de nuevo o escribe tu mensaje.';

    } finally {
      // Limpiar archivo temporal
      if (audioPath) {
        await mediaService.deleteMedia(audioPath);
      }
    }
  }

  /**
   * Formatea la respuesta incluyendo transcripción
   */
  _formatResponse(result) {
    const { transcription, response } = result;

    // Opción 1: Solo respuesta
    // return response;

    // Opción 2: Incluir transcripción
    return `📝 *Transcripción:*
_${transcription}_

💬 *Respuesta:*
${response}`;
  }
}

module.exports = AudioHandler;
