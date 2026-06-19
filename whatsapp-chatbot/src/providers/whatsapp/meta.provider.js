/**
 * ===========================================
 * PROVEEDOR META (FACEBOOK CLOUD API)
 * ===========================================
 *
 * Responsabilidades:
 * - Implementar comunicación con Meta Cloud API
 * - Enviar mensajes de todos los tipos
 * - Descargar archivos multimedia
 * - Manejar autenticación con Meta
 *
 * DOCUMENTACIÓN:
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const axios = require('axios');
const BaseWhatsAppProvider = require('./base.provider');
const logger = require('../../utils/logger');

class MetaProvider extends BaseWhatsAppProvider {
  constructor(config) {
    super(config);

    // Cliente HTTP configurado para Meta API
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(to, message) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'text',
        text: {
          preview_url: false,
          body: typeof message === 'string' ? message : message.text
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      logger.debug('Mensaje enviado (Meta)', { to, messageId: response.data.messages?.[0]?.id });
      return response.data;

    } catch (error) {
      this._handleError('sendMessage', error);
    }
  }

  /**
   * Envía una imagen
   */
  async sendImage(to, imageUrl, caption = '') {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return response.data;

    } catch (error) {
      this._handleError('sendImage', error);
    }
  }

  /**
   * Envía un audio
   */
  async sendAudio(to, audioUrl) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'audio',
        audio: {
          link: audioUrl
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return response.data;

    } catch (error) {
      this._handleError('sendAudio', error);
    }
  }

  /**
   * Envía un video
   */
  async sendVideo(to, videoUrl, caption = '') {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'video',
        video: {
          link: videoUrl,
          caption: caption
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return response.data;

    } catch (error) {
      this._handleError('sendVideo', error);
    }
  }

  /**
   * Envía un documento
   */
  async sendDocument(to, documentUrl, filename, caption = '') {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'document',
        document: {
          link: documentUrl,
          filename: filename,
          caption: caption
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return response.data;

    } catch (error) {
      this._handleError('sendDocument', error);
    }
  }

  /**
   * Envía una ubicación
   */
  async sendLocation(to, latitude, longitude, name = '', address = '') {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'location',
        location: {
          latitude,
          longitude,
          name,
          address
        }
      };

      const response = await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      return response.data;

    } catch (error) {
      this._handleError('sendLocation', error);
    }
  }

  /**
   * Obtiene la URL de descarga de un archivo multimedia
   */
  async getMediaUrl(mediaId) {
    try {
      const response = await this.client.get(`/${mediaId}`);
      return response.data.url;
    } catch (error) {
      this._handleError('getMediaUrl', error);
    }
  }

  /**
   * Descarga un archivo multimedia
   */
  async downloadMedia(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
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
   */
  async markAsRead(messageId) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      };

      await this.client.post(
        `/${this.config.phoneNumberId}/messages`,
        payload
      );

      logger.debug('Mensaje marcado como leído', { messageId });

    } catch (error) {
      // No lanzar error si falla, solo loguear
      logger.warn('Error marcando mensaje como leído:', error.message);
    }
  }

  /**
   * Maneja errores de la API de Meta
   */
  _handleError(method, error) {
    const errorData = error.response?.data?.error || {};

    logger.error(`Error en MetaProvider.${method}:`, {
      message: errorData.message || error.message,
      code: errorData.code,
      type: errorData.type
    });

    throw new Error(errorData.message || error.message);
  }
}

module.exports = MetaProvider;
