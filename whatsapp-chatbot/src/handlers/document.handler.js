/**
 * ===========================================
 * HANDLER DE DOCUMENTOS (PDF, DOCX, etc.)
 * ===========================================
 *
 * Responsabilidades:
 * - Procesar documentos recibidos
 * - Extraer texto de PDFs
 * - Analizar contenido con IA
 * - Responder preguntas sobre el documento
 *
 * EXTENSIONES SOPORTADAS:
 * - PDF
 * - DOCX (futuro)
 * - XLSX (futuro)
 * - TXT
 */

const logger = require('../utils/logger');
const chatService = require('../services/chat.service');
const mediaService = require('../services/media.service');

class DocumentHandler {
  constructor() {
    this.name = 'DocumentHandler';
  }

  /**
   * Procesa un documento recibido
   * @param {Object} message - Mensaje normalizado
   * @returns {Promise<string>} Respuesta
   */
  async process(message) {
    let documentPath = null;

    try {
      const userId = message.from;
      const mediaId = message.content?.mediaId;
      const caption = message.content?.caption || '';
      const mimeType = message.content?.mimeType || 'application/pdf';

      logger.debug(`Procesando documento de ${userId}`, { mediaId, mimeType });

      // 1. Descargar el documento
      documentPath = await mediaService.downloadMedia(mediaId, mimeType);

      // 2. Extraer texto según el tipo
      const text = await this._extractText(documentPath, mimeType);

      if (!text || text.trim().length === 0) {
        return 'No pude extraer texto del documento. ¿Está vacío o es una imagen escaneada?';
      }

      // 3. Analizar con IA
      const prompt = caption
        ? `El usuario envió un documento con el comentario: "${caption}".
           Aquí está el contenido del documento:\n\n${text.substring(0, 4000)}\n\n
           Responde considerando el comentario del usuario.`
        : `El usuario envió un documento. Aquí está el contenido:\n\n${text.substring(0, 4000)}\n\n
           Proporciona un resumen conciso y pregunta si necesita algo específico.`;

      const response = await chatService.generateTextResponse(userId, prompt);

      return response;

    } catch (error) {
      logger.error('Error en DocumentHandler:', error);
      return 'Lo siento, no pude procesar el documento. Asegúrate de que sea un PDF válido.';

    } finally {
      if (documentPath) {
        await mediaService.deleteMedia(documentPath);
      }
    }
  }

  /**
   * Extrae texto de un documento según su tipo
   */
  async _extractText(filePath, mimeType) {
    try {
      if (mimeType === 'application/pdf') {
        return await this._extractFromPdf(filePath);
      }

      if (mimeType.includes('text')) {
        const fs = require('fs').promises;
        return await fs.readFile(filePath, 'utf-8');
      }

      // TODO: Agregar más extractores
      // - DOCX: usar 'mammoth' o 'docx-parser'
      // - XLSX: usar 'xlsx' o 'exceljs'

      logger.warn(`Extractor no disponible para: ${mimeType}`);
      return null;

    } catch (error) {
      logger.error('Error extrayendo texto:', error);
      return null;
    }
  }

  /**
   * Extrae texto de un PDF
   */
  async _extractFromPdf(filePath) {
    try {
      // TODO: Usar una librería de extracción de PDF
      // Opciones populares:
      // - pdf-parse (simple, bueno para texto)
      // - pdf2json (más detallado)
      // - pdfjs-dist (el mismo que usa Chrome)

      // Ejemplo con pdf-parse:
      // const pdfParse = require('pdf-parse');
      // const fs = require('fs');
      // const dataBuffer = fs.readFileSync(filePath);
      // const data = await pdfParse(dataBuffer);
      // return data.text;

      // Placeholder
      logger.debug('Extracción de PDF (pendiente de implementar)');
      return '[Contenido del PDF - pendiente de implementar extractor]';

    } catch (error) {
      logger.error('Error extrayendo PDF:', error);
      throw error;
    }
  }
}

module.exports = DocumentHandler;
