/**
 * ===========================================
 * MODELO DE CONVERSACIÓN
 * ===========================================
 *
 * Responsabilidades:
 * - Definir estructura de una conversación
 * - Agrupar mensajes por usuario
 * - Mantener contexto y estado
 * - Gestionar metadatos de la conversación
 *
 * Una conversación representa el hilo completo
 * de interacción con un usuario específico.
 */

/**
 * Estados de la conversación
 */
const ConversationStatus = {
  ACTIVE: 'active',
  WAITING: 'waiting',     // Esperando respuesta del usuario
  RESOLVED: 'resolved',
  ARCHIVED: 'archived'
};

/**
 * Clase Conversation
 * Representa una conversación con un usuario
 */
class Conversation {
  constructor(data = {}) {
    this.id = data.id || null;
    this.participantId = data.participantId || null;  // Número de WhatsApp
    this.participantName = data.participantName || null;
    this.status = data.status || ConversationStatus.ACTIVE;

    // Flujo activo (para máquinas de estado)
    this.activeFlow = data.activeFlow || null;
    this.flowState = data.flowState || {};

    // Contexto para la IA
    this.context = data.context || {
      systemPrompt: null,
      variables: {}
    };

    // Metadatos
    this.metadata = data.metadata || {};
    this.tags = data.tags || [];

    // Timestamps
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.lastMessageAt = data.lastMessageAt || null;

    // Gestión de chats
    this.customName = data.customName || null;
    this.isDeleted = data.isDeleted || false;

    // Mensajes (para memoria en caché, no se guarda en DB así)
    this._messages = [];
  }

  /**
   * Crea una nueva conversación para un usuario
   */
  static create(participantId, participantName = null) {
    return new Conversation({
      participantId,
      participantName,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Agrega un mensaje a la conversación (en memoria)
   */
  addMessage(message) {
    this._messages.push(message);
    this.lastMessageAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * Obtiene los últimos N mensajes
   */
  getRecentMessages(limit = 10) {
    return this._messages.slice(-limit);
  }

  /**
   * Obtiene mensajes en formato OpenAI
   */
  getMessagesForOpenAI(limit = 10) {
    return this.getRecentMessages(limit)
      .map(msg => msg.toOpenAIFormat());
  }

  /**
   * Establece un flujo activo
   */
  setActiveFlow(flowName, initialState = {}) {
    this.activeFlow = flowName;
    this.flowState = initialState;
    this.updatedAt = new Date();
  }

  /**
   * Limpia el flujo activo
   */
  clearFlow() {
    this.activeFlow = null;
    this.flowState = {};
    this.updatedAt = new Date();
  }

  /**
   * Actualiza el estado del flujo
   */
  updateFlowState(newState) {
    this.flowState = { ...this.flowState, ...newState };
    this.updatedAt = new Date();
  }

  /**
   * Establece una variable de contexto
   */
  setContextVariable(key, value) {
    this.context.variables[key] = value;
    this.updatedAt = new Date();
  }

  /**
   * Obtiene una variable de contexto
   */
  getContextVariable(key) {
    return this.context.variables[key];
  }

  /**
   * Convierte a objeto plano
   */
  toObject() {
    return {
      id: this.id,
      participantId: this.participantId,
      participantName: this.participantName,
      status: this.status,
      activeFlow: this.activeFlow,
      flowState: this.flowState,
      context: this.context,
      metadata: this.metadata,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastMessageAt: this.lastMessageAt,
      customName: this.customName,
      isDeleted: this.isDeleted
    };
  }

  /**
   * Verifica si la conversación está activa
   */
  isActive() {
    return this.status === ConversationStatus.ACTIVE;
  }

  /**
   * Verifica si hay un flujo activo
   */
  hasActiveFlow() {
    return this.activeFlow !== null;
  }
}

// ===========================================
// ESQUEMA MONGOOSE (Comentado)
// ===========================================
/*
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  participantName: String,
  status: {
    type: String,
    enum: Object.values(ConversationStatus),
    default: ConversationStatus.ACTIVE
  },
  activeFlow: String,
  flowState: mongoose.Schema.Types.Mixed,
  context: {
    systemPrompt: String,
    variables: mongoose.Schema.Types.Mixed
  },
  metadata: mongoose.Schema.Types.Mixed,
  tags: [String],
  lastMessageAt: Date
}, {
  timestamps: true
});

// Índice para búsqueda por estado y fecha
conversationSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
*/

module.exports = {
  Conversation,
  ConversationStatus
};
