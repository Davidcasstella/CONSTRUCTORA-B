/**
 * ===========================================
 * REPOSITORIO DE CONVERSACIONES - DYNAMODB
 * ===========================================
 *
 * Responsabilidades:
 * - Abstracción de la capa de persistencia
 * - CRUD de conversaciones en DynamoDB
 * - CRUD de mensajes en DynamoDB
 * - Consultas especializadas
 *
 * PATRÓN: Repository
 * Permite cambiar la implementación de almacenamiento
 * sin afectar el resto de la aplicación.
 */

const logger = require('../utils/logger');
const { Conversation } = require('../models/conversation.model');
const { Message } = require('../models/message.model');
const { docClient, isConfigured, TABLES } = require('../providers/dynamodb.provider');
const { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

/**
 * Repositorio de Conversaciones con DynamoDB
 */
class ConversationRepository {

  /**
   * Verifica si DynamoDB está configurado
   * @returns {boolean}
   */
  _isAvailable() {
    if (!isConfigured || !docClient) {
      return false;
    }
    return true;
  }

  // ===========================================
  // OPERACIONES DE CONVERSACIÓN
  // ===========================================

  /**
   * Busca una conversación por ID de participante (número)
   * @param {string} participantId - Número de WhatsApp
   * @returns {Promise<Conversation|null>}
   */
  async findByParticipantId(participantId) {
    if (!this._isAvailable()) return null;
    try {
      const command = new GetCommand({
        TableName: TABLES.CONVERSATIONS,
        Key: { participantId }
      });

      const response = await docClient.send(command);

      if (!response.Item) {
        return null;
      }

      return new Conversation(response.Item);
    } catch (error) {
      logger.error(`Error buscando conversación ${participantId}:`, error);
      throw error;
    }
  }

  /**
   * Busca o crea una conversación
   * @param {string} participantId
   * @returns {Promise<Conversation>}
   */
  async findOrCreate(participantId) {
    let conversation = await this.findByParticipantId(participantId);

    if (!conversation) {
      conversation = Conversation.create(participantId);
      await this.save(conversation);
      logger.debug(`Nueva conversación creada para ${participantId}`);
    }

    return conversation;
  }

  /**
   * Guarda una conversación
   * @param {Conversation} conversation
   * @returns {Promise<Conversation>}
   */
  async save(conversation) {
    if (!this._isAvailable()) return conversation;
    try {
      conversation.updatedAt = new Date();

      const obj = conversation.toObject();

      // Convertir fechas a ISO strings para DynamoDB
      const item = {
        ...obj,
        createdAt: obj.createdAt ? obj.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: obj.updatedAt ? obj.updatedAt.toISOString() : new Date().toISOString(),
        lastMessageAt: obj.lastMessageAt ? obj.lastMessageAt.toISOString() : null,
        lastInteraction: obj.updatedAt ? obj.updatedAt.getTime() : Date.now() // Para índice numérico
      };

      const command = new PutCommand({
        TableName: TABLES.CONVERSATIONS,
        Item: item
      });

      await docClient.send(command);
      return conversation;
    } catch (error) {
      logger.error(`Error guardando conversación:`, error);
      throw error;
    }
  }

  /**
   * Guarda una conversación directamente (raw) sin pasar por el modelo
   * Útil para guardar datos desde memoria con todos los campos
   * @param {Object} data - Datos planos de la conversación
   * @returns {Promise<Object>}
   */
  async saveRaw(data) {
    if (!this._isAvailable()) return data;
    try {
      // Asegurar que tiene participantId
      if (!data.participantId && !data.userId) {
        throw new Error('participantId o userId es requerido');
      }

      const participantId = data.participantId || data.userId;

      // Preparar item para DynamoDB
      const item = {
        // Campos base del modelo Conversation
        participantId: participantId,
        id: data.id || null,
        participantName: data.participantName || data.whatsappName || null,
        status: data.status || 'active',
        activeFlow: data.activeFlow || null,
        flowState: data.flowState || {},
        context: data.context || { systemPrompt: null, variables: {} },
        metadata: data.metadata || {},
        tags: data.tags || [],

        // Timestamps
        createdAt: data.createdAt ? (data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessageAt: data.lastMessageAt ? (data.lastMessageAt instanceof Date ? data.lastMessageAt.toISOString() : data.lastMessageAt) : null,
        lastInteraction: data.lastInteraction || Date.now(),

        // Campos adicionales de memoria (se guardan como están)
        phoneNumber: data.phoneNumber || null,
        whatsappName: data.whatsappName || null,
        whatsappNameUpdatedAt: data.whatsappNameUpdatedAt || null,
        bot_active: data.bot_active !== undefined ? data.bot_active : true,
        // ✅ NUEVO: Persistencia de gestión
        customName: data.customName || null,
        isDeleted: data.isDeleted || false,
        consentStatus: data.consentStatus || 'pending',
        consentMessageSent: data.consentMessageSent || false,
        welcomeSent: data.welcomeSent || false,
        interactionCount: data.interactionCount || 0,
        messageCount: data.messageCount || 0,
        lastMessage: data.lastMessage || '',
        needsHuman: data.needsHuman || false,
        needsHumanReason: data.needsHumanReason || null,
        assignedTo: data.assignedTo || null,
        advisorName: data.advisorName || null,
        takenAt: data.takenAt || null,
        escalationCount: data.escalationCount || 0,
        advisorMessages: data.advisorMessages || [],
        botDeactivatedAt: data.botDeactivatedAt || null,
        botDeactivatedBy: data.botDeactivatedBy || null,
        escalationMessageSent: data.escalationMessageSent || false,
        waitingForHuman: data.waitingForHuman || false,
        lastEscalationMessageAt: data.lastEscalationMessageAt || null,
        manuallyReactivated: data.manuallyReactivated || false
      };

      const command = new PutCommand({
        TableName: TABLES.CONVERSATIONS,
        Item: item
      });

      await docClient.send(command);
      logger.debug(`💾 Conversación guardada (raw): ${participantId}`);
      return data;
    } catch (error) {
      logger.error(`Error guardando conversación (raw):`, error);
      throw error;
    }
  }

  /**
   * Actualiza una conversación
   * @param {string} participantId
   * @param {Object} updates
   * @returns {Promise<Conversation|null>}
   */
  async update(participantId, updates) {
    const conversation = await this.findByParticipantId(participantId);

    if (!conversation) {
      return null;
    }

    Object.assign(conversation, updates);
    return await this.save(conversation);
  }

  /**
   * Elimina una conversación
   * @param {string} participantId
   * @returns {Promise<boolean>}
   */
  async delete(participantId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.CONVERSATIONS,
        Key: { participantId }
      });

      await docClient.send(command);

      // También eliminar mensajes asociados (esto debería hacerse en un batch)
      // Por ahora lo dejamos para optimizar después

      return true;
    } catch (error) {
      logger.error(`Error eliminando conversación ${participantId}:`, error);
      return false;
    }
  }

  // ✅ PERFORMANCE: In-memory cache for findActive to avoid repeated full table scans
  // DynamoDB Scan is expensive and can exceed provisioned throughput
  _findActiveCache = { conversations: null, ts: 0 };
  _CACHE_TTL_MS = 30000; // 30 seconds

  /**
   * Invalidate the findActive cache (call after write operations)
   */
  invalidateCache() {
    this._findActiveCache = { conversations: null, ts: 0 };
  }

  /**
   * Lista TODAS las conversaciones (sin filtro de status)
   * Uses 30-second cache to avoid repeated DynamoDB full table scans
   * @param {Object} options - Opciones de paginación
   * @returns {Promise<Array<Conversation>>}
   */
  async findActive(options = {}) {
    // ✅ FIX: Add guard — other methods have this but findActive() was missing it
    if (!this._isAvailable()) return [];

    const { limit = 500, offset = 0 } = options;

    try {
      // Check cache first
      const now = Date.now();
      if (this._findActiveCache.conversations && (now - this._findActiveCache.ts) < this._CACHE_TTL_MS) {
        const cached = this._findActiveCache.conversations;
        const sliced = cached.slice(offset, offset + limit);
        logger.info(`⚡ [DYNAMO] findActive from CACHE (${sliced.length}/${cached.length}, age: ${now - this._findActiveCache.ts}ms)`);
        return sliced;
      }

      logger.info(`🔍 [DYNAMO] findActive SCAN (limit=${limit}, offset=${offset})`);

      // Full scan — paginate through all items
      let allItems = [];
      let lastEvaluatedKey = undefined;

      do {
        const command = new ScanCommand({
          TableName: TABLES.CONVERSATIONS,
          ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
        });

        const response = await docClient.send(command);
        allItems.push(...(response.Items || []));
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      const conversations = allItems
        .map(item => new Conversation(item))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      // Store in cache
      this._findActiveCache = { conversations, ts: Date.now() };
      logger.info(`✅ [DYNAMO] Scanned ${allItems.length} items, cached for ${this._CACHE_TTL_MS}ms`);

      const sliced = conversations.slice(offset, offset + limit);
      return sliced;
    } catch (error) {
      logger.error('❌ [DYNAMO] Error listando conversaciones:', error);
      logger.error(`   Error: ${error.message}, Código: ${error.$metadata?.httpStatusCode}`);
      // On error, return cached data if available (stale is better than nothing)
      if (this._findActiveCache.conversations) {
        logger.warn('⚠️ [DYNAMO] Returning stale cache due to scan error');
        const sliced = this._findActiveCache.conversations.slice(offset, offset + limit);
        return sliced;
      }
      return [];
    }
  }

  /**
   * Busca múltiples conversaciones por ID (BatchGetItem)
   * @param {string[]} ids - Lista de participantIds
   * @returns {Promise<Array<Conversation>>}
   */
  async findAllByIds(ids) {
    if (!ids || ids.length === 0) return [];
    if (!this._isAvailable()) return [];

    try {
      // DynamoDB BatchGetItem limit is 100
      const uniqueIds = [...new Set(ids)].filter(Boolean);
      if (uniqueIds.length === 0) return [];

      // Process in chunks of 100 if necessary
      const chunks = [];
      for (let i = 0; i < uniqueIds.length; i += 100) {
        chunks.push(uniqueIds.slice(i, i + 100));
      }

      const allItems = [];

      for (const chunk of chunks) {
        const keys = chunk.map(id => ({ participantId: id }));
        const command = new BatchGetCommand({
          RequestItems: {
            [TABLES.CONVERSATIONS]: {
              Keys: keys
            }
          }
        });

        const response = await docClient.send(command);
        const items = response.Responses ? response.Responses[TABLES.CONVERSATIONS] : [];
        allItems.push(...items);
      }

      return allItems.map(item => new Conversation(item));
    } catch (error) {
      logger.error('❌ [DYNAMO] Error en BatchGet conversacion:', error);
      return [];
    }
  }

  // ===========================================
  // OPERACIONES DE MENSAJES
  // ===========================================

  /**
   * Guarda un mensaje
   * @param {Message} message
   * @returns {Promise<Message>}
   */
  async saveMessage(message) {
    if (!this._isAvailable()) return message;
    try {
      // ✅ Asegurar que el mensaje tenga un ID antes de proceder
      if (!message.id) {
        message.id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // ✅ Obtener participantId (requerido para índice GSI)
      // Priorizar participantId explícito (ej: mensajes de asesor donde from=advisorId)
      const participantId = message.participantId || message.from || message.to;

      if (!participantId) {
        throw new Error('Message must have either "from" or "to" field');
      }

      const obj = message.toObject();

      // ✅ Preparar item para DynamoDB con todos los campos requeridos
      const item = {
        // Campos del modelo Message
        id: message.id,
        conversationId: obj.conversationId,
        direction: obj.direction,
        type: obj.type,
        content: obj.content,
        from: obj.from,
        to: obj.to,
        status: obj.status,
        metadata: obj.metadata || {},

        // ✅ Campos requeridos por DynamoDB
        messageId: message.id,  // Partition Key - CRÍTICO
        participantId: participantId,  // Para GSI
        timestamp: obj.createdAt ? new Date(obj.createdAt).getTime() : Date.now(),
        createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: TABLES.MESSAGES,
        Item: item,
        ConditionExpression: 'attribute_not_exists(messageId)'
      });

      await docClient.send(command);
      logger.info(`✅ [DYNAMODB] Mensaje guardado: ${message.id}`);

      return message;
    } catch (error) {
      // ✅ Ignorar duplicados silenciosamente
      if (error.name === 'ConditionalCheckFailedException') {
        logger.warn(`⚠️ [DYNAMODB] Mensaje duplicado ignorado: ${message.id}`);
        return message;
      }

      // ✅ Mejorar logging de errores con detalles completos
      logger.error(`❌ [DYNAMODB] Error guardando mensaje:`, {
        messageId: message.id,
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.code,
        httpStatus: error.$metadata?.httpStatusCode,
        tableName: TABLES.MESSAGES
      });

      // Log del stack trace completo para debugging
      if (process.env.LOG_LEVEL === 'debug') {
        logger.error('Stack trace:', error.stack);
      }

      throw error;
    }
  }

  /**
   * Busca un mensaje específico por su ID
   * @param {string} messageId - ID del mensaje (messageId)
   * @returns {Promise<Message|null>}
   */
  async findMessageById(messageId) {
    if (!this._isAvailable() || !messageId) return null;
    try {
      const command = new GetCommand({
        TableName: TABLES.MESSAGES,
        Key: { messageId }
      });

      const response = await docClient.send(command);

      if (!response.Item) {
        return null;
      }

      return new Message(response.Item);
    } catch (error) {
      logger.error(`Error buscando mensaje ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Obtiene el historial de mensajes
   * @param {string} participantId
   * @param {Object} options
   * @returns {Promise<Array<Message>>}
   */
  async getHistory(participantId, options = { limit: 20 }) {
    if (!this._isAvailable()) return [];
    try {
      // Build key condition — add timestamp cursor if provided
      const hasBeforeCursor = options.beforeTimestamp && typeof options.beforeTimestamp === 'number';

      const command = new QueryCommand({
        TableName: TABLES.MESSAGES,
        IndexName: 'participantId-timestamp-index',
        KeyConditionExpression: hasBeforeCursor
          ? 'participantId = :participantId AND #ts < :before'
          : 'participantId = :participantId',
        ...(hasBeforeCursor ? { ExpressionAttributeNames: { '#ts': 'timestamp' } } : {}),
        ExpressionAttributeValues: hasBeforeCursor
          ? { ':participantId': participantId, ':before': options.beforeTimestamp }
          : { ':participantId': participantId },
        ScanIndexForward: false, // Descending order (newest first)
        Limit: options.limit
      });

      const response = await docClient.send(command);

      // Items arrive newest-first; reverse to get chronological order
      const messages = (response.Items || [])
        .map(item => new Message(item))
        .reverse();

      return messages;
    } catch (error) {
      logger.error(`Error obteniendo historial de ${participantId}:`, error);
      return [];
    }
  }

  /**
   * Cuenta mensajes de una conversación
   * @param {string} participantId
   * @returns {Promise<number>}
   */
  async countMessages(participantId) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.MESSAGES,
        IndexName: 'participantId-timestamp-index',
        KeyConditionExpression: 'participantId = :participantId',
        ExpressionAttributeValues: {
          ':participantId': participantId
        },
        Select: 'COUNT'
      });

      const response = await docClient.send(command);
      return response.Count || 0;
    } catch (error) {
      logger.error(`Error contando mensajes de ${participantId}:`, error);
      return 0;
    }
  }

  // ===========================================
  // UTILIDADES
  // ===========================================

  /**
   * Limpia conversaciones inactivas
   * @param {number} maxAgeDays - Días de inactividad
   * @returns {Promise<number>} Número de conversaciones eliminadas
   */
  async cleanupInactive(maxAgeDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      const cutoffTimestamp = cutoffDate.getTime();

      // Scan para encontrar conversaciones viejas
      const command = new ScanCommand({
        TableName: TABLES.CONVERSATIONS,
        FilterExpression: 'lastInteraction < :cutoff',
        ExpressionAttributeValues: {
          ':cutoff': cutoffTimestamp
        }
      });

      const response = await docClient.send(command);
      let deletedCount = 0;

      for (const item of response.Items || []) {
        await this.delete(item.participantId);
        deletedCount++;
      }

      logger.info(`Limpieza: ${deletedCount} conversaciones eliminadas`);
      return deletedCount;
    } catch (error) {
      logger.error('Error en limpieza de conversaciones:', error);
      return 0;
    }
  }

  /**
   * Obtiene estadísticas
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      // Obtener total de conversaciones
      const conversationsCommand = new ScanCommand({
        TableName: TABLES.CONVERSATIONS,
        Select: 'COUNT'
      });

      const conversationsResponse = await docClient.send(conversationsCommand);
      const totalConversations = conversationsResponse.Count || 0;

      // Obtener conversaciones activas
      const activeCommand = new ScanCommand({
        TableName: TABLES.CONVERSATIONS,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'active'
        },
        Select: 'COUNT'
      });

      const activeResponse = await docClient.send(activeCommand);
      const activeConversations = activeResponse.Count || 0;

      // Obtener total de mensajes
      const messagesCommand = new ScanCommand({
        TableName: TABLES.MESSAGES,
        Select: 'COUNT'
      });

      const messagesResponse = await docClient.send(messagesCommand);
      const totalMessages = messagesResponse.Count || 0;

      return {
        totalConversations,
        activeConversations,
        totalMessages
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        totalMessages: 0
      };
    }
  }
}

// Exportar instancia singleton
module.exports = new ConversationRepository();
