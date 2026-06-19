/**
 * ===========================================
 * SERVICIO DE MENSAJES
 * ===========================================
 *
 * Responsabilidades:
 * - Procesar mensajes entrantes
 * - Normalizar payload de diferentes proveedores
 * - Dirigir mensajes al handler correspondiente
 * - Orquestar respuestas
 *
 * Este servicio es el ORQUESTADOR principal del
 * flujo de mensajes en la aplicación.
 */

const logger = require('../utils/logger');
const config = require('../config');
const handlers = require('../handlers');
const whatsappProvider = require('../providers/whatsapp');
// const conversationRepository = require('../repositories/conversation.repository');

/**
 * Tipos de mensaje soportados
 */
const MessageTypes = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  LOCATION: 'location',
  CONTACT: 'contact',
  STICKER: 'sticker',
  UNKNOWN: 'unknown'
};

/**
 * Procesa un mensaje entrante del webhook
 * @param {Object} payload - Payload crudo del webhook
 */
const processIncoming = async (payload) => {
  try {
    // 1. Normalizar el payload según el proveedor
    const normalizedMessage = normalizePayload(payload);

    if (!normalizedMessage) {
      logger.debug('Payload no contiene mensaje procesable');
      return;
    }

    logger.info(`Mensaje recibido de ${normalizedMessage.from}`, {
      type: normalizedMessage.type,
      messageId: normalizedMessage.id
    });

    // 2. Obtener el handler correspondiente al tipo de mensaje
    const handler = handlers.getHandler(normalizedMessage.type);

    if (!handler) {
      logger.warn(`Handler no encontrado para tipo: ${normalizedMessage.type}`);
      return;
    }

    // 3. Procesar el mensaje con el handler
    const response = await handler.process(normalizedMessage);

    // 4. Enviar respuesta si existe
    if (response) {
      await sendResponse(normalizedMessage.from, response);
    }

    // 5. (Futuro) Guardar en historial de conversación
    // await conversationRepository.saveMessage(normalizedMessage, response);

  } catch (error) {
    logger.error('Error procesando mensaje entrante:', error);
    throw error;
  }
};

/**
 * Normaliza el payload del webhook según el proveedor
 * @param {Object} payload - Payload crudo
 * @returns {Object|null} Mensaje normalizado o null si no es procesable
 */
const normalizePayload = (payload) => {
  // TODO: Implementar normalización según proveedor activo

  if (config.whatsapp.provider === 'meta') {
    return normalizeMetaPayload(payload);
  }

  if (config.whatsapp.provider === 'twilio') {
    return normalizeTwilioPayload(payload);
  }

  return null;
};

/**
 * Normaliza payload de Meta (Cloud API)
 *
 * ✅ CORREGIDO: Ahora extrae el número real del contacto (wa_id)
 * En algunos casos, Meta envía un "lid" (local ID interno) en message.from
 * pero el número real del cliente está en contacts[0].wa_id
 */
const normalizeMetaPayload = (payload) => {
  // Estructura esperada: payload.entry[0].changes[0].value.messages[0]

  try {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    // ✅ CORRECCIÓN: Extraer el número real del contacto
    // El wa_id del contacto es el número de teléfono real del cliente
    const contacts = value?.contacts;
    const contact = contacts?.[0];
    const realPhoneNumber = contact?.wa_id || message.from;
    const contactName = contact?.profile?.name || null;

    // Log para debugging
    if (message.from !== realPhoneNumber) {
      logger.info(`📱 Número corregido: ${message.from} → ${realPhoneNumber}`);
    }

    return {
      id: message.id,
      from: message.from,
      // ✅ NUEVO: Número real del contacto (usar para guardar en conversación)
      realPhoneNumber: realPhoneNumber,
      // ✅ NUEVO: Nombre del contacto de WhatsApp
      pushName: contactName,
      timestamp: message.timestamp,
      type: detectMessageType(message),
      content: extractContent(message),
      raw: message // Mantener original por si se necesita
    };
  } catch (error) {
    logger.error('Error normalizando payload Meta:', error);
    return null;
  }
};

/**
 * Normaliza payload de Twilio
 */
const normalizeTwilioPayload = (payload) => {
  // TODO: Implementar extracción de datos de Twilio
  // Estructura diferente a Meta

  try {
    return {
      id: payload.MessageSid,
      from: payload.From?.replace('whatsapp:', ''),
      timestamp: Date.now(),
      type: detectTwilioMessageType(payload),
      content: extractTwilioContent(payload),
      raw: payload
    };
  } catch (error) {
    logger.error('Error normalizando payload Twilio:', error);
    return null;
  }
};

/**
 * Detecta el tipo de mensaje (Meta)
 */
const detectMessageType = (message) => {
  if (message.text) return MessageTypes.TEXT;
  if (message.image) return MessageTypes.IMAGE;
  if (message.audio) return MessageTypes.AUDIO;
  if (message.video) return MessageTypes.VIDEO;
  if (message.document) return MessageTypes.DOCUMENT;
  if (message.location) return MessageTypes.LOCATION;
  if (message.contacts) return MessageTypes.CONTACT;
  if (message.sticker) return MessageTypes.STICKER;
  return MessageTypes.UNKNOWN;
};

/**
 * Detecta el tipo de mensaje (Twilio)
 */
const detectTwilioMessageType = (payload) => {
  // TODO: Implementar detección para Twilio
  if (payload.NumMedia > 0) {
    const mediaType = payload.MediaContentType0;
    if (mediaType?.startsWith('image')) return MessageTypes.IMAGE;
    if (mediaType?.startsWith('audio')) return MessageTypes.AUDIO;
    if (mediaType?.startsWith('video')) return MessageTypes.VIDEO;
    if (mediaType?.includes('pdf')) return MessageTypes.DOCUMENT;
  }
  return MessageTypes.TEXT;
};

/**
 * Extrae el contenido según el tipo (Meta)
 */
const extractContent = (message) => {
  // TODO: Extraer contenido específico según tipo
  return {
    text: message.text?.body,
    mediaId: message.image?.id || message.audio?.id || message.video?.id || message.document?.id,
    mimeType: message.image?.mime_type || message.audio?.mime_type,
    caption: message.image?.caption || message.video?.caption
  };
};

/**
 * Extrae el contenido según el tipo (Twilio)
 */
const extractTwilioContent = (payload) => {
  return {
    text: payload.Body,
    mediaUrl: payload.MediaUrl0,
    mimeType: payload.MediaContentType0
  };
};

/**
 * Envía una respuesta al usuario
 */
const sendResponse = async (to, response) => {
  try {
    await whatsappProvider.sendMessage(to, response);
    logger.info(`Respuesta enviada a ${to}`);
  } catch (error) {
    logger.error('Error enviando respuesta:', error);
    throw error;
  }
};

module.exports = {
  processIncoming,
  MessageTypes,
  normalizePayload
};
