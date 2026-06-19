/**
 * ===========================================
 * SERVICIO DE CONTROL POR ASESOR
 * ===========================================
 *
 * PUNTO DE CONTROL 2: Desactivación automática del bot
 *
 * Responsabilidades:
 * - Enviar mensajes desde el dashboard
 * - Desactivar el bot cuando un asesor responde
 * - Reactivar el bot manualmente
 * - Controlar el flujo de atención humana
 */

const logger = require('../utils/logger');
const conversationStateService = require('./conversation-state.service');
const whatsappProvider = require('../providers/whatsapp');
const mediaService = require('./media.service');

// Helper to read agent personalization config
function getAgentDisplayConfig(username) {
  try {
    const { readAgentsConfig } = require('../controllers/auth.controller');
    const allConfigs = readAgentsConfig();
    return allConfigs[username] || null;
  } catch {
    return null;
  }
}

// ✅ NUEVO: Socket.IO para emitir eventos de nuevos mensajes
let io = null;

function setSocketIO(socketIOInstance) {
  io = socketIOInstance;
  logger.info('✅ Socket.IO inicializado en advisor-control');
}

// Historial de mensajes enviados por asesores
// Map<userId, Array<{messageId, message, sender, senderId, timestamp}>>
const advisorMessagesHistory = new Map();

/**
 * ===========================================
 * PUNTO DE CONTROL 2: DESACTIVACIÓN AUTOMÁTICA
 * ===========================================
 *
 * Cuando un asesor envía un mensaje desde el dashboard:
 * 1. Bot se DESACTIVA permanentemente para esa conversación
 * 2. El bot NO volverá a responder automáticamente
 * 3. Estado cambia a "ATENDIDO POR ASESOR"
 * 4. needs_human = true
 * 5. bot_active = false
 *
 * El bot solo puede volver a activarse si:
 * - Se presiona manualmente "Reactivar bot"
 * - Se resetea la conversación
 *
 * @param {string} userId - ID del usuario de WhatsApp
 * @param {Object} advisorData - Datos del asesor { id, name, email }
 * @param {string} message - Mensaje a enviar
 * @returns {Promise<Object>} Resultado de la operación
 */
async function sendAdvisorMessage(userId, advisorData, message, replyTo = null) {
  try {
    // ✅ Usar getOrCreateConversation en lugar de getConversation
    // Esto carga la conversación desde DynamoDB si no está en memoria
    const conversation = conversationStateService.getOrCreateConversation(userId);

    if (!conversation) {
      throw new Error('No se pudo crear o obtener la conversación');
    }

    logger.info(`👨‍💼 Asesor ${advisorData.name} enviando mensaje a ${userId}`);
    logger.info(`   Mensaje: "${message.substring(0, 50)}..."`);

    // ===========================================
    // PASO 1: ENVIAR MENSAJE POR WHATSAPP (PRIMERO)
    // ===========================================
    // Enviamos primero para obtener el ID real de Baileys

    // Construir opciones de reply si es necesario
    let sendOptions = {};
    if (replyTo && replyTo.id) {
      // Determinar si el mensaje original era nuestro (fromMe)
      // Si el sender NO es 'user', entonces fue enviado por nosotros (admin o bot)
      const isFromMe = replyTo.sender !== 'user';

      const remoteJid = conversation.phoneNumber.includes('@')
        ? conversation.phoneNumber
        : conversation.phoneNumber + '@s.whatsapp.net';

      sendOptions.quoted = {
        key: {
          remoteJid: remoteJid,
          fromMe: isFromMe,
          id: replyTo.id
        },
        message: {
          conversation: replyTo.message || ''
        }
      };
    }

    // ID por defecto (fallback)
    let finalMessageId = `adv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await whatsappProvider.sendMessage(userId, message, sendOptions);
      // ✅ CAPTURAR ID REAL DE BAILEYS
      if (result && result.key && result.key.id) {
        finalMessageId = result.key.id;
        logger.debug(`✅ ID de Baileys capturado para mensaje de asesor: ${finalMessageId}`);
      }
    } catch (sendError) {
      logger.error('❌ Error enviando a WhatsApp:', sendError);
      throw sendError; // Si falla el envío, no guardamos nada
    }

    // ===========================================
    // PASO 2: ACTUALIZAR ESTADO DEL BOT
    // ===========================================

    const wasActive = conversation.bot_active;

    // Desactivar el bot
    conversation.bot_active = false;
    conversation.status = 'advisor_handled';
    conversation.assignedTo = advisorData.id;
    conversation.advisorName = advisorData.name;
    conversation.needs_human = true;
    conversation.botDeactivatedAt = Date.now();
    conversation.botDeactivatedBy = advisorData.id;

    // Limpiar flujo activo
    try {
      const flowManager = require('../flows');
      if (flowManager.hasActiveFlow(userId)) {
        flowManager.endFlow(userId);
        conversation.activeFlow = null;
        logger.info(`🔄 Flujo activo limpiado para ${userId} (asesor tomó control)`);
      }
    } catch (e) {
      logger.warn(`⚠️ Error limpiando flujo activo: ${e.message}`);
    }

    // ===========================================
    // PASO 3: GUARDAR MENSAJE (CON ID REAL)
    // ===========================================

    // Read agent personalization config
    const agentConfig = getAgentDisplayConfig(advisorData.id);

    const messageRecord = {
      id: finalMessageId, // ✅ Usamos el ID real de Baileys o el fallback
      message: message,
      sender: 'admin',  // IMPORTANTE: 'admin' para que el HTML lo alinee a la derecha
      senderId: advisorData.id,
      senderName: advisorData.name,  // Nombre del asesor para mostrar
      senderDisplayName: agentConfig?.display_name || null, // Personalized display name
      senderColor: agentConfig?.color || null, // Personalized color
      senderEmail: advisorData.email || null,
      timestamp: Date.now(),
      replyTo: replyTo || null  // ✅ NUEVO: Referencia al mensaje original
    };

    // ✅ ÚNICO lugar de almacenamiento para frontend: conversation.messages
    if (!conversation.messages) {
      conversation.messages = [];
    }
    conversation.messages.push(messageRecord);

    // Actualizar última interacción
    conversation.lastInteraction = Date.now();
    conversation.lastMessage = message;

    // ✅ NUEVO: Guardar mensaje de asesor en DynamoDB para persistencia
    setImmediate(async () => {
      try {
        const conversationRepository = require('../repositories/conversation.repository');
        const { Message } = require('../models/message.model');
        const dynamoMessage = new Message({
          id: messageRecord.id,
          conversationId: userId,
          participantId: userId,
          direction: 'outgoing',
          type: 'text',
          content: { text: message },
          from: advisorData.id,
          to: userId,
          status: 'delivered',
          metadata: {
            sender: 'admin',
            senderName: advisorData.name,
            senderDisplayName: agentConfig?.display_name || null,
            senderColor: agentConfig?.color || null,
            senderEmail: advisorData.email || null,
            sender_type: 'human',
            sender_name: advisorData.name,
            sender_display_name: agentConfig?.display_name || null,
            originalType: 'text',
            replyTo: replyTo || null
          },
          createdAt: new Date(messageRecord.timestamp),
          updatedAt: new Date()
        });
        await conversationRepository.saveMessage(dynamoMessage);
        logger.info(`✅ [DYNAMODB] Mensaje de asesor guardado: ${messageRecord.id}`);
      } catch (dbError) {
        logger.error(`❌ [DYNAMODB] Error guardando mensaje de asesor ${messageRecord.id}:`, {
          message: dbError.message,
          code: dbError.code,
          name: dbError.name,
          stack: dbError.stack,
          userId: userId
        });
      }
    });

    // Historial interno SOLO para estadísticas (NO se expone al frontend)
    if (!advisorMessagesHistory.has(userId)) {
      advisorMessagesHistory.set(userId, []);
    }
    advisorMessagesHistory.get(userId).push(messageRecord);

    if (wasActive) {
      logger.info(`🔴 BOT DESACTIVADO para ${userId}`);
      logger.info(`   Estado: ${conversation.status}`);
      logger.info(`   Asesor: ${advisorData.name} (${advisorData.id})`);
    } else {
      logger.info(`🔄 Bot ya estaba inactivo para ${userId}`);
      logger.info(`   Asesor ${advisorData.name} continúa atención`);
    }

    // ===========================================
    // PASO 4: EMITIR EVENTO SOCKET
    // ===========================================
    if (io) {
      io.emit('new-message', {
        userId: userId,
        phoneNumber: conversation.phoneNumber,
        whatsappName: conversation.whatsappName || '',
        message: messageRecord,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'new-message' emitido para ${userId} (asesor, ID: ${messageRecord.id})`);

      // ✅ NUEVO: Emitir evento de estado del bot actualizado
      io.emit('bot-status-updated', {
        userId: userId,
        botActive: false,
        status: conversation.status,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'bot-status-updated' emitido para ${userId} (Bot Inactivo)`);
    }

    logger.info(`✅ Mensaje de asesor enviado a ${userId}`);

    return {
      success: true,
      botActive: false,
      status: conversation.status,
      wasPreviouslyActive: wasActive,
      message: {
        id: messageRecord.id, // Fixed: was messageRecord.messageId
        text: message,
        timestamp: messageRecord.timestamp
      }
    };

  } catch (error) {
    logger.error(`Error enviando mensaje de asesor a ${userId}:`, error);
    throw error;
  }
}

/**
 * Reactiva el bot manualmente
 *
 * Solo se puede hacer manualmente desde el dashboard con el botón "Reactivar bot"
 *
 * @param {string} userId - ID del usuario
 * @param {Object} advisorData - Datos del asesor que reactiva
 * @returns {Promise<Object>} Resultado de la operación
 */
async function reactivateBot(userId, advisorData) {
  try {
    // ✅ Usar getOrCreateConversation en lugar de getConversation
    const conversation = conversationStateService.getOrCreateConversation(userId);

    if (!conversation) {
      throw new Error('No se pudo crear o obtener la conversación');
    }

    logger.info(`🔄 Reactivando bot para ${userId} por ${advisorData.name}`);
    logger.info(`📊 Estado ANTES de reactivar:`);
    logger.info(`   bot_active: ${conversation.bot_active}`);
    logger.info(`   status: ${conversation.status}`);
    logger.info(`   interactionCount: ${conversation.interactionCount}`);
    logger.info(`   waitingForHuman: ${conversation.waitingHuman}`);
    logger.info(`   escalationMessageSent: ${conversation.escalationMessageSent}`);

    // Reactivar bot
    conversation.bot_active = true;
    conversation.status = 'active';
    conversation.assignedTo = null;
    conversation.advisorName = null;
    conversation.needs_human = false;
    conversation.needsHumanReason = null;
    conversation.botDeactivatedAt = null;
    conversation.botDeactivatedBy = null;
    conversation.lastInteraction = Date.now();

    // ✅ CORRECCIÓN CRÍTICA: Reiniciar contador de intentos
    conversation.interactionCount = 0;
    conversation.manuallyReactivated = true;  // Flag para ignorar escalación por historial

    // NUEVO: Resetear flags de escalación (permitir nueva escalación futura)
    conversation.escalationMessageSent = false;
    conversation.waitingForHuman = false;
    conversation.lastEscalationMessageAt = null;

    logger.info(`🟢 BOT REACTIVADO para ${userId}`);
    logger.info(`📊 Estado DESPUÉS de reactivar:`);
    logger.info(`   ✅ bot_active: ${conversation.bot_active}`);
    logger.info(`   ✅ status: ${conversation.status}`);
    logger.info(`   ✅ interactionCount: ${conversation.interactionCount} (REINICIADO)`);
    logger.info(`   ✅ manuallyReactivated: ${conversation.manuallyReactivated} (activado por 1 ciclo)`);
    logger.info(`   ✅ waitingForHuman: ${conversation.waitingForHuman}`);
    logger.info(`   ✅ escalationMessageSent: ${conversation.escalationMessageSent}`);
    logger.info(`   📋 Acción realizada por: ${advisorData.name} (${advisorData.id})`);
    logger.info(`   🔄 Nuevo ciclo iniciado: contador de intentos en 0`);

    // ✅ NUEVO: Emitir evento de estado del bot actualizado
    if (io) {
      io.emit('bot-status-updated', {
        userId: userId,
        botActive: true,
        status: conversation.status,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'bot-status-updated' emitido para ${userId} (Bot Activo)`);
    }

    // ✅ CORRECCIÓN: Retornar el resultado correctamente
    return {
      success: true,
      botActive: conversation.bot_active,
      status: conversation.status
    };

  } catch (error) {
    logger.error(`Error reactivando bot para ${userId}:`, error);
    throw error;
  }
}

/**
 * Desactiva el bot manualmente
 * 
 * @param {string} userId - ID del usuario
 * @param {Object} advisorData - Datos del asesor { id, name }
 * @returns {Promise<Object>} Resultado
 */
async function deactivateBot(userId, advisorData) {
  try {
    const conversation = conversationStateService.getOrCreateConversation(userId);

    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    // Desactivar bot
    conversation.bot_active = false;
    conversation.status = 'advisor_handled';
    conversation.assignedTo = advisorData.id;
    conversation.advisorName = advisorData.name;
    conversation.needs_human = true;
    conversation.botDeactivatedAt = Date.now();
    conversation.botDeactivatedBy = advisorData.id;

    // Limpiar flujo activo si existe
    try {
      const flowObject = require('../flows');
      if (flowObject && typeof flowObject.hasActiveFlow === 'function' && flowObject.hasActiveFlow(userId)) {
        await flowObject.endFlow(userId);
        conversation.activeFlow = null;
        logger.info(`🔄 Flujo activo limpiado para ${userId}`);
      }
    } catch (e) {
      logger.warn(`⚠️ Error limpiando flujo: ${e.message}`);
    }

    logger.info(`✅ Bot DESACTIVADO manualmente para ${userId} por ${advisorData.name}`);

    // Emitir evento de estado del bot actualizado
    if (io) {
      io.emit('bot-status-updated', {
        userId: userId,
        botActive: false,
        status: conversation.status,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'bot-status-updated' emitido para ${userId} (Bot Inactivo)`);
    }

    return {
      success: true,
      botActive: false,
      status: conversation.status
    };
  } catch (error) {
    logger.error(`❌ Error en deactivateBot para ${userId}:`, error);
    throw error;
  }
}

/**
 * Verifica si el bot está activo para una conversación
 *
 * @param {string} userId - ID del usuario
 * @returns {boolean} true si el bot está activo
 */
function isBotActive(userId) {
  const conversation = conversationStateService.getConversation(userId);
  return conversation ? conversation.bot_active === true : true; // Por defecto activo
}

/**
 * ✅ OBSOLETO: Los mensajes de asesores ahora están en conversation.messages
 *
 * Esta función se mantiene por compatibilidad pero siempre retorna array vacío.
 * Los mensajes con sender='admin' ya están incluidos en conversation.messages.
 *
 * @param {string} userId - ID del usuario
 * @returns {Array} Siempre array vacío
 */
function getAdvisorMessages(userId) {
  // ✅ CORRECCIÓN: Retornar vacío porque los mensajes ya están en conversation.messages
  return [];
}

/**
 * Obtiene todas las conversaciones donde el bot está inactivo
 *
 * @returns {Array} Lista de conversaciones
 */
function getInactiveBotConversations() {
  const all = conversationStateService.getAllConversations();
  return all.filter(c => c.bot_active === false);
}

/**
 * Obtiene estadísticas de control de asesores
 *
 * @returns {Object} Estadísticas
 */
function getStats() {
  const all = conversationStateService.getAllConversations();

  const botActive = all.filter(c => c.bot_active === true).length;
  const botInactive = all.filter(c => c.bot_active === false).length;
  const advisorHandled = all.filter(c => c.status === 'advisor_handled').length;
  const pendingAdvisor = all.filter(c => c.status === 'pending_advisor').length;

  // Total de mensajes de asesores
  let totalAdvisorMessages = 0;
  advisorMessagesHistory.forEach(messages => {
    totalAdvisorMessages += messages.length;
  });

  return {
    total: all.length,
    botActive,
    botInactive,
    advisorHandled,
    pendingAdvisor,
    totalAdvisorMessages,
    conversationsWithAdvisorMessages: advisorMessagesHistory.size
  };
}

/**
 * Limpia el historial de mensajes de un asesor
 * (útil para testing o mantenimiento)
 *
 * @param {string} userId - ID del usuario
 */
function clearAdvisorMessages(userId) {
  const conversation = conversationStateService.getConversation(userId);

  if (conversation) {
    conversation.advisorMessages = [];
  }

  advisorMessagesHistory.delete(userId);

  logger.info(`🗑️ Historial de mensajes de asesor limpiado para ${userId}`);
}

/**
 * Transfiere una conversación a otro asesor
 *
 * @param {string} userId - ID del usuario
 * @param {Object} newAdvisorData - Datos del nuevo asesor
 * @returns {Promise<Object>} Resultado de la operación
 */
async function transferToAdvisor(userId, newAdvisorData) {
  try {
    // ✅ Usar getOrCreateConversation en lugar de getConversation
    const conversation = conversationStateService.getOrCreateConversation(userId);

    if (!conversation) {
      throw new Error('No se pudo crear o obtener la conversación');
    }

    const oldAdvisor = conversation.advisorName;

    logger.info(`🔄 Transfiriendo conversación de ${userId}`);
    logger.info(`   De: ${oldAdvisor || 'sin asignar'}`);
    logger.info(`   A: ${newAdvisorData.name}`);

    // Actualizar asignación
    conversation.assignedTo = newAdvisorData.id;
    conversation.advisorName = newAdvisorData.name;
    conversation.lastInteraction = Date.now();

    // Agregar nota de transferencia al historial
    const transferNote = {
      messageId: `transfer_${Date.now()}`,
      message: `[Sistema] Conversación transferida de ${oldAdvisor || 'sin asignar'} a ${newAdvisorData.name}`,
      sender: 'Sistema',
      senderId: 'system',
      timestamp: Date.now(),
      type: 'transfer'
    };

    conversation.advisorMessages = conversation.advisorMessages || [];
    conversation.advisorMessages.push(transferNote);

    if (!advisorMessagesHistory.has(userId)) {
      advisorMessagesHistory.set(userId, []);
    }
    advisorMessagesHistory.get(userId).push(transferNote);

    logger.info(`✅ Conversación transferida exitosamente`);

    return {
      success: true,
      status: conversation.status,
      from: oldAdvisor,
      to: newAdvisorData.name
    };

  } catch (error) {
    logger.error(`Error transfiriendo conversación:`, error);
    throw error;
  }
}

/**
 * ===========================================
 * ✅ NUEVO: ENVIAR MENSAJE MULTIMEDIA DESDE DASHBOARD
 * ===========================================
 * Soporta: audio, imagen, documento (PDF)
 *
 * @param {string} userId - ID del usuario de WhatsApp
 * @param {Object} advisorData - Datos del asesor
 * @param {Object} mediaData - Datos del archivo multimedia
 * @param {string} mediaData.type - Tipo: 'audio', 'image', 'document'
 * @param {string} mediaData.url - URL del archivo
 * @param {string} mediaData.filename - Nombre original del archivo
 * @param {number} mediaData.size - Tamaño del archivo
 * @param {string} caption - Texto opcional de acompañamiento
 * @returns {Promise<Object>} Resultado de la operación
 */
async function sendAdvisorMediaMessage(userId, advisorData, mediaData, caption = '') {
  try {
    const conversation = conversationStateService.getOrCreateConversation(userId);

    if (!conversation) {
      throw new Error('No se pudo crear o obtener la conversación');
    }

    logger.info(`👨‍💼 Asesor ${advisorData.name} enviando ${mediaData.type} a ${userId}`);
    logger.info(`[DEBUG-WA] Enviando a WhatsApp: type=${mediaData.type}, filepath=${mediaData.filepath}, url=${mediaData.url}`);

    // ===========================================
    // PASO 1: ENVIAR A WHATSAPP PRIMERO
    // (igual que sendAdvisorMessage — evita inconsistencias si falla)
    // ===========================================
    let whatsappResult = null;
    try {
      whatsappResult = await whatsappProvider.sendMediaMessage(userId, {
        type: mediaData.type,
        url: mediaData.url,
        filepath: mediaData.filepath,
        filename: mediaData.filename,
        caption: caption
      });
      logger.info(`✅ [WHATSAPP] Media enviada exitosamente a ${userId}`);
    } catch (sendError) {
      logger.error(`❌ [WHATSAPP] Error enviando media a ${userId}: ${sendError.message}`);
      // Re-lanzar con mensaje más descriptivo si es problema de conexión
      if (sendError.message && sendError.message.includes('no está conectado')) {
        const err = new Error('WhatsApp no está conectado. Por favor espera unos segundos y reintenta.');
        err.code = 'WA_NOT_CONNECTED';
        throw err;
      }
      throw sendError;
    }

    // ===========================================
    // PASO 2: ACTUALIZAR ESTADO (solo si envió exitosamente)
    // ===========================================
    const wasActive = conversation.bot_active;

    conversation.bot_active = false;
    conversation.status = 'advisor_handled';
    conversation.assignedTo = advisorData.id;
    conversation.advisorName = advisorData.name;
    conversation.needs_human = true;
    conversation.botDeactivatedAt = Date.now();
    conversation.botDeactivatedBy = advisorData.id;

    if (wasActive) {
      logger.info(`🔴 BOT DESACTIVADO para ${userId} (mensaje multimedia)`);
    }

    const messageType = mediaData.type;

    // Crear registro del mensaje multimedia
    // Read agent personalization config
    const agentConfig = getAgentDisplayConfig(advisorData.id);

    const messageRecord = {
      id: `adv_media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: caption || mediaData.filename,
      sender: 'admin',
      senderId: advisorData.id,
      senderName: advisorData.name,
      senderDisplayName: agentConfig?.display_name || null,
      senderColor: agentConfig?.color || null,
      senderEmail: advisorData.email || null,
      timestamp: Date.now(),
      type: messageType,
      mediaUrl: mediaData.url,
      fileName: mediaData.filename,
      fileSize: mediaData.size
    };

    // Guardar en conversación en memoria
    if (!conversation.messages) conversation.messages = [];
    conversation.messages.push(messageRecord);

    conversation.lastInteraction = Date.now();
    conversation.lastMessage = caption || `[${mediaData.type}] ${mediaData.filename}`;

    if (!advisorMessagesHistory.has(userId)) advisorMessagesHistory.set(userId, []);
    advisorMessagesHistory.get(userId).push(messageRecord);

    // ===========================================
    // PASO 3: GUARDAR EN DYNAMODB (async, no bloquea)
    // ===========================================
    setImmediate(async () => {
      try {
        const conversationRepository = require('../repositories/conversation.repository');
        const { Message } = require('../models/message.model');
        const dynamoMessage = new Message({
          id: messageRecord.id,
          conversationId: userId,
          participantId: userId,
          direction: 'outgoing',
          type: messageType,
          content: {
            text: caption || mediaData.filename,
            mediaUrl: mediaData.url,
            fileName: mediaData.filename,
            mimeType: mediaData.mimeType || null,  // ✅ FIX Bug4: include mimeType for correct rendering on reload
            fileSize: mediaData.size
          },
          from: advisorData.id,
          to: userId,
          status: 'delivered',
          metadata: {
            sender: 'admin',
            senderName: advisorData.name,
            senderDisplayName: agentConfig?.display_name || null,
            senderColor: agentConfig?.color || null,
            senderEmail: advisorData.email || null,
            sender_type: 'human',
            sender_name: advisorData.name,
            sender_display_name: agentConfig?.display_name || null,
            originalType: messageType
          },
          createdAt: new Date(messageRecord.timestamp),
          updatedAt: new Date()
        });
        await conversationRepository.saveMessage(dynamoMessage);
        logger.info(`✅ [DYNAMODB] Mensaje multimedia de asesor guardado: ${messageRecord.id}`);
      } catch (dbError) {
        logger.error(`❌ [DYNAMODB] Error guardando mensaje multimedia de asesor ${messageRecord.id}:`, dbError.message);
      }
    });

    // ===========================================
    // PASO 4: EMITIR EVENTOS SOCKET
    // ===========================================
    if (io) {
      io.emit('new-message', {
        userId: userId,
        phoneNumber: conversation.phoneNumber,
        whatsappName: conversation.whatsappName || '',
        message: messageRecord,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'new-message' emitido para ${userId} (media, ID: ${messageRecord.id})`);

      io.emit('bot-status-updated', {
        userId: userId,
        botActive: false,
        status: conversation.status,
        timestamp: Date.now()
      });
      logger.debug(`📡 Evento 'bot-status-updated' emitido para ${userId} (Bot Inactivo - Media)`);
    }

    logger.info(`✅ Mensaje multimedia de asesor enviado a ${userId}`);

    return {
      success: true,
      botActive: false,
      status: conversation.status,
      wasPreviouslyActive: wasActive,
      message: messageRecord
    };

  } catch (error) {
    logger.error(`Error enviando mensaje multimedia de asesor a ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  sendAdvisorMessage,
  sendAdvisorMediaMessage,  // ✅ NUEVO: Enviar mensajes multimedia
  reactivateBot,
  deactivateBot,            // ✅ NUEVO: Desactivación manual
  isBotActive,
  getAdvisorMessages,
  getInactiveBotConversations,
  getStats,
  clearAdvisorMessages,
  transferToAdvisor,
  setSocketIO  // ✅ NUEVO: Para inicializar Socket.IO
};
