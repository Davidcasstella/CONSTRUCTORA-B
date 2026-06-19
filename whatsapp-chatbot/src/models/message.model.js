/**
 * ===========================================
 * MODELO DE MENSAJE
 * ===========================================
 *
 * Responsabilidades:
 * - Definir estructura de un mensaje
 * - Validar datos de mensaje
 * - Serializar/deserializar mensajes
 *
 * Este modelo representa tanto mensajes entrantes
 * como salientes en el sistema.
 *
 * NOTA: Preparado para usar con MongoDB (Mongoose)
 * o cualquier otra base de datos.
 */

/**
 * Tipos de mensaje soportados
 */
const MessageType = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  LOCATION: 'location',
  CONTACT: 'contact',
  STICKER: 'sticker'
};

/**
 * Dirección del mensaje
 */
const MessageDirection = {
  INCOMING: 'incoming',  // Del usuario
  OUTGOING: 'outgoing'   // Del bot
};

/**
 * Estado del mensaje
 */
const MessageStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

/**
 * Clase Message
 * Representa un mensaje en el sistema
 */
class Message {
  constructor(data = {}) {
    this.id = data.id || null;
    this.conversationId = data.conversationId || null;
    this.participantId = data.participantId || null; // ✅ Para GSI en DynamoDB
    this.direction = data.direction || MessageDirection.INCOMING;
    this.type = data.type || MessageType.TEXT;
    this.content = data.content || {};
    this.from = data.from || null;
    this.to = data.to || null;
    this.status = data.status || MessageStatus.PENDING;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Crea un mensaje de texto
   */
  static createText(from, to, text, direction = MessageDirection.OUTGOING) {
    return new Message({
      direction,
      type: MessageType.TEXT,
      content: { text },
      from,
      to
    });
  }

  /**
   * Crea un mensaje desde payload normalizado
   */
  static fromNormalized(normalizedMessage) {
    return new Message({
      id: normalizedMessage.id,
      direction: MessageDirection.INCOMING,
      type: normalizedMessage.type,
      content: normalizedMessage.content,
      from: normalizedMessage.from,
      metadata: {
        raw: normalizedMessage.raw
      }
    });
  }

  /**
   * Convierte a objeto plano (para guardar en DB)
   */
  toObject() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      direction: this.direction,
      type: this.type,
      content: this.content,
      from: this.from,
      to: this.to,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Convierte a formato JSON para la API de OpenAI
   */
  toOpenAIFormat() {
    const role = this.direction === MessageDirection.INCOMING ? 'user' : 'assistant';
    return {
      role,
      content: this.content.text || '[contenido multimedia]'
    };
  }

  /**
   * Valida el mensaje
   */
  validate() {
    const errors = [];

    if (!this.from && this.direction === MessageDirection.INCOMING) {
      errors.push('Campo "from" requerido para mensajes entrantes');
    }

    if (!this.to && this.direction === MessageDirection.OUTGOING) {
      errors.push('Campo "to" requerido para mensajes salientes');
    }

    if (!Object.values(MessageType).includes(this.type)) {
      errors.push(`Tipo de mensaje inválido: ${this.type}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// ===========================================
// ESQUEMA MONGOOSE (Comentado - Activar cuando se use DB)
// ===========================================
/*
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: Object.values(MessageDirection),
    required: true
  },
  type: {
    type: String,
    enum: Object.values(MessageType),
    default: MessageType.TEXT
  },
  content: {
    text: String,
    mediaId: String,
    mediaUrl: String,
    mimeType: String,
    caption: String
  },
  from: String,
  to: String,
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.PENDING
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Índices para búsquedas eficientes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ from: 1 });

module.exports = mongoose.model('Message', messageSchema);
*/

module.exports = {
  Message,
  MessageType,
  MessageDirection,
  MessageStatus
};
