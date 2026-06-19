/**
 * ===========================================
 * PROVEEDOR TWILIO
 * ===========================================
 *
 * Responsabilidades:
 * - Implementar comunicación con Twilio API
 * - Enviar mensajes de todos los tipos
 * - Descargar archivos multimedia
 * - Manejar autenticación con Twilio
 *
 * DOCUMENTACIÓN:
 * https://www.twilio.com/docs/whatsapp
 *
 * NOTA: Esta implementación es un placeholder.
 * Requiere la librería 'twilio' instalada para
 * funcionalidad completa.
 */

const axios = require('axios');
const BaseWhatsAppProvider = require('./base.provider');
const logger = require('../../utils/logger');

class TwilioProvider extends BaseWhatsAppProvider {
  constructor(config) {
    super(config);

    // TODO: Inicializar cliente Twilio oficial
    // const twilio = require('twilio');
    // this.client = twilio(config.accountSid, config.authToken);

    // Por ahora, usar axios con auth básica
    this.client = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.accountSid,
        password: config.authToken
      }
    });

    this.fromNumber = config.whatsappNumber;
  }

  /**
   * Formatea número para Twilio (prefijo whatsapp:)
   */
  formatPhoneNumber(phoneNumber) {
    const cleaned = super.formatPhoneNumber(phoneNumber);
    if (!cleaned.startsWith('whatsapp:')) {
      return `whatsapp:${cleaned.startsWith('+') ? cleaned : '+' + cleaned}`;
    }
    return cleaned;
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(to, message) {
    try {
      // TODO: Implementar con cliente Twilio oficial
      // return await this.client.messages.create({
      //   from: this.fromNumber,
      //   to: this.formatPhoneNumber(to),
      //   body: typeof message === 'string' ? message : message.text
      // });

      logger.debug('TwilioProvider.sendMessage (placeholder)', { to, message });

      // Placeholder - simular envío exitoso
      return {
        sid: `SM_placeholder_${Date.now()}`,
        status: 'queued'
      };

    } catch (error) {
      this._handleError('sendMessage', error);
    }
  }

  /**
   * Envía una imagen
   */
  async sendImage(to, imageUrl, caption = '') {
    try {
      // TODO: Implementar con cliente Twilio
      // return await this.client.messages.create({
      //   from: this.fromNumber,
      //   to: this.formatPhoneNumber(to),
      //   body: caption,
      //   mediaUrl: [imageUrl]
      // });

      logger.debug('TwilioProvider.sendImage (placeholder)', { to, imageUrl });

      return { sid: `SM_placeholder_${Date.now()}`, status: 'queued' };

    } catch (error) {
      this._handleError('sendImage', error);
    }
  }

  /**
   * Envía un audio
   */
  async sendAudio(to, audioUrl) {
    try {
      // Twilio usa mediaUrl para cualquier tipo de media
      logger.debug('TwilioProvider.sendAudio (placeholder)', { to, audioUrl });

      return { sid: `SM_placeholder_${Date.now()}`, status: 'queued' };

    } catch (error) {
      this._handleError('sendAudio', error);
    }
  }

  /**
   * Envía un video
   */
  async sendVideo(to, videoUrl, caption = '') {
    try {
      logger.debug('TwilioProvider.sendVideo (placeholder)', { to, videoUrl });

      return { sid: `SM_placeholder_${Date.now()}`, status: 'queued' };

    } catch (error) {
      this._handleError('sendVideo', error);
    }
  }

  /**
   * Envía un documento
   */
  async sendDocument(to, documentUrl, filename, caption = '') {
    try {
      logger.debug('TwilioProvider.sendDocument (placeholder)', { to, documentUrl });

      return { sid: `SM_placeholder_${Date.now()}`, status: 'queued' };

    } catch (error) {
      this._handleError('sendDocument', error);
    }
  }

  /**
   * Envía una ubicación
   */
  async sendLocation(to, latitude, longitude, name = '', address = '') {
    try {
      // Twilio requiere enviar ubicación como mensaje con coordenadas
      // o usar plantillas de ubicación
      const locationMessage = `📍 ${name}\n${address}\nhttps://maps.google.com/?q=${latitude},${longitude}`;

      return await this.sendMessage(to, locationMessage);

    } catch (error) {
      this._handleError('sendLocation', error);
    }
  }

  /**
   * Obtiene la URL de descarga de un archivo multimedia
   * En Twilio, la URL viene directamente en el webhook
   */
  async getMediaUrl(mediaId) {
    // En Twilio, el mediaId ES la URL
    // O se puede construir desde el SID
    return mediaId;
  }

  /**
   * Descarga un archivo multimedia
   */
  async downloadMedia(url) {
    try {
      const response = await axios.get(url, {
        auth: {
          username: this.config.accountSid,
          password: this.config.authToken
        },
        responseType: 'arraybuffer'
      });

      return Buffer.from(response.data);

    } catch (error) {
      this._handleError('downloadMedia', error);
    }
  }

  /**
   * Marca un mensaje como leído
   * Twilio no tiene esta funcionalidad directa
   */
  async markAsRead(messageId) {
    // Twilio no soporta marcar como leído
    // Se puede usar webhooks de status para tracking
    logger.debug('markAsRead no soportado en Twilio', { messageId });
  }

  /**
   * Maneja errores de la API de Twilio
   */
  _handleError(method, error) {
    const errorMessage = error.message || 'Error desconocido';

    logger.error(`Error en TwilioProvider.${method}:`, {
      message: errorMessage,
      code: error.code,
      status: error.status
    });

    throw new Error(errorMessage);
  }
}

module.exports = TwilioProvider;
