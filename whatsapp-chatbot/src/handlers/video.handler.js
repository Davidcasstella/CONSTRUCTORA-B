/**
 * ===========================================
 * HANDLER DE VIDEOS
 * ===========================================
 *
 * Responsabilidades:
 * - Procesar videos recibidos
 * - Extraer audio para transcripción (opcional)
 * - Extraer frames para análisis (opcional)
 * - Responder según el contenido
 *
 * NOTA: El procesamiento de video es costoso.
 * Considerar límites y uso de colas.
 */

const logger = require('../utils/logger');
const mediaService = require('../services/media.service');

class VideoHandler {
  constructor() {
    this.name = 'VideoHandler';
  }

  /**
   * Procesa un video recibido
   * @param {Object} message - Mensaje normalizado
   * @returns {Promise<string>} Respuesta
   */
  async process(message) {
    let videoPath = null;

    try {
      const userId = message.from;
      const mediaId = message.content?.mediaId;
      const caption = message.content?.caption || '';
      const mimeType = message.content?.mimeType || 'video/mp4';

      logger.debug(`Procesando video de ${userId}`, { mediaId, caption });

      // TODO: Implementar procesamiento de video
      // Opciones:
      // 1. Extraer audio y transcribir
      // 2. Extraer frames y analizar con Vision
      // 3. Ambos

      // Por ahora, respuesta placeholder
      const response = `He recibido tu video${caption ? ` con el texto: "${caption}"` : ''}.

El procesamiento de videos está en desarrollo. Por ahora puedo:

• Si el video contiene voz, envíalo como *nota de voz* y lo transcribiré
• Si quieres que analice algo visual, envía una *captura de pantalla*

¿En qué más puedo ayudarte?`;

      return response;

    } catch (error) {
      logger.error('Error en VideoHandler:', error);
      return 'Lo siento, no pude procesar el video. ¿Puedes describir su contenido?';

    } finally {
      if (videoPath) {
        await mediaService.deleteMedia(videoPath);
      }
    }
  }

  /**
   * Extrae audio de un video (para futura implementación)
   */
  async _extractAudio(videoPath) {
    // TODO: Usar ffmpeg para extraer audio
    // const ffmpeg = require('fluent-ffmpeg');
    // return new Promise((resolve, reject) => {
    //   ffmpeg(videoPath)
    //     .output(audioPath)
    //     .on('end', () => resolve(audioPath))
    //     .on('error', reject)
    //     .run();
    // });
    throw new Error('Extracción de audio no implementada');
  }

  /**
   * Extrae frames de un video (para futura implementación)
   */
  async _extractFrames(videoPath, count = 5) {
    // TODO: Usar ffmpeg para extraer frames
    throw new Error('Extracción de frames no implementada');
  }
}

module.exports = VideoHandler;
