/**
 * ===========================================
 * PROVEEDOR BASE DE WHATSAPP (ABSTRACTO)
 * ===========================================
 *
 * Responsabilidades:
 * - Definir la interfaz común para todos los proveedores
 * - Servir como clase base para Meta y Twilio
 * - Documentar los métodos que deben implementarse
 *
 * PATRÓN: Template Method / Strategy
 *
 * Esta clase NO debe instanciarse directamente.
 * Las clases hijas (Meta, Twilio) deben implementar
 * todos los métodos abstractos.
 */

class BaseWhatsAppProvider {
  constructor(config) {
    if (this.constructor === BaseWhatsAppProvider) {
      throw new Error('BaseWhatsAppProvider es una clase abstracta');
    }
    this.config = config;
  }

  /**
   * Envía un mensaje de texto simple
   * @param {string} to - Número de teléfono destino (formato internacional)
   * @param {string|Object} message - Texto del mensaje o objeto con formato
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendMessage(to, message) {
    throw new Error('Método sendMessage() debe ser implementado');
  }

  /**
   * Envía una imagen
   * @param {string} to - Número de teléfono destino
   * @param {string} imageUrl - URL de la imagen
   * @param {string} caption - Texto opcional
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendImage(to, imageUrl, caption = '') {
    throw new Error('Método sendImage() debe ser implementado');
  }

  /**
   * Envía un audio
   * @param {string} to - Número de teléfono destino
   * @param {string} audioUrl - URL del audio
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendAudio(to, audioUrl) {
    throw new Error('Método sendAudio() debe ser implementado');
  }

  /**
   * Envía un video
   * @param {string} to - Número de teléfono destino
   * @param {string} videoUrl - URL del video
   * @param {string} caption - Texto opcional
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendVideo(to, videoUrl, caption = '') {
    throw new Error('Método sendVideo() debe ser implementado');
  }

  /**
   * Envía un documento/archivo
   * @param {string} to - Número de teléfono destino
   * @param {string} documentUrl - URL del documento
   * @param {string} filename - Nombre del archivo
   * @param {string} caption - Texto opcional
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendDocument(to, documentUrl, filename, caption = '') {
    throw new Error('Método sendDocument() debe ser implementado');
  }

  /**
   * Envía una ubicación
   * @param {string} to - Número de teléfono destino
   * @param {number} latitude - Latitud
   * @param {number} longitude - Longitud
   * @param {string} name - Nombre del lugar
   * @param {string} address - Dirección
   * @returns {Promise<Object>} Respuesta de la API
   * @abstract
   */
  async sendLocation(to, latitude, longitude, name = '', address = '') {
    throw new Error('Método sendLocation() debe ser implementado');
  }

  /**
   * Obtiene la URL de descarga de un archivo multimedia
   * @param {string} mediaId - ID del archivo en WhatsApp
   * @returns {Promise<string>} URL de descarga temporal
   * @abstract
   */
  async getMediaUrl(mediaId) {
    throw new Error('Método getMediaUrl() debe ser implementado');
  }

  /**
   * Descarga un archivo multimedia
   * @param {string} url - URL del archivo
   * @returns {Promise<Buffer>} Buffer con el contenido del archivo
   * @abstract
   */
  async downloadMedia(url) {
    throw new Error('Método downloadMedia() debe ser implementado');
  }

  /**
   * Marca un mensaje como leído
   * @param {string} messageId - ID del mensaje
   * @returns {Promise<void>}
   * @abstract
   */
  async markAsRead(messageId) {
    throw new Error('Método markAsRead() debe ser implementado');
  }

  /**
   * Envía indicador de "escribiendo..."
   * @param {string} to - Número de teléfono destino
   * @returns {Promise<void>}
   */
  async sendTypingIndicator(to) {
    // Implementación opcional
  }

  /**
   * Valida un número de teléfono
   * @param {string} phoneNumber - Número a validar
   * @returns {boolean}
   */
  validatePhoneNumber(phoneNumber) {
    // Validación básica: solo números, posible + al inicio
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    return phoneRegex.test(phoneNumber.replace(/\s/g, ''));
  }

  /**
   * Formatea un número de teléfono al formato requerido
   * @param {string} phoneNumber - Número original
   * @returns {string} Número formateado
   */
  formatPhoneNumber(phoneNumber) {
    // Quitar espacios y caracteres especiales excepto +
    return phoneNumber.replace(/[\s\-()]/g, '');
  }
}

module.exports = BaseWhatsAppProvider;
