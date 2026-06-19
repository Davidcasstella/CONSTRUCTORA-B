/**
 * ===========================================
 * PROCESADOR DE MENSAJES - FLUJO PRINCIPAL
 * ===========================================
 *
 * PUNTO DE CONTROL ÚNICO para todo mensaje entrante.
 * Implementa todos los puntos de control requeridos.
 *
 * PUNTOS DE CONTROL:
 * - Punto 1: Verificar bot_active
 * - Punto 3: Fallback obligatorio
 * - Punto 4: Control de horario (4:30 PM)
 * - Punto 5: Flujo general
 */

const logger = require('../utils/logger');
const conversationStateService = require('./conversation-state.service');
const escalationService = require('./escalation.service');
const chatService = require('./chat.service');
const whatsappProvider = require('../providers/whatsapp');
const timeSimulation = require('./time-simulation.service');
const timezone = require('../utils/timezone'); // ✅ Para getDayOfWeek() con zona horaria correcta
const numberControlService = require('./number-control.service');
const spamControlService = require('./spam-control.service');
const flowManager = require('../flows'); // ✅ NUEVO: Gestor de flujos
const welcomeConfigService = require('./welcome-config.service'); // ✅ Welcome config

// ✅ NUEVO: Socket.IO para emitir eventos de escalación al dashboard
let io = null;

// ✅ NUEVO: Set para evitar guardar el mismo mensaje dos veces en DynamoDB
const savedMessageIds = new Set();

function setSocketIO(socketIOInstance) {
  io = socketIOInstance;
  logger.info('✅ Socket.IO inicializado en message-processor');
}

// ===========================================
// MENSAJAGES DEL SISTEMA
// ===========================================
const NO_INFO_MESSAGE = 'El asesor de NORBOY 👩‍💼 encargado de este tema le atenderá en breve...';

/**
 * ✅ HELPER: Sends a message with optional typing indicator and delay.
 * Centralizes the delay+typing logic used across welcome, consent,
 * closure, escalation, and out-of-hours flows.
 *
 * @param {string} userId - Recipient JID/number
 * @param {string} text - Message text to send
 * @param {number} delaySec - Delay in seconds (0 = immediate)
 * @param {Object} [opts] - Optional settings
 * @param {number} [opts.speedMult=1] - Speed multiplier from config
 * @param {string} [opts.tag='system'] - Tag for saveMessage
 */
async function sendWithTypingDelay(userId, text, delaySec, opts = {}) {
  const speedMult = opts.speedMult || 1;
  const tag = opts.tag || 'system';
  const effectiveDelay = (delaySec || 0) * 1000 * speedMult;

  if (effectiveDelay > 0) {
    await whatsappProvider.sendTyping(userId);
    await new Promise(r => setTimeout(r, effectiveDelay));
    await whatsappProvider.clearTyping(userId);
  }

  await whatsappProvider.sendMessage(userId, text);
  await saveMessage(userId, text, 'bot', tag);
}

/**
 * ✅ HELPER: Sends ALL transfer_human messages from dashboard config sequentially.
 * Each message gets its own typing indicator and delay.
 * Falls back to a single hardcoded message if no config exists.
 *
 * @param {string} userId - Recipient JID/number
 * @returns {string} The first message text (for logging/reference)
 */
async function sendEscalationSequence(userId) {
  const allTransferMsgs = welcomeConfigService.getClosureMessagesByType('transfer_human');

  if (allTransferMsgs.length === 0) {
    // Fallback: no dashboard config, use hardcoded default
    await sendWithTypingDelay(userId, NO_INFO_MESSAGE, 2, { tag: 'escalation' });
    return NO_INFO_MESSAGE;
  }

  // Send each configured message sequentially
  for (const msg of allTransferMsgs) {
    const delay = msg.delay || 2;
    await sendWithTypingDelay(userId, msg.content, delay, { tag: 'escalation' });
  }

  return allTransferMsgs[0].content;
}

/**
 * ✅ HELPER: Sends ALL consent messages from dashboard config sequentially.
 * Each message gets its own typing indicator and delay.
 * Falls back to legacy single message if no messages array exists.
 *
 * @param {string} userId - Recipient JID/number
 * @param {number} [speedMult=1] - Speed multiplier from config
 */
async function sendConsentSequence(userId, speedMult = 1) {
  // ✅ FIX: Respect the global consent toggle — skip everything when disabled
  const consentCfg = welcomeConfigService.getConsentConfig();
  if (consentCfg.enabled === false) {
    logger.info(`📋 Consent globally disabled — skipping consent messages for ${userId}`);
    return;
  }

  const consentMsgs = welcomeConfigService.getConsentMessages();

  if (consentMsgs.length === 0) {
    // Fallback: use legacy single message
    const legacyMsg = consentCfg.message;
    if (legacyMsg) {
      const legacyDelay = consentCfg.delay || 0;
      await sendWithTypingDelay(userId, legacyMsg, legacyDelay, { speedMult, tag: 'consent' });
    }
    return;
  }

  // Send each configured consent message sequentially
  for (const msg of consentMsgs) {
    const delay = msg.delay || 0;
    await sendWithTypingDelay(userId, msg.content, delay, { speedMult, tag: 'consent' });
  }

  logger.info(`✅ ${consentMsgs.length} consent message(s) sent to ${userId}`);
}

// ===========================================
// CONFIGURACIÓN DE HORARIO DE ATENCIÓN
// ===========================================
/**
 * Horario de atención - ahora lee de schedule-config.service.js
 * (antes estaba hardcodeado a endHour:16, endMinute:30)
 */
const scheduleConfig = require('./schedule-config.service');

// ===========================================
// ✅ NUEVO: CONFIGURACIÓN DE FLUJO DE MENÚ
// ===========================================
/**
 * Habilita el nuevo flujo de menú NORBOY
 * - true: Usa el nuevo flujo con menú de 4 opciones
 * - false: Usa el flujo original (saludo simple + consentimiento)
 */
const USE_NEW_MENU_FLOW = process.env.USE_NEW_MENU_FLOW === 'true';

// ===========================================
// PUNTO DE CONTROL 5: FLUJO GENERAL
// ===========================================

/**
 * Procesa un mensaje entrante implementando todos los puntos de control
 *
 * @param {string} userId - ID del usuario de WhatsApp
 * @param {string} message - Mensaje recibido
 * @param {Object} options - Opciones adicionales
 * @param {string} options.pushName - Nombre del contacto de WhatsApp
 * @param {string} options.realPhoneNumber - Número real del contacto (wa_id de Meta)
 * @returns {Promise<string|null>} Respuesta a enviar o null si no se debe responder
 */
async function processIncomingMessage(userId, message, options = {}) {
  try {
    const { pushName, realPhoneNumber, mediaData } = options;
    logger.info(`📨 Procesando mensaje de ${userId}: "${message.substring(0, 50)}..."`);

    // ✅ NUEVO: Flag para evitar guardar el mismo mensaje dos veces
    let userMessageSaved = false;

    // ✅ CORREGIDO: Obtener o crear conversación CON el nombre de WhatsApp y número real
    const conversation = conversationStateService.getOrCreateConversation(userId, {
      whatsappName: pushName,
      realPhoneNumber: realPhoneNumber
    });

    // Actualizar última interacción
    conversation.lastInteraction = Date.now();
    conversation.lastMessage = message;

    // ===========================================
    // PUNTO DE CONTROL 1: BOT ACTIVO? (VERIFICAR PRIMERO)
    // ===========================================
    // Si el bot está desactivado (asesor atendiendo), NO responder
    // IMPORTANTE: Se verifica ANTES del flujo activo para que el asesor
    // pueda responder en cualquier momento sin que el flujo interfiera
    if (conversation.bot_active === false) {
      logger.info(`🔴 Bot DESACTIVADO para ${userId}. No se responde automáticamente.`);
      logger.info(`   Razón: Estado actual = ${conversation.status}`);
      logger.info(`   Desactivado por: ${conversation.botDeactivatedBy || 'sistema'}`);

      // Guardar mensaje pero NO responder
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      return null;
    }

    // ===========================================
    // PUNTO DE CONTROL 4: HORARIO DE ATENCIÓN
    // ⚠️ IMPORTANTE: Va ANTES del saludo para que incluso el primer
    // mensaje reciba el mensaje de "fuera de horario" correctamente.
    // ===========================================
    if (await isOutOfHours()) {
      logger.info(`🌙 Fuera de horario para ${userId}`);

      // Solo enviar mensaje de fuera de horario si NO se ha enviado antes
      if (conversation.escalationMessageSent === true) {
        logger.info(`   Mensaje de fuera de horario ya enviado. Solo guardando mensaje.`);
        if (!userMessageSaved) {
          await saveMessage(userId, message, 'user', {
            messageType: options.messageType || 'text',
            mediaData,
            whatsappMessageId: options.whatsappMessageId,
            originalMessage: options.originalMessage
          });
          userMessageSaved = true;
        }
        return null;
      }

      const outOfHoursMsg = await getOutOfHoursMessage();

      // Actualizar estado
      conversation.status = 'out_of_hours';
      conversation.bot_active = false;
      conversation.needs_human = true;
      conversation.escalationMessageSent = true;
      conversation.waitingForHuman = true;
      conversation.lastEscalationMessageAt = Date.now();

      // Guardar mensaje del usuario primero
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      // ✅ Send out-of-hours message with typing indicator + delay (2s default)
      await sendWithTypingDelay(userId, outOfHoursMsg, 2, { tag: { messageType: 'out_of_hours' } });

      // Emitir evento de escalación al dashboard
      if (io) {
        io.emit('escalation-detected', {
          userId: userId,
          phoneNumber: conversation.phoneNumber,
          reason: 'out_of_hours',
          priority: 'low',
          message: message,
          type: 'out_of_hours',
          timestamp: Date.now()
        });
        io.emit('bot-status-updated', {
          userId: userId,
          botActive: false,
          status: conversation.status,
          timestamp: Date.now()
        });
        logger.info(`📢 Evento 'escalation-detected' y 'bot-status-updated' emitido (fuera de horario) para ${userId}`);
      }

      logger.info(`✅ Mensaje fuera de horario enviado a ${userId}`);
      return null;
    }

    // ===========================================
    // PUNTO DE CONTROL -1: SALUDO INSTITUCIONAL OBLIGATORIO
    // ===========================================
    // REGLA CRÍTICA: El PRIMER mensaje del usuario SIEMPRE recibe
    // un saludo institucional, sin importar qué escriba.
    // NO se procesa contenido con RAG hasta que:
    // 1. Se envíe el saludo
    // 2. Se solicite consentimiento
    // 3. El usuario acepte

    if (!conversation.welcomeSent) {
      logger.info(`👋 PRIMER MENSAJE de ${userId} - Enviando saludo obligatorio`);
      logger.info(`   Mensaje original ignorado para RAG: "${message.substring(0, 50)}..."`);

      // Guardar mensaje del usuario (para historial)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      // ===========================================
      // ✅ NUEVO: ELEGIR FLUJO (NUEVO O ANTIGUO)
      // ===========================================
      if (USE_NEW_MENU_FLOW) {
        // Usar nuevo flujo de menú
        logger.info(`🆕 Usando NUEVO flujo de menú NORBOY`);

        // ✅ NUEVO: Detectar si el primer mensaje es una pregunta (no un saludo simple)
        const normalizedFirstMsg = message.toLowerCase().trim();
        const isGreeting = (() => {
          const gWords = ['hola', 'hi', 'hello', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'ola'];
          // ✅ FIX: Messages with more than 4 words are NOT pure greetings
          const wordCount = normalizedFirstMsg.split(/\s+/).length;
          if (wordCount > 4) return false;
          return gWords.some(g => normalizedFirstMsg === g || normalizedFirstMsg.startsWith(g + ' ') || normalizedFirstMsg.startsWith(g + ',') || normalizedFirstMsg.startsWith(g + '.') || normalizedFirstMsg.startsWith(g + '!'));
        })();
        const isFirstMessageQuestion = message.trim().length > 3 && !isGreeting;

        if (isFirstMessageQuestion) {
          // ✅ PRIMER MENSAJE ES UNA PREGUNTA: Saludo + Datos personales (informativo) + Respuesta IA inmediata
          logger.info(`💬 Primer mensaje es una pregunta: "${message.substring(0, 50)}...". Saludo + Datos + Respuesta inmediata.`);

          try {
            // Marcar estado
            conversation.welcomeSent = true;
            conversation.interactionCount = 1;
            conversation.consentMessageSent = true;
            conversation.consentStatus = 'noted';

            // 1. Enviar saludo institucional (from welcome config)
            const userName = conversation.customName || conversation.whatsappName || null;
            const welcomeMsgs = welcomeConfigService.getWelcomeMessages();
            const firstMsg = welcomeMsgs[0] || null;
            let saludoMsg;
            if (firstMsg) {
              const resolvedContent = welcomeConfigService.resolveMessageContent(firstMsg);
              saludoMsg = firstMsg.includeUserName && userName
                ? `Hola, ${userName}, ${resolvedContent.replace(/^Hola,?\s*/i, '')}`
                : resolvedContent;
            } else {
              saludoMsg = userName
                ? `Hola, ${userName}, soy AntonIA Santos, su asesor en línea`
                : `Hola, soy AntonIA Santos, su asesor en línea`;
            }
            await whatsappProvider.sendMessage(userId, saludoMsg);
            await saveMessage(userId, saludoMsg, 'bot', 'welcome');

            // Send additional welcome messages (if configured)
            const speedMult = welcomeConfigService.getSpeedMultiplier();
            for (let wi = 1; wi < welcomeMsgs.length; wi++) {
              const wm = welcomeMsgs[wi];
              // ✅ Show typing indicator during the delay
              const effectiveDelay = (wm.delay || 0) * 1000 * speedMult;
              if (effectiveDelay > 0) {
                await whatsappProvider.sendTyping(userId);
                await new Promise(r => setTimeout(r, effectiveDelay));
                await whatsappProvider.clearTyping(userId);
              }
              const wmContent = welcomeConfigService.resolveMessageContent(wm);

              // Detect media type and send accordingly
              if ((wm.type === 'image' || wm.type === 'video' || wm.type === 'audio') && wm.mediaUrl) {
                await whatsappProvider.sendMediaMessage(userId, {
                  type: wm.type,
                  url: wm.mediaUrl,
                  caption: wmContent || ''
                });
                await saveMessage(userId, wmContent || `[${wm.type}]`, 'bot', 'welcome');
              } else {
                await whatsappProvider.sendMessage(userId, wmContent);
                await saveMessage(userId, wmContent, 'bot', 'welcome');
              }
            }

            // 2. Enviar mensajes de consentimiento (secuenciales con delay individual)
            await sendConsentSequence(userId, speedMult);

            // 3. Responder la pregunta del usuario inmediatamente con IA
            try {
              const aiResponse = await chatService.generateTextResponse(userId, message, { skipConsent: true });

              // ✅ VERIFICAR SI ES ESCALACIÓN (no tiene info en documentos)
              if (aiResponse && typeof aiResponse === 'object' &&
                (aiResponse.type === 'escalation' || aiResponse.type === 'escalation_no_info')) {
                logger.info(`🚨 Escalación detectada para ${userId} (pregunta en primer mensaje)`);

                // Actualizar estado de la conversación
                conversation.status = 'pending_advisor';
                conversation.bot_active = false;
                conversation.needs_human = true;
                conversation.needsHumanReason = aiResponse.escalation?.reason || 'no_information';
                conversation.escalationMessageSent = true;
                conversation.waitingForHuman = true;
                conversation.lastEscalationMessageAt = Date.now();

                // ✅ Send ALL transfer_human messages from dashboard
                await sendEscalationSequence(userId);

                // Emitir evento de escalación al dashboard
                if (io) {
                  io.emit('escalation-detected', {
                    userId, phoneNumber: conversation.phoneNumber,
                    reason: aiResponse.escalation?.reason || 'no_information',
                    priority: aiResponse.escalation?.priority || 'medium',
                    message, timestamp: Date.now()
                  });
                  // ✅ FIX: Emit bot-status-updated so the dashboard toggle updates in real-time
                  io.emit('bot-status-updated', {
                    userId: userId,
                    botActive: false,
                    status: conversation.status,
                    timestamp: Date.now()
                  });
                }
                return null;
              }

              let responseText = null;
              if (aiResponse && typeof aiResponse === 'object' && aiResponse.text) {
                responseText = aiResponse.text;
              } else if (typeof aiResponse === 'string') {
                responseText = aiResponse;
              }
              if (responseText) {
                await whatsappProvider.sendMessage(userId, responseText);
                await saveMessage(userId, responseText, 'bot', 'text');
                logger.info(`✅ Respuesta IA enviada a ${userId} (pregunta en primer mensaje)`);
              }
            } catch (aiError) {
              logger.error(`❌ Error generando respuesta IA: ${aiError.message}`);
              const fallbackMsg = `En qué le podemos servir?`;
              await whatsappProvider.sendMessage(userId, fallbackMsg);
              await saveMessage(userId, fallbackMsg, 'bot', 'system');
            }

            logger.info(`✅ Saludo + Datos + Respuesta enviados a ${userId} (pregunta detectada en primer mensaje)`);
            return null;
          } catch (flowError) {
            logger.error(`❌ Error en flujo de pregunta directa: ${flowError.message}`);
          }
        }

        // ✅ Flujo de bienvenida: Enviar mensajes configurados del dashboard + consentimiento
        // (No se usa NorboyMenuFlow — los mensajes se leen de welcome-config.json)
        try {
          conversation.welcomeSent = true;
          conversation.interactionCount = 1;
          conversation.consentMessageSent = true;
          conversation.consentStatus = 'noted';

          const userName = conversation.customName || conversation.whatsappName || null;
          const welcomeMsgs = welcomeConfigService.getWelcomeMessages();
          const speedMult = welcomeConfigService.getSpeedMultiplier();

          // Send each configured welcome message in order
          for (let wi = 0; wi < welcomeMsgs.length; wi++) {
            const wm = welcomeMsgs[wi];
            // ✅ Show typing indicator during the delay (applies to ALL messages)
            const effectiveDelay = (wm.delay || 0) * 1000 * speedMult;
            if (effectiveDelay > 0) {
              await whatsappProvider.sendTyping(userId);
              await new Promise(r => setTimeout(r, effectiveDelay));
              await whatsappProvider.clearTyping(userId);
            }

            let wmContent = welcomeConfigService.resolveMessageContent(wm);
            // Prepend user name on first message if configured
            if (wi === 0 && wm.includeUserName && userName) {
              wmContent = `Hola, ${userName}, ${wmContent.replace(/^Hola,?\s*/i, '')}`;
            }

            // Detect media type and send accordingly
            if ((wm.type === 'image' || wm.type === 'video' || wm.type === 'audio') && wm.mediaUrl) {
              await whatsappProvider.sendMediaMessage(userId, {
                type: wm.type,
                url: wm.mediaUrl,
                caption: wmContent || ''
              });
              await saveMessage(userId, wmContent || `[${wm.type}]`, 'bot', 'welcome');
            } else {
              await whatsappProvider.sendMessage(userId, wmContent);
              await saveMessage(userId, wmContent, 'bot', 'welcome');
            }
          }

          // Send consent / data policy messages (sequential with individual delays)
          await sendConsentSequence(userId, speedMult);

          logger.info(`✅ Mensajes de bienvenida del dashboard + consentimiento enviados a ${userId}`);

          return null;
        } catch (welcomeError) {
          logger.error(`❌ Error enviando bienvenida del dashboard: ${welcomeError.message}`);
          logger.info(`   → Volviendo al flujo original...`);

          // If dashboard messages fail, fall through to original flow fallback below
        }
      }

      // ===========================================
      // FLUJO ORIGINAL (SALUDO SIMPLE)
      // ===========================================
      logger.info(`📋 Usando flujo ORIGINAL (saludo simple)`);

      // Mensaje de saludo institucional (from welcome config)
      const fallbackMsgs = welcomeConfigService.getWelcomeMessages();
      let welcomeMsg;
      if (fallbackMsgs.length > 0) {
        const fb = fallbackMsgs[0];
        const resolvedFbContent = welcomeConfigService.resolveMessageContent(fb);
        const fbUserName = conversation.customName || conversation.whatsappName || null;
        welcomeMsg = fb.includeUserName && fbUserName
          ? `Hola, ${fbUserName}, ${resolvedFbContent.replace(/^Hola,?\s*/i, '')}`
          : resolvedFbContent;
      } else {
        welcomeMsg = `Hola! Somos el equipo NORBOY.\n\nBienvenido/a a nuestro canal de atención.\n\nEn un momento le solicitaremos autorización para el tratamiento de sus datos personales.\n\nMientras tanto, en qué podemos ayudarle?`;
      }

      // Marcar que ya se envió el saludo
      conversation.welcomeSent = true;
      conversation.interactionCount = 1;

      // Enviar saludo
      await whatsappProvider.sendMessage(userId, welcomeMsg);
      await saveMessage(userId, welcomeMsg, 'bot', 'welcome');

      logger.info(`✅ Saludo institucional enviado a ${userId}`);

      // NO procesar más - el siguiente mensaje activará consentimiento
      return null;
    }

    // ===========================================
    // PUNTO DE CONTROL 0.5: VERIFICAR SI HAY UN FLUJO ACTIVO (ANTES DE SPAM Y NUMBER-CONTROL)
    // ===========================================
    // ✅ CORREGIDO: El flujo activo se verifica PRIMERO, antes de spam y number-control.
    // Esto evita que inputs válidos del menú ("1", "2", "si", "no") se bloqueen como spam.
    if (flowManager.hasActiveFlow(userId) && USE_NEW_MENU_FLOW) {
      logger.info(`🔄 Procesando mensaje a través del flujo activo para ${userId}`);

      try {
        // Guardar mensaje del usuario (solo una vez)
        if (!userMessageSaved) {
          await saveMessage(userId, message, 'user');
          userMessageSaved = true;
        }

        // ✅ Reiniciar estado de spam al procesar un flujo válido
        spamControlService.resetUserState(userId);

        // Procesar input a través del flujo activo
        const flowResult = await flowManager.handleInput(userId, message);

        if (flowResult) {
          // ✅ CASO 1: Si el flujo se completó o fue cancelado
          if (flowResult.isCompleted || flowResult.isCancelled) {
            // Finalizar flujo
            await flowManager.endFlow(userId);
            conversation.activeFlow = null;

            // ✅ MODIFICADO: Si el usuario rechazó el consentimiento, igual se procede
            if (flowResult.data && flowResult.data.consentGiven === false) {
              logger.info(`📋 Usuario rechazó consentimiento, pero se procede a responder`);
              conversation.consentStatus = 'noted';
              // NO desactivar bot, NO enviar mensaje de rechazo
            }

            return null;
          }

          // ✅ CASO 2: El flujo llegó al paso final (process) con opción seleccionada
          if (flowResult.actionRequired && flowResult.selectedOption) {
            const selectedOption = flowResult.selectedOption;
            logger.info(`📊 Opción seleccionada: ${selectedOption}`);

            if (flowResult.step === 'process') {
              conversation.consentStatus = 'accepted';
              conversation.consentMessageSent = true;
              conversation.datosAceptados = true; // ✅ NUEVO: No volver a pedir consentimiento

              if (selectedOption === 1) {
                // Opción 1: Continuando con IA/RAG
                logger.info(`✅ Opción 1 seleccionada - Continuando con IA/RAG`);
              } else {
                // ✅ MODIFICADO: Todas las opciones ahora van a IA primero
                // Si la IA no puede responder, automáticamente escalará al asesor
                logger.info(`✅ Opción ${selectedOption} seleccionada - IA intentará responder primero`);
              }

              // Finalizar flujo para que los siguientes mensajes vayan a IA
              await flowManager.endFlow(userId);
              conversation.activeFlow = null;

              // Check for pending free question
              const pendingQuestion = (flowResult.data && flowResult.data.isFreeQuestion && flowResult.data.originalQuery)
                ? flowResult.data.originalQuery
                : conversation.pendingFreeQuestion || null;

              if (pendingQuestion) {
                // There's a pending question → answer it directly with AI
                logger.info(`💬 Procesando pregunta libre pendiente: "${pendingQuestion}"`);
                conversation.pendingFreeQuestion = null;
                try {
                  const aiResponse = await chatService.generateTextResponse(userId, pendingQuestion, { skipConsent: true });
                  let pendingResponseText = null;
                  if (aiResponse && typeof aiResponse === 'object' && aiResponse.text) {
                    pendingResponseText = aiResponse.text;
                  } else if (typeof aiResponse === 'string') {
                    pendingResponseText = aiResponse;
                  }
                  
                  // Check if AI escalates
                  if (aiResponse && typeof aiResponse === 'object' &&
                    (aiResponse.type === 'escalation' || aiResponse.type === 'escalation_no_info')) {
                    conversation.status = 'pending_advisor';
                    conversation.bot_active = false;
                    conversation.needs_human = true;
                    conversation.needsHumanReason = aiResponse.escalation?.reason || 'no_information';
                    conversation.escalationMessageSent = true;
                    conversation.waitingForHuman = true;
                    // ✅ Send ALL transfer_human messages from dashboard
                    await sendEscalationSequence(userId);
                    if (io) {
                      io.emit('bot-status-updated', {
                        userId, botActive: false, status: conversation.status, timestamp: Date.now()
                      });
                    }
                  } else if (pendingResponseText) {
                    await whatsappProvider.sendMessage(userId, pendingResponseText);
                    await saveMessage(userId, pendingResponseText, 'bot', 'text');
                    logger.info(`✅ Respuesta a pregunta libre enviada a ${userId}`);
                  }
                } catch (freeQError) {
                  logger.error(`❌ Error procesando pregunta libre pendiente: ${freeQError.message}`);
                  await whatsappProvider.sendMessage(userId, flowResult.message);
                  await saveMessage(userId, flowResult.message, 'bot', 'system');
                }
              } else {
                // No pending question → send data policy + "¿Qué duda tiene sumercé?"
                await whatsappProvider.sendMessage(userId, flowResult.message);
                await saveMessage(userId, flowResult.message, 'bot', 'consent');
                conversation.consentMessageSent = true;

                // Send follow-up question after a short delay
                if (flowResult.followUpMessage) {
                  await whatsappProvider.sendMessage(userId, flowResult.followUpMessage);
                  await saveMessage(userId, flowResult.followUpMessage, 'bot', 'system');
                }
              }

              return null;
            }
          }

          // ✅ CASO 3: Pregunta libre detectada → Enviar datos personales (si no se envió) + respuesta IA inmediata
          if (flowResult.freeQuestionDetected && flowResult.originalQuery) {
            logger.info(`💬 Pregunta libre detectada en flujo activo: "${flowResult.originalQuery}"`);

            // Finalizar flujo para que los siguientes mensajes vayan a IA
            await flowManager.endFlow(userId);
            conversation.activeFlow = null;

            // ✅ CORREGIDO: Solo enviar datos personales si NO se enviaron ya en el paso de consent del flujo
            const alreadySentConsent = conversation.consentMessageSent === true;
            conversation.consentMessageSent = true;
            conversation.consentStatus = 'noted';
            conversation.datosAceptados = true; // No volver a pedir

            if (!alreadySentConsent) {
              // Solo enviar si el flujo no lo envió ya (ej: pregunta libre desde menú, sin pasar por consent)
              const speedMult = welcomeConfigService.getSpeedMultiplier();
              await sendConsentSequence(userId, speedMult);
              logger.info(`📋 Mensajes de consentimiento enviados (primera vez)`);
            } else {
              logger.info(`📋 Mensaje de datos personales YA enviado por el flujo, no se reenvía`);
            }

            // 2. Responder la pregunta inmediatamente con IA
            try {
              const aiResponse = await chatService.generateTextResponse(userId, flowResult.originalQuery, { skipConsent: true });

              // ✅ VERIFICAR SI ES ESCALACIÓN (no tiene info en documentos)
              if (aiResponse && typeof aiResponse === 'object' &&
                (aiResponse.type === 'escalation' || aiResponse.type === 'escalation_no_info')) {
                logger.info(`🚨 Escalación detectada para ${userId} (pregunta libre en flujo activo)`);

                // Actualizar estado de la conversación
                conversation.status = 'pending_advisor';
                conversation.bot_active = false;
                conversation.needs_human = true;
                conversation.needsHumanReason = aiResponse.escalation?.reason || 'no_information';
                conversation.escalationMessageSent = true;
                conversation.waitingForHuman = true;
                conversation.lastEscalationMessageAt = Date.now();

                // ✅ Send ALL transfer_human messages from dashboard
                await sendEscalationSequence(userId);

                // Emitir evento de escalación al dashboard
                if (io) {
                  io.emit('escalation-detected', {
                    userId, phoneNumber: conversation.phoneNumber,
                    reason: aiResponse.escalation?.reason || 'no_information',
                    priority: aiResponse.escalation?.priority || 'medium',
                    message: flowResult.originalQuery, timestamp: Date.now()
                  });
                  io.emit('bot-status-updated', {
                    userId: userId,
                    botActive: false,
                    status: conversation.status,
                    timestamp: Date.now()
                  });
                }
                return null;
              }

              let responseText = null;
              if (aiResponse && typeof aiResponse === 'object' && aiResponse.text) {
                responseText = aiResponse.text;
              } else if (typeof aiResponse === 'string') {
                responseText = aiResponse;
              }
              if (responseText) {
                await whatsappProvider.sendMessage(userId, responseText);
                await saveMessage(userId, responseText, 'bot', 'text');
                logger.info(`✅ Respuesta IA enviada a ${userId} (pregunta libre en flujo activo)`);
              }
            } catch (aiError) {
              logger.error(`❌ Error generando respuesta IA (pregunta libre): ${aiError.message}`);
              const fallbackMsg = `En qué le podemos servir?`;
              await whatsappProvider.sendMessage(userId, fallbackMsg);
              await saveMessage(userId, fallbackMsg, 'bot', 'system');
            }

            return null;
          }

          // ✅ CASO 4: Error en el flujo (opción inválida, respuesta inválida)
          if (flowResult.isError && flowResult.message) {
            await whatsappProvider.sendMessage(userId, flowResult.message);
            await saveMessage(userId, flowResult.message, 'bot', 'flow_error');
            return null;
          }

          // ✅ CASO 5: Mensaje normal del flujo (consent, waiting for input, etc.)
          if (flowResult.message) {
            await whatsappProvider.sendMessage(userId, flowResult.message);
            await saveMessage(userId, flowResult.message, 'bot', 'flow');

            // ✅ CORREGIDO: Si el flujo envió el mensaje de consentimiento, marcarlo como enviado
            if (flowResult.step === 'consent') {
              conversation.consentMessageSent = true;
              logger.info(`📋 Mensaje de consentimiento enviado por el flujo para ${userId}`);
            }

            return null;
          }
        }

        // Si el flujo retornó null, continuar con procesamiento normal
        logger.info(`🔄 Flujo procesado correctamente, continuando con procesamiento normal`);

      } catch (flowError) {
        logger.error(`❌ Error procesando flujo activo: ${flowError.message}`);
        logger.error(flowError.stack);

        // Finalizar flujo en caso de error
        await flowManager.endFlow(userId);
        conversation.activeFlow = null;
      }
    }

    // ===========================================
    // PUNTO DE CONTROL 0: CONTROL DE NÚMEROS (IA DESACTIVADA)
    // ===========================================
    // IMPORTANTE: Esta validación se ejecuta DESPUÉS de verificar flujo activo
    // Si el número está en la lista de control con IA desactivada:
    // - NO se genera respuesta con el modelo
    // - NO se consumen tokens
    // - NO se envía mensaje automático
    // El mensaje del usuario SÍ se guarda para que el asesor pueda verlo
    const iaCheck = numberControlService.shouldIARespond(userId);

    if (!iaCheck.shouldRespond) {
      logger.info(`🔴 CONTROL DE NÚMEROS: IA desactivada para ${userId}`);
      logger.info(`   Nombre: ${iaCheck.record?.name || 'Sin nombre'}`);
      logger.info(`   Motivo: ${iaCheck.reason}`);

      // Guardar mensaje del usuario (para que el asesor pueda verlo) - solo si no se guardó antes
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user');
        userMessageSaved = true;
      }

      // NO responder automáticamente
      return null;
    }

    // ===========================================
    // PUNTO DE CONTROL 0.3: ANTI-SPAM (ANTES DE CONSUMIR TOKENS)
    // ===========================================
    // Detecta mensajes repetidos consecutivos del mismo usuario
    // Si el usuario envía el mismo mensaje 4+ veces: NO se llama a IA
    const spamCheck = spamControlService.evaluateMessage(userId, message, {
      phoneNumber: conversation.phoneNumber,
      userName: conversation.customName || conversation.whatsappName || ''
    });

    if (spamCheck.shouldBlock) {
      logger.warn(`🚫 ANTI-SPAM: Bloqueando respuesta para ${userId}`);
      logger.warn(`   Razón: ${spamCheck.reason}`);
      logger.warn(`   IA desactivada automáticamente: ${spamCheck.iaDeactivated}`);
      logger.warn(`   NO se consumen tokens de IA`);

      // Guardar mensaje del usuario (para historial) pero NO responder
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', options.messageType || 'text', mediaData);
        userMessageSaved = true;
      }

      // Marcar conversación como posible spam
      conversation.possibleSpam = true;
      conversation.spamConsecutiveCount = spamCheck.consecutiveCount;

      // Emitir evento al dashboard para notificar bloqueo por spam
      if (io) {
        io.emit('spam-blocked', {
          userId: userId,
          phoneNumber: conversation.phoneNumber,
          reason: spamCheck.reason,
          consecutiveCount: spamCheck.consecutiveCount,
          iaDeactivated: spamCheck.iaDeactivated,
          timestamp: Date.now()
        });
        logger.info(`📢 Evento 'spam-blocked' emitido al dashboard para ${userId}`);
      }

      return null; // NO responder, NO consumir tokens
    }

    // Si hay advertencia de spam (3 repeticiones), loguear pero dejar pasar
    if (spamCheck.isSpam && !spamCheck.shouldBlock) {
      logger.warn(`⚠️ ANTI-SPAM: Advertencia para ${userId} - ${spamCheck.reason}`);
      logger.warn(`   Próxima repetición será BLOQUEADA (sin tokens)`);
    }

    // ===========================================
    // PUNTO DE CONTROL 0.5: SOLICITAR CONSENTIMIENTO (SEGUNDO MENSAJE) - FLUJO ORIGINAL
    // ===========================================
    // Si ya se envió saludo pero NO se ha solicitado consentimiento,
    // este es el SEGUNDO mensaje - solicitar consentimiento
    if (conversation.welcomeSent &&
      !conversation.consentMessageSent &&
      conversation.consentStatus === 'pending' &&
      !conversation.datosAceptados) { // ✅ NUEVO: No repetir si ya aceptó

      // ✅ FIX: Respect the global consent toggle
      const consentGlobalEnabled = welcomeConfigService.getConsentConfig()?.enabled !== false;

      if (!consentGlobalEnabled) {
        // Consent disabled globally — skip consent step entirely
        logger.info(`📋 Consent globally disabled — skipping consent for ${userId} (original flow)`);
        conversation.consentMessageSent = true;
        conversation.consentStatus = 'noted';
        conversation.datosAceptados = true;
        // Fall through to normal message processing below
      } else {
        logger.info(`📋 SEGUNDO MENSAJE de ${userId} - Solicitando consentimiento`);
        logger.info(`   Mensaje guardado como pendiente: "${message.substring(0, 50)}..."`);

        // Guardar mensaje del usuario (pendiente para después) - solo si no se guardó antes
        if (!userMessageSaved) {
          await saveMessage(userId, message, 'user', {
            messageType: options.messageType || 'text',
            mediaData,
            whatsappMessageId: options.whatsappMessageId,
            originalMessage: options.originalMessage
          });
          userMessageSaved = true;
        }

        // Guardar mensaje pendiente para responder después de aceptar
        chatService.clearPendingMessage(userId);
        // Nota: El mensaje pendiente se manejará cuando acepte

        // Mensaje de datos personales (informativo, sin esperar respuesta)
        const consentMsg = `👋 ¡Gracias por escribirnos!\n\n📄 Consulte nuestras políticas de manejo de datos:\n🔒 Política de Protección de Datos Personales:\nhttps://norboy.coop/proteccion-de-datos-personales/\n\n💬 Uso de WhatsApp:\nhttps://www.whatsapp.com/legal\nGracias por contactarnos.`;

        // Marcar que se solicitó consentimiento
        conversation.consentMessageSent = true;
        conversation.interactionCount = 2;

        // Enviar mensaje de consentimiento
        await whatsappProvider.sendMessage(userId, consentMsg);
        await saveMessage(userId, consentMsg, 'bot', 'consent');

        logger.info(`✅ Mensaje de consentimiento enviado a ${userId}`);

        // NO procesar más - esperar respuesta de consentimiento
        return null;
      }
    }

    // ===========================================
    // VERIFICACIÓN DE CONSENTIMIENTO (RESPUESTA)
    // ===========================================
    // Si el consentimiento está solicitado, verificar la respuesta del usuario
    if (conversation.consentMessageSent === true && conversation.consentStatus === 'pending' && !conversation.datosAceptados) { // ✅ NUEVO: No repetir si ya aceptó
      const normalizedMessage = message.toLowerCase().trim();
      logger.info(`📋 Verificando respuesta de consentimiento: "${normalizedMessage}"`);

      // ✅ NUEVO: Guardar mensaje del usuario PRIMERO (para que aparezca en el dashboard)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: 'consent_response',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      // Verificar si acepta
      if (normalizedMessage === 'si' || normalizedMessage === 'sí' ||
        normalizedMessage === '1' || normalizedMessage.includes('acept')) {
        logger.info(`✅ Usuario ${userId} ACEPTÓ el consentimiento`);

        // ✅ NUEVO: Enviar mensaje de verificación temporal
        const verifyingMsg = `⏳ Verificando su respuesta, por favor espere...`;
        await saveMessage(userId, verifyingMsg, 'bot', { messageType: 'processing' });

        chatService.setConsentResponse(userId, true);
        conversation.consentStatus = 'accepted';
        conversation.consentMessageSent = false;
        conversation.datosAceptados = true; // ✅ NUEVO: No volver a pedir consentimiento

        // Enviar confirmación
        const confirmationMsg = `¡Perfecto, sumercé! 👍\n\nAhora puedo asesorarte.\n\n¿En qué puedo ayudarte?`;
        await whatsappProvider.sendMessage(userId, confirmationMsg);
        await saveMessage(userId, confirmationMsg, 'bot', { messageType: 'system' });

        return null; // No procesar más este mensaje
      }

      // Verificar si rechaza — ✅ MODIFICADO: Se procede igual a responder
      if (normalizedMessage === 'no' || normalizedMessage === '2' ||
        normalizedMessage.includes('rechaz')) {
        logger.info(`📋 Usuario ${userId} rechazó consentimiento, pero se procede a responder`);

        chatService.setConsentResponse(userId, true); // Marcar como procesado
        conversation.consentStatus = 'noted';
        conversation.consentMessageSent = false;
        conversation.datosAceptados = true; // No volver a preguntar

        // Enviar confirmación y continuar
        const confirmationMsg = `Entendido, sumercé. 👍\n\n¿En qué puedo ayudarte?`;
        await whatsappProvider.sendMessage(userId, confirmationMsg);
        await saveMessage(userId, confirmationMsg, 'bot', { messageType: 'system' });

        return null;
      }

      // ✅ NUEVO: Si el usuario envía cualquier otro mensaje (no si/no),
      // marcar consent como "notificado" y continuar al procesamiento de IA
      logger.info(`📋 Usuario ${userId} no respondió si/no al consentimiento. Continuando sin reenviar.`);
      conversation.consentStatus = 'noted';
      conversation.datosAceptados = true;
      conversation.consentMessageSent = false;
      chatService.setConsentResponse(userId, true);
      // No retornar — continuar al procesamiento normal de IA
    }

    // (PUNTO DE CONTROL 1 movido arriba - bot_active se verifica antes del flujo)

    // ===========================================
    // NUEVA REGLA: ESPERA POR ASESOR (evitar repetición)
    // ===========================================
    // Si ya está esperando asesor y YA se envió el mensaje de escalación,
    // NO responder nada más. Solo guardar el mensaje.
    if (conversation.waitingForHuman === true) {
      logger.info(`⏸️ Usuario ${userId} está esperando asesor. NO se responde.`);
      logger.info(`   escalationMessageSent: ${conversation.escalationMessageSent}`);
      logger.info(`   Mensaje del usuario guardado: "${message.substring(0, 50)}..."`);

      // Solo guardar el mensaje del usuario (si no se guardó antes)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }
      return null;
    }


    // ===========================================
    // PUNTO DE CONTROL 3: EVALUAR ESCALACIÓN (ANTES DE IA)
    // ===========================================
    // IMPORTANTE: Evaluar escalación ANTES de llamar a OpenAI para:
    // 1. Ahorrar tokens de OpenAI
    // 2. Responder más rápido
    // 3. Escalar correctamente cuando el usuario lo pide

    const interactionCount = conversation.interactionCount || 0;
    const escalation = escalationService.evaluateEscalation(userId, message, interactionCount);

    if (escalation.needsHuman) {
      logger.info(`🚨 Escalación detectada para ${userId}: ${escalation.reason}`);
      logger.info(`   Prioridad: ${escalation.priority}`);

      // Verificar que no se haya enviado ya el mensaje de escalación
      if (conversation.escalationMessageSent === true) {
        logger.info(`   Mensaje de escalación ya enviado. Solo guardando mensaje.`);
        if (!userMessageSaved) {
          await saveMessage(userId, message, 'user', {
            messageType: options.messageType || 'text',
            mediaData,
            whatsappMessageId: options.whatsappMessageId,
            originalMessage: options.originalMessage
          });
          userMessageSaved = true;
        }
        return null;
      }

      // Actualizar estado de la conversación
      conversation.status = 'pending_advisor';
      conversation.bot_active = false;
      conversation.needs_human = true;
      conversation.needsHumanReason = escalation.reason;
      conversation.escalationMessageSent = true;
      conversation.waitingForHuman = true;
      conversation.lastEscalationMessageAt = Date.now();

      logger.info(`📊 Estado cambiado a: pending_advisor`);
      logger.info(`   → bot_active: false`);
      logger.info(`   → waitingForHuman: true`);

      // Guardar mensajes (solo si no se guardó antes)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      // ✅ Send ALL transfer_human messages from dashboard
      await sendEscalationSequence(userId);

      // ✅ NUEVO: Emitir evento de escalación al dashboard
      if (io) {
        io.emit('escalation-detected', {
          userId: userId,
          phoneNumber: conversation.phoneNumber,
          reason: escalation.reason,
          priority: escalation.priority,
          message: message,
          detectedKeyword: escalation.detectedKeyword,
          timestamp: Date.now()
        });
        io.emit('bot-status-updated', {
          userId: userId,
          botActive: false,
          status: conversation.status,
          timestamp: Date.now()
        });
        logger.info(`📢 Evento 'escalation-detected' y 'bot-status-updated' emitido al dashboard para ${userId}`);
      }

      logger.info(`✅ Mensaje de escalación enviado a ${userId}`);

      return null;
    }

    // ===========================================
    // PUNTO DE CONTROL 4: PROCESAR MENSAJE CON IA
    // ===========================================
    // NOTA: Si llegamos aquí, el usuario ya:
    // 1. Recibió saludo de bienvenida
    // 2. Aceptó el consentimiento de datos
    // Por lo tanto, skipConsent=true para evitar duplicación

    // Intentar generar respuesta con la IA
    let response;
    try {
      response = await chatService.generateTextResponse(userId, message, {
        skipConsent: true  // Consentimiento ya validado en message-processor
      });
    } catch (aiError) {
      logger.error(`Error en IA para ${userId}:`, aiError);
      response = null;
    }

    // ===========================================
    // MANEJO DE RESPUESTA DE ESCALACIÓN
    // ===========================================
    // chatService puede retornar un objeto de escalación { type, text, needsHuman }
    let responseText = null;
    let isEscalation = false;

    if (response && typeof response === 'object' &&
      (response.type === 'escalation' || response.type === 'escalation_no_info')) {

      // Es una respuesta de escalación desde chatService
      isEscalation = true;

      const escalationReason = response.escalation?.reason || 'unknown';

      logger.info(`🚨 Escalación detectada desde chatService para ${userId}`);
      logger.info(`   Razón: ${escalationReason}`);
      logger.info(`   Tipo: ${response.type}`);

      // Actualizar estado de la conversación
      if (!conversation.escalationMessageSent) {
        conversation.status = 'pending_advisor';
        conversation.bot_active = false;
        conversation.needs_human = true;
        conversation.needsHumanReason = escalationReason;
        conversation.escalationMessageSent = true;
        conversation.waitingForHuman = true;
        conversation.lastEscalationMessageAt = Date.now();

        logger.info(`📊 Estado actualizado para ${userId}:`);
        logger.info(`   → status: pending_advisor`);
        logger.info(`   → bot_active: false`);
        logger.info(`   → waitingForHuman: true`);
        logger.info(`   → escalationMessageSent: true`);
      }

      // Guardar mensajes (solo si no se guardó antes)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }

      // ✅ Send ALL transfer_human messages from dashboard
      await sendEscalationSequence(userId);
      responseText = 'Escalation messages sent';

      // ✅ NUEVO: Emitir evento de escalación al dashboard
      if (io) {
        io.emit('escalation-detected', {
          userId: userId,
          phoneNumber: conversation.phoneNumber,
          reason: escalationReason,
          priority: response.escalation?.priority || 'medium',
          message: message,
          type: response.type,
          timestamp: Date.now()
        });
        io.emit('bot-status-updated', {
          userId: userId,
          botActive: false,
          status: conversation.status,
          timestamp: Date.now()
        });
        logger.info(`📢 Evento 'escalation-detected' y 'bot-status-updated' emitido al dashboard para ${userId}`);
      }

      logger.info(`✅ Mensaje de escalación enviado a ${userId}: "${responseText}"`);

      return null; // No enviar nada más (ya se envió arriba)
    }

    // Extraer texto de la respuesta si es un objeto con propiedad 'text'
    if (response && typeof response === 'object' && response.text) {
      responseText = response.text;
    } else if (typeof response === 'string') {
      responseText = response;
    }

    // ===========================================
    // PUNTO DE CONTROL 3: FALLBACK OBLIGATORIO
    // ===========================================
    if (!responseText || responseText === null || responseText === undefined) {
      logger.warn(`⚠️ Sin respuesta para ${userId}. Activando fallback.`);
      logger.warn(`   Mensaje: "${message.substring(0, 100)}..."`);

      // IMPORTANTE: Solo enviar el mensaje de fallback si NO se ha enviado antes
      if (conversation.escalationMessageSent === true) {
        logger.info(`   Mensaje de escalación ya enviado. Solo guardando mensaje.`);
        if (!userMessageSaved) {
          await saveMessage(userId, message, 'user', {
            whatsappMessageId: options.whatsappMessageId,
            originalMessage: options.originalMessage
          });
          userMessageSaved = true;
        }
        return null;
      }

      const fallbackMsg = "Su mensaje se procesará cuanto antes.";

      // Actualizar estado a pendiente de asesor
      conversation.status = 'pending_advisor';
      conversation.bot_active = false;
      conversation.needs_human = true;
      conversation.needsHumanReason = 'no_response_found';

      // NUEVO: Marcar que ya se envió el mensaje y está esperando
      conversation.escalationMessageSent = true;
      conversation.waitingForHuman = true;
      conversation.lastEscalationMessageAt = Date.now();

      logger.info(`📊 Estado cambiado a: pending_advisor (fallback)`);
      logger.info(`   → bot_active: false`);
      logger.info(`   → waitingForHuman: true`);

      // Enviar mensaje de fallback (SOLO UNA VEZ)
      await whatsappProvider.sendMessage(userId, fallbackMsg);

      // Guardar mensajes (solo si no se guardó antes)
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
        userMessageSaved = true;
      }
      await saveMessage(userId, fallbackMsg, 'bot', { messageType: 'escalation_fallback' });

      // ✅ NUEVO: Emitir evento de escalación al dashboard
      if (io) {
        io.emit('escalation-detected', {
          userId: userId,
          phoneNumber: conversation.phoneNumber,
          reason: 'no_response_found',
          priority: 'medium',
          message: message,
          type: 'escalation_fallback',
          timestamp: Date.now()
        });
        io.emit('bot-status-updated', {
          userId: userId,
          botActive: false,
          status: conversation.status,
          timestamp: Date.now()
        });
        logger.info(`📢 Evento 'escalation-detected' y 'bot-status-updated' emitido (fallback) para ${userId}`);
      }

      logger.info(`🚨 Usuario ${userId} escalado a asesor (fallback)`);

      return null;
    }

    // ===========================================
    // RESPUESTA EXITOSA
    // ===========================================
    logger.info(`✅ Respuesta generada para ${userId}: "${responseText.substring(0, 50)}..."`);

    // Guardar mensajes (solo si no se guardó antes)
    if (!userMessageSaved) {
      await saveMessage(userId, message, 'user', {
        messageType: options.messageType || 'text',
        mediaData,
        whatsappMessageId: options.whatsappMessageId,
        originalMessage: options.originalMessage
      });
      userMessageSaved = true;
    }

    // ✅ CORRECCIÓN: Pasar el objeto response completo si tiene type especial
    // Esto preserva el type 'consent', 'system', 'escalation', etc.
    if (typeof response === 'object' && response.type) {
      // Es un objeto con type especial (consent, system, escalation, etc.)
      await saveMessage(userId, response, 'bot', { messageType: response.type });
    } else {
      // Es una respuesta de texto normal
      await saveMessage(userId, responseText, 'bot', { messageType: 'text' });
    }

    return responseText;

  } catch (error) {
    logger.error(`Error crítico procesando mensaje de ${userId}:`, error);

    // En caso de error crítico, también escalar
    try {
      const fallbackMsg = "Su mensaje se procesará cuanto antes.";

      const conversation = conversationStateService.getOrCreateConversation(userId);
      conversation.status = 'pending_advisor';
      conversation.bot_active = false;
      conversation.needs_human = true;
      conversation.needsHumanReason = 'processing_error';

      await whatsappProvider.sendMessage(userId, fallbackMsg);
      if (!userMessageSaved) {
        await saveMessage(userId, message, 'user', {
          messageType: options.messageType || 'text',
          mediaData,
          whatsappMessageId: options.whatsappMessageId,
          originalMessage: options.originalMessage
        });
      }
      await saveMessage(userId, fallbackMsg, 'bot', { messageType: 'system' });

      // ✅ NUEVO: Emitir evento de estado del bot actualizado
      if (io) {
        io.emit('bot-status-updated', {
          userId: userId,
          botActive: false,
          status: conversation.status,
          timestamp: Date.now()
        });
      }

      logger.error(`🚨 Usuario ${userId} escalado a asesor (error)`);

    } catch (fallbackError) {
      logger.error(`Error incluso en fallback:`, fallbackError);
    }

    return null;
  }
}

/**
 * Verifica si estamos fuera del horario de atención
 * Horario: hasta las 4:30 PM (16:30)
 * ✅ VERIFICA DÍAS FESTIVOS Y HORARIO (ambos controlados por el botón de horario)
 *
 * @returns {boolean} true si está fuera de horario
 */
async function isOutOfHours() {
  // ✅ NUEVO: Verificar SIEMPRE si hoy es día festivo (independientemente de la verificación de horario)
  try {
    const holidaysService = require('./holidays.service');
    const isTodayHoliday = await holidaysService.isTodayHoliday();

    if (isTodayHoliday) {
      const holidayName = await holidaysService.getHolidayName(new Date());
      logger.info(`🎉 Hoy es DÍA FESTIVO: ${holidayName}. El bot no responderá.`);
      return true; // Considerar como fuera de horario
    }
  } catch (error) {
    logger.warn('Error verificando día festivo, continuando sin esta validación:', error.message);
  }

  // ✅ NUEVO: Verificar si la verificación de horario está desactivada
  if (!timeSimulation.isScheduleCheckEnabled()) {
    logger.debug(`⏰ Verificación de horario DESACTIVADA. Se permite respuesta.`);
    return false;
  }

  // ✅ ACTUALIZADO: Lee horario de schedule-config.service.js (configurable desde dashboard)
  const time = timeSimulation.getCurrentTime();
  const currentTimeDecimal = time.decimal;
  const cfg = scheduleConfig.getConfig();

  // ✅ CORREGIDO: Usar timezone.getDayOfWeek() en lugar de new Date().getDay()
  // para que el día de la semana use siempre la zona horaria configurada (America/Bogota)
  // y no la hora del servidor (AWS/UTC u otra)
  const day = timezone.getDayOfWeek(); // 0=Dom, 6=Sáb — en zona horaria de Colombia

  // Domingo
  if (day === 0 && !cfg.sunday.enabled) {
    logger.debug('⏰ Hoy es domingo - Fuera de horario');
    return true;
  }

  // Sábado
  if (day === 6) {
    if (!cfg.saturday.enabled) {
      logger.debug('⏰ Hoy es sábado - No se atiende');
      return true;
    }
    const satStart = cfg.saturday.start;
    const satEndDecimal = cfg.saturday.endHour + (cfg.saturday.endMinute / 60);
    const outOfSat = currentTimeDecimal < satStart || currentTimeDecimal > satEndDecimal;
    logger.debug(`⏰ Sábado: ${time.timeString} ${outOfSat ? 'FUERA' : 'DENTRO'} de ${satStart}:00-${cfg.saturday.endHour}:${cfg.saturday.endMinute.toString().padStart(2, '0')}`);
    return outOfSat;
  }

  // Lunes a Viernes
  const startDecimal = cfg.weekdays.start;
  const endTimeDecimal = cfg.weekdays.endHour + (cfg.weekdays.endMinute / 60);
  const isOutside = currentTimeDecimal < startDecimal || currentTimeDecimal > endTimeDecimal;

  if (isOutside || timeSimulation.isSimulationActive()) {
    const timeSource = timeSimulation.isSimulationActive()
      ? `HORA SIMULADA: ${timeSimulation.getSimulatedTime()}`
      : `Horario actual: ${time.timeString} (${time.timezone})`;

    logger.debug(`⏰ ${timeSource} → ${isOutside ? 'FUERA' : 'DENTRO'} de ${cfg.weekdays.start}:00-${cfg.weekdays.endHour}:${cfg.weekdays.endMinute.toString().padStart(2, '0')}`);
  }

  return isOutside;
}

/**
 * PUNTO DE CONTROL 4: Mensaje fuera de horario
 *
 * @returns {Promise<string>} Mensaje de fuera de horario
 */
async function getOutOfHoursMessage() {
  // Generar mensaje con horarios dinámicos desde la configuración
  const sched = scheduleConfig.getFormattedSchedule();

  // Verificar si hoy es festivo para personalizar el mensaje
  try {
    const holidaysService = require('./holidays.service');
    const isTodayHoliday = await holidaysService.isTodayHoliday();

    if (isTodayHoliday) {
      const holidayName = await holidaysService.getHolidayName(new Date());
      return `🎉 Hoy es ${holidayName}\n\nNuestro horario de atención es:\n\n📅 Lunes a Viernes: ${sched.weekdaysLabel}\n📅 Sábados: ${sched.saturdayLabel}\n\nSu mensaje será atendido en el siguiente día hábil. Gracias por su comprensión.`;
    }
  } catch (error) {
    logger.warn('Error verificando festivo para mensaje:', error.message);
  }

  return `Nuestro horario de atención es:\n\n📅 Lunes a Viernes: ${sched.weekdaysLabel}\n📅 Sábados: ${sched.saturdayLabel}\n❌ Domingos: ${sched.sundayLabel}\n\nSu mensaje será atendido en el siguiente horario hábil. Gracias por su comprensión.`;
}

/**
 * Guarda un mensaje en el historial
 *
 * @param {string} userId - ID del usuario
 * @param {string|Object} message - Contenido del mensaje
 * @param {string} sender - 'user' | 'bot' | 'admin' | 'system'
 * @param {Object} options - Opciones adicionales
 *   - messageType: 'text' | 'consent' | 'system' | 'escalation'
 *   - mediaData: Metadata de media
 *   - whatsappMessageId: ID de WhatsApp
 *   - originalMessage: Objeto original de Baileys
 */
async function saveMessage(userId, message, sender, options = {}) {
  const {
    messageType = 'text',
    mediaData = null,
    whatsappMessageId = null,
    originalMessage = null
  } = options;
  try {
    // Obtener conversación
    const conversation = conversationStateService.getConversation(userId);
    if (!conversation) {
      logger.warn(`Conversación no encontrada para ${userId}`);
      return;
    }

    // ✅ CORRECCIÓN: Extraer type del mensaje si es un objeto
    let messageText = message;
    let messageActualType = messageType;

    if (typeof message === 'object' && message !== null) {
      // Si es un objeto con propiedad 'type' (ej: consent, escalation, system)
      if (message.type) {
        messageActualType = message.type;
      }
      // Extraer el texto del mensaje
      if (message.text) {
        messageText = message.text;
      } else if (message.message) {
        messageText = message.message;
      }
    }

    // Crear objeto de mensaje
    const messageRecord = {
      id: whatsappMessageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      conversationId: userId,
      participantId: userId, // Para DynamoDB
      sender: sender,
      message: messageText,
      timestamp: Date.now(),
      type: messageActualType,
      direction: sender === 'user' ? 'incoming' : 'outgoing'
    };

    // Check for media types that SHOULD have media but might have failed initial download
    const isMediaType = ['image', 'video', 'audio', 'document'].includes(messageActualType);

    // Add media metadata to the message record if it exists
    if (mediaData) {
      messageRecord.mediaUrl = mediaData.mediaUrl || `/api/media/download/${messageRecord.id}`;
      messageRecord.fileName = mediaData.fileName || null;
      messageRecord.mimeType = mediaData.mimeType || null;
      messageRecord.fileSize = mediaData.fileSize || null;
      messageRecord.s3Key = mediaData.s3Key || null;
      messageRecord.type = mediaData.mediaType || messageActualType;
    } else if (isMediaType) {
      // ✅ FIX: Si es media pero falló la descarga, forzar URL de proxy para activar reconstrucción on-demand
      messageRecord.mediaUrl = `/api/media/download/${messageRecord.id}`;
      logger.warn(`⚠️ [MSG-PROC] Media download failed for ${messageRecord.id}, forcing proxy URL for on-demand recovery.`);
    }

    // ===========================================
    // ✅ OPCIÓN 3 - HÍBRIDA
    // ===========================================

    // 1. Guardar en memoria (últimos 50 para acceso rápido)
    if (!conversation.messages) {
      conversation.messages = [];
    }
    conversation.messages.push(messageRecord);

    // Limitar a últimos 50 en memoria
    if (conversation.messages.length > 50) {
      conversation.messages = conversation.messages.slice(-50);
    }

    // Actualizar último mensaje
    conversationStateService.updateLastMessage(userId, messageText);
    conversation.lastInteraction = Date.now();

    // 2. Guardar en DynamoDB (persistencia real) - asíncrono, no bloquea
    // ✅ DEDUP: Verificar que no se haya guardado ya este mensaje
    if (savedMessageIds.has(messageRecord.id)) {
      logger.debug(`⏭️ [DEDUP] Mensaje ya en cola para DynamoDB: ${messageRecord.id}`);
    } else {
      savedMessageIds.add(messageRecord.id);

      // Limpiar IDs antiguos para evitar memory leak
      if (savedMessageIds.size > 1000) {
        const idsArray = Array.from(savedMessageIds);
        idsArray.slice(0, 500).forEach(id => savedMessageIds.delete(id));
      }

      // Usamos setImmediate para no bloquear la respuesta del webhook
      setImmediate(async () => {
        try {
          const conversationRepository = require('../repositories/conversation.repository');

          // Crear modelo Message para DynamoDB
          const { Message } = require('../models/message.model');
          const dynamoMessage = new Message({
            id: messageRecord.id,
            conversationId: userId,
            participantId: userId,
            direction: sender === 'user' ? 'incoming' : 'outgoing',
            type: messageActualType === 'text' ? 'text' : messageActualType,
            content: {
              text: messageText,
              ...(mediaData || isMediaType ? {
                mediaUrl: (mediaData && mediaData.mediaUrl) || `/api/media/download/${messageRecord.id}`,
                fileName: (mediaData && mediaData.fileName) || null,
                mimeType: (mediaData && mediaData.mimeType) || null,
                fileSize: (mediaData && mediaData.fileSize) || null,
                s3Key: (mediaData && mediaData.s3Key) || null
              } : {})
            },
            from: sender === 'user' ? userId : undefined,
            to: sender === 'bot' ? userId : undefined,
            status: 'delivered',
            metadata: {
              sender: sender,
              originalType: messageActualType,
              // Flatten the Baileys message object (class instance) to a plain object
              // so that DynamoDB can marshall it. Truncate to 50KB to stay within limits.
              whatsappMessage: (() => {
                try {
                  const raw = originalMessage?._original || originalMessage || null;
                  if (!raw) return null;
                  const json = JSON.stringify(raw); // serialize class → string
                  const truncated = json.length > 50000 ? '[TRUNCATED] ' + json.substring(0, 50000) : json;
                  return JSON.parse(truncated); // back to plain object
                } catch (_) {
                  return null; // if serialization fails, skip safely
                }
              })()
            },
            createdAt: new Date(messageRecord.timestamp),
            updatedAt: new Date()
          });


          // Debug log antes de guardar
          logger.debug(`[DYNAMODB] Intentando persistir mensaje ${messageRecord.id} para ${userId}`);

          await conversationRepository.saveMessage(dynamoMessage);
          // Log se emite desde el repositorio para evitar duplicación

        } catch (dbError) {
          logger.error(`❌ [DYNAMODB] Error guardando mensaje ${messageRecord.id}:`, {
            message: dbError.message,
            code: dbError.code,
            name: dbError.name,
            stack: dbError.stack,
            userId: userId
          });

          // No lanzamos el error para no interrumpir el flujo
        }
      });
    }

    // ✅ MEJORADO: Log detallado para depuración
    logger.info(`💾 [MEMORIA] Mensaje guardado: [${sender}] type=${messageActualType} "${messageText.substring(0, 50)}"`);
    logger.info(`   → ID: ${messageRecord.id}`);
    logger.info(`   → Usuario: ${userId}`);
    logger.info(`   → Total en memoria: ${conversation.messages.length}/50`);

    // ✅ NUEVO: Emitir evento Socket.IO para actualizar dashboard en tiempo real
    if (io) {
      io.emit('new-message', {
        userId: userId,
        phoneNumber: conversation.phoneNumber,
        whatsappName: conversation.whatsappName || '',
        customName: conversation.customName || null, // ✅ FIX: Enviar nombre personalizado
        message: messageRecord,
        timestamp: Date.now()
      });
      logger.info(`📡 [SOCKET] Evento 'new-message' EMITIDO para ${userId}`);
      logger.info(`   → Mensaje: "${messageText.substring(0, 50)}"`);
    } else {
      logger.warn(`⚠️ Socket.IO NO disponible - mensaje no emitido en tiempo real`);
    }
  } catch (error) {
    logger.error('Error guardando mensaje:', error);
  }
}

/**
 * Obtiene el historial de mensajes de una conversación
 *
 * @param {string} userId - ID del usuario
 * @returns {Array} Lista de mensajes
 */
function getMessages(userId) {
  const conversation = conversationStateService.getConversation(userId);

  if (!conversation) {
    return [];
  }

  // TODO: Implementar recuperación desde base de datos
  // Por ahora, retornar array vacío o desde memoria
  return conversation.messages || [];
}

/**
 * Obtiene estadísticas del procesador
 *
 * @returns {Promise<Object>} Estadísticas
 */
async function getStats() {
  const all = conversationStateService.getAllConversations();

  const botActive = all.filter(c => c.bot_active === true).length;
  const botInactive = all.filter(c => c.bot_active === false).length;
  const needsHuman = all.filter(c => c.needs_human === true).length;
  const outOfHours = all.filter(c => c.status === 'out_of_hours').length;

  return {
    total: all.length,
    botActive,
    botInactive,
    needsHuman,
    outOfHours,
    isOutOfHoursNow: await isOutOfHours(),
    businessHours: BUSINESS_HOURS
  };
}

module.exports = {
  processIncomingMessage,
  isOutOfHours,
  getOutOfHoursMessage,
  getMessages,
  getStats,
  setSocketIO,  // ✅ Para inicializar Socket.IO
  // ✅ Guardar mensaje saliente enviado manualmente desde el celular físico o WhatsApp Web.
  // sender='advisor' es consistente con las respuestas manuales del dashboard.
  // getOrCreateConversation garantiza que la conversación existe en memoria
  // aunque el servidor haya reiniciado o el asesor haya iniciado el chat él mismo.
  saveOutgoingMessage: async (userId, text, messageId, mediaData = null) => {
    // Ensure the conversation exists in cache before saving the message.
    // saveMessage() uses getConversation() (read-only) and fails silently if it doesn't exist.
    conversationStateService.getOrCreateConversation(userId);
    const msgType = (mediaData && mediaData.mediaType) ? mediaData.mediaType : 'text';
    return saveMessage(userId, text, 'advisor', {
      messageType: msgType,
      mediaData,
      whatsappMessageId: messageId
    });
  }
};


