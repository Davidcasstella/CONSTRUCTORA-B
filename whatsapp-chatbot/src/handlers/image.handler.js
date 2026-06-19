/**
 * ===========================================
 * HANDLER DE IMÁGENES
 * ===========================================
 *
 * Responsabilidades:
 * - Procesar imágenes recibidas
 * - Descargar imagen de WhatsApp
 * - Analizar imagen con GPT-4 Vision
 * - Limpiar archivos temporales
 */

const logger = require('../utils/logger');
const chatService = require('../services/chat.service');
const mediaService = require('../services/media.service');

class ImageHandler {
  constructor() {
    this.name = 'ImageHandler';
  }

  /**
   * Procesa una imagen recibida
   * @param {Object} message - Mensaje normalizado
   * @returns {Promise<string>} Respuesta con análisis
   */
  async process(message) {
    let imagePath = null;

    try {
      const userId = message.from;
      const mediaId = message.content?.mediaId;
      const caption = message.content?.caption || '';
      const mimeType = message.content?.mimeType || 'image/jpeg';

      logger.debug(`Procesando imagen de ${userId}`, { mediaId, caption });

      // 1. Descargar la imagen
      imagePath = await mediaService.downloadMedia(mediaId, mimeType);

      // 2. TODO: Subir a un servicio de hosting temporal para obtener URL pública
      // OpenAI Vision requiere una URL accesible públicamente
      // Por ahora, usar el mediaId para obtener URL de Meta

      // 3. Analizar con Vision
      const prompt = caption
        ? `El usuario envió esta imagen con el texto: "${caption}". Analiza la imagen y responde considerando el contexto.`
        : 'Describe esta imagen de manera concisa y útil.';

      // TODO: Obtener URL pública de la imagen
      // const imageUrl = await getPublicUrl(imagePath);
      // const analysis = await chatService.generateVisionResponse(userId, imageUrl, prompt);

      // Placeholder hasta implementar URL pública
      const analysis = `He recibido tu imagen${caption ? ` con el texto: "${caption}"` : ''}.

Para poder analizar imágenes completamente, necesito configurar el acceso a la API de Vision.

Por ahora, ¿puedes describir qué hay en la imagen o qué necesitas saber sobre ella?`;

      return analysis;

    } catch (error) {
      logger.error('Error en ImageHandler:', error);
      return 'Lo siento, no pude procesar la imagen. Por favor intenta enviarla de nuevo.';

    } finally {
      // Limpiar archivo temporal
      if (imagePath) {
        await mediaService.deleteMedia(imagePath);
      }
    }
  }
}

module.exports = ImageHandler;
