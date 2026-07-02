// === EPIPE PROTECTION (prevent crash when stdout pipe breaks) ===
process.stdout.on('error', (err) => { if (err.code === 'EPIPE') return; throw err; });
process.stderr.on('error', (err) => { if (err.code === 'EPIPE') return; throw err; });
// === END EPIPE PROTECTION ===

require('dotenv').config();
process.stdout.write(`\n[BOOT] AWS_S3_BUCKET from process.env: ${process.env.AWS_S3_BUCKET || 'MISSING'}\n`);

/**
 * ===========================================
 * SERVIDOR PRINCIPAL - NORBOY CHATBOT
 * ===========================================
 *
 * Integra:
 * - Express (API)
 * - Socket.IO (comunicación en tiempo real)
 * - WhatsApp Web (conexión vía QR — MULTI-SESSION)
 * - OpenAI (respuestas inteligentes)
 */

const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const config = require('./src/config');
const { requireAuth } = require('./src/middlewares/auth.middleware');
const logger = require('./src/utils/logger');
const messageProcessor = require('./src/services/message-processor.service');
const advisorControlService = require('./src/services/advisor-control.service');
const conversationStateService = require('./src/services/conversation-state.service');
const { splitIntoBubbles } = require('./src/utils/bubble-splitter');

// Multi-session manager (replaces single whatsappWeb singleton)
const sessionManager = require('./src/providers/whatsapp/session-manager');

logger.info(`Usando WhatsApp provider: baileys (multi-session)`);

const chatService = require('./src/services/chat.service');
const spamControlService = require('./src/services/spam-control.service');
const numberControlService = require('./src/services/number-control.service');

// Inject numberControlService into spam-control (avoid circular dependency)
spamControlService.setNumberControlService(numberControlService);

// Embeddings service for automatic initialization
const embeddingsService = require('./src/services/embeddings.service');

const PORT = config.server.port;

// Create HTTP server
const server = http.createServer(app);

// Configure Socket.IO with dynamic CORS
const envOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3001',
      ...envOrigins
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize services with Socket.IO
messageProcessor.setSocketIO(io);
advisorControlService.setSocketIO(io);

const routes = require('./src/routes');
if (routes.setSocketIO) {
  routes.setSocketIO(io);
}

// Inject WhatsApp client getter for bulk messaging (uses session1 by default)
if (routes.setWhatsAppClientGetter) {
  routes.setWhatsAppClientGetter(() => {
    const defaultSession = sessionManager.getDefaultSession();
    return defaultSession ? defaultSession.getClient() : null;
  });
}

// ===========================================
// SOCKET.IO - REAL-TIME COMMUNICATION
// ===========================================
io.on('connection', (socket) => {
  logger.debug('Cliente conectado a Socket.IO');

  // Send current status of ALL sessions
  socket.on('get-status', () => {
    const allStatuses = sessionManager.getAllStatuses();
    // Emit multi-session status
    socket.emit('all-sessions-status', allStatuses);
    // Backward compat: also emit legacy 'status' for session1
    const s1Status = allStatuses.session1;
    if (s1Status) {
      socket.emit('status', s1Status);
    }
  });

  // Send QR for a specific session
  socket.on('get-qr', (data) => {
    const sessionId = (data && data.sessionId) || 'session1';
    const qr = sessionManager.getQRCode(sessionId);
    if (qr) {
      socket.emit('session:qr', { sessionId, qr });
      // Backward compat for session1
      if (sessionId === 'session1') {
        socket.emit('qr', qr);
      }
    }
  });

  socket.on('disconnect', () => {
    logger.debug('Cliente desconectado de Socket.IO');
  });
});

// ===========================================
// SESSION MANAGER EVENTS → SOCKET.IO
// ===========================================

// QR generated for a session
sessionManager.on('session:qr', ({ sessionId, qr }) => {
  logger.info(`[Server] QR for ${sessionId} relayed to dashboard`);
  io.emit('session:qr', { sessionId, qr });
  // Backward compat: session1 → legacy 'qr' event
  if (sessionId === 'session1') {
    io.emit('qr', qr);
  }
});

// Session authenticated
sessionManager.on('session:authenticated', ({ sessionId }) => {
  logger.info(`[Server] ${sessionId} authenticated, relayed to dashboard`);
  io.emit('session:authenticated', { sessionId });
  if (sessionId === 'session1') {
    io.emit('authenticated');
  }
});

// Session ready
sessionManager.on('session:ready', ({ sessionId, miNumero, miNombre }) => {
  logger.info(`[Server] ${sessionId} ready — number: ${miNumero}`);
  io.emit('session:ready', { sessionId, miNumero, miNombre });
  if (sessionId === 'session1') {
    io.emit('ready', { miNumero, miNombre });
  }

  // Inject socket into media service for this session
  const session = sessionManager.getSession(sessionId);
  if (session && session.sock) {
    const mediaStorageService = require('./src/services/media-storage.service');
    mediaStorageService.setWhatsAppSocket(session.sock);
  }
});

// Session disconnected
sessionManager.on('session:disconnected', ({ sessionId, reason }) => {
  logger.warn(`[Server] ${sessionId} disconnected: ${reason}`);
  io.emit('session:disconnected', { sessionId, reason });
  if (sessionId === 'session1') {
    io.emit('disconnected', reason);
  }
});

// Session expired
sessionManager.on('session:expired', ({ sessionId, reason }) => {
  logger.warn(`[Server] ${sessionId} session expired: ${reason}`);
  io.emit('session:expired', { sessionId, reason });
  if (sessionId === 'session1') {
    io.emit('session-expired', reason);
  }
});

// ✅ FIX: Handle message delivery failures
sessionManager.on('session:message-failed', (data) => {
  logger.error(`[Server] ${data.sessionId} message failed: to=${data.to}, retries=${data.retries}`);
  io.emit('message-failed', data);
});

// ✅ FIX: Handle session health issues
sessionManager.on('session:issue', (data) => {
  logger.error(`[Server] ${data.sessionId} session issue: ${data.message}`);
  io.emit('session-issue', data);
});

// ===========================================
// PROCESS WHATSAPP MESSAGES (MULTI-SESSION)
// ===========================================
sessionManager.on('session:message', async ({ sessionId, message }) => {
  try {
    logger.info(`🔔 [SERVER] Message received on ${sessionId}`);
    logger.info(`   message.from="${message.from}"`);
    logger.info(`   message.body="${message.body?.substring(0, 30)}"`);
    logger.info(`   message.type="${message.type}"`);

    const rawFrom = message.from;
    const from = `${sessionId}:${rawFrom}`; // Use composite ID internally
    const body = message.body;
    const type = message.type;
    const pushName = message.pushName || null;

    // ✅ DEVICE: Tag the conversation with the session that received the message
    conversationStateService.updateSessionId(from, sessionId);

    // Detect chat type
    const chatType = from.includes('@lid') ? 'LID' :
      from.includes('@g.us') ? 'Grupo' :
        from.includes('@s.whatsapp.net') ? 'Normal' :
          from.includes('@c.us') ? 'Normal' : 'Desconocido';

    logger.info(`📩 [${sessionId}] Mensaje [${chatType}] de ${from}: ${body?.substring(0, 50)}...`);
    logger.info(`📝 Tipo de mensaje: ${type} | fromMe: ${message.fromMe}`);

    // Get the session's provider for sending replies
    const sessionProvider = sessionManager.getSession(sessionId);

    // ===========================================
    // GROUPS: Save message for dashboard but do NOT activate bot
    // ===========================================
    if (from.includes('@g.us')) {
      logger.info(`👥 [${sessionId}] Mensaje de GRUPO recibido — guardando para dashboard (sin bot)`);

      // Get group name
      let groupName = null;
      try {
        const chatData = sessionProvider && sessionProvider.localChats ? sessionProvider.localChats.get(from) : null;
        if (chatData && (chatData.name || chatData.subject)) {
          groupName = chatData.name || chatData.subject;
        }
        if (!groupName && sessionProvider && sessionProvider.sock) {
          try {
            const metadata = await sessionProvider.sock.groupMetadata(from);
            if (metadata && metadata.subject) {
              groupName = metadata.subject;
              if (sessionProvider.localChats) {
                sessionProvider.localChats.set(from, { ...(chatData || {}), name: groupName, id: from });
              }
            }
          } catch (metaErr) {
            logger.debug(`⚠️ No se pudo obtener metadata del grupo: ${metaErr.message}`);
          }
        }
      } catch (nameErr) {
        logger.debug(`⚠️ Error obteniendo nombre del grupo: ${nameErr.message}`);
      }

      if (!groupName) {
        groupName = 'Grupo ' + from.replace('@g.us', '').slice(-6);
      }

      // Create/update conversation
      const conversationStateService = require('./src/services/conversation-state.service');
      const conv = conversationStateService.getOrCreateConversation(from, {
        whatsappName: groupName,
        realPhoneNumber: from.replace('@g.us', '')
      });
      if (groupName && conv.whatsappName !== groupName) {
        conv.whatsappName = groupName;
        conv.whatsappNameUpdatedAt = Date.now();
      }
      conversationStateService.updateLastMessage(from, body || '[Multimedia]');

      // Download media if present
      let mediaData = null;
      const isMediaType = ['image', 'video', 'audio', 'document'].includes(type);
      if (isMediaType && message.hasMedia) {
        try {
          const mediaStorageService = require('./src/services/media-storage.service');
          mediaData = await mediaStorageService.saveMediaFromMessage(message);
          if (mediaData) {
            logger.info(`✅ [${sessionId}][GRUPO] Media guardada: ${mediaData.mediaUrl}`);
          }
        } catch (mediaError) {
          logger.warn(`⚠️ [${sessionId}][GRUPO] Error guardando media: ${mediaError.message}`);
        }
      }

      // Build display text
      const mediaLabel = type === 'audio' ? '[Audio recibido]' :
        type === 'image' ? '[Imagen recibida]' :
          type === 'video' ? '[Video recibido]' :
            type === 'document' ? '[Documento recibido]' : null;
      const displayText = body || mediaLabel || '[Multimedia]';

      // Build message record
      const conversationRepository = require('./src/repositories/conversation.repository');
      const msgId = (message.id ? message.id : null) || ('group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
      const msgRecord = {
        id: msgId,
        conversationId: from,
        sender: 'user',
        senderName: pushName || 'Participante',
        message: displayText,
        timestamp: Date.now(),
        type: type || 'text',
        direction: 'incoming'
      };

      // Add media metadata
      if (mediaData) {
        msgRecord.mediaUrl = mediaData.mediaUrl || `/api/media/download/${msgId}`;
        msgRecord.fileName = mediaData.fileName || null;
        msgRecord.mimeType = mediaData.mimeType || null;
        msgRecord.fileSize = mediaData.fileSize || null;
        msgRecord.s3Key = mediaData.s3Key || null;
      } else if (isMediaType) {
        msgRecord.mediaUrl = `/api/media/download/${msgId}`;
      }

      // Save to memory
      if (!conv.messages) conv.messages = [];
      conv.messages.push(msgRecord);
      if (conv.messages.length > 50) conv.messages = conv.messages.slice(-50);
      conv.lastInteraction = Date.now();

      // Save to DynamoDB
      try {
        const { Message } = require('./src/models/message.model');
        const dynamoMessage = new Message({
          id: msgId,
          conversationId: from,
          participantId: from,
          direction: 'incoming',
          type: type || 'chat',
          content: {
            text: displayText,
            ...(mediaData || isMediaType ? {
              mediaUrl: (mediaData && mediaData.mediaUrl) || `/api/media/download/${msgId}`,
              fileName: (mediaData && mediaData.fileName) || null,
              mimeType: (mediaData && mediaData.mimeType) || null,
              fileSize: (mediaData && mediaData.fileSize) || null,
              s3Key: (mediaData && mediaData.s3Key) || null
            } : {})
          },
          from: from,
          status: 'delivered',
          metadata: { sender: 'user', senderName: pushName || 'Participante', isGroup: true, sessionId },
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await conversationRepository.saveMessage(dynamoMessage);
      } catch (dbErr) {
        logger.warn(`⚠️ Error guardando mensaje de grupo en DynamoDB: ${dbErr.message}`);
      }

      // Emit Socket.IO event
      try {
        io.emit('new-message', {
          userId: from,
          phoneNumber: from.replace('@g.us', ''),
          whatsappName: groupName,
          message: msgRecord,
          timestamp: Date.now(),
          sessionId
        });
      } catch (socketErr) {
        logger.warn(`⚠️ Error emitiendo socket para grupo: ${socketErr.message}`);
      }

      return; // Do NOT activate bot logic for groups
    }

    if (pushName) {
      logger.info(`👤 Nombre del contacto: ${pushName}`);
    }

    // Ignore empty text messages (historical Baileys events)
    if ((type === 'chat' || type === 'conversation') && (!body || body.trim() === '')) {
      logger.debug('⏭️ Mensaje de texto vacío, ignorando');
      return;
    }

    // ===========================================
    // BUTTON RESPONSE HANDLING (CONSENT)
    // ===========================================
    if (type === 'button_response' || message?.message?.buttonsResponseMessage) {
      const selectedButtonId = message?.message?.buttonsResponseMessage?.selectedButtonId;
      logger.info(`🔘 Botón presionado: ${selectedButtonId}`);

      if (selectedButtonId === 'consent_accept') {
        chatService.setConsentResponse(from, true);
        const client = sessionProvider.getClient();
        await client.sendMessage(rawFrom, { text: '✅ Gracias por aceptar. Procesando su consulta...' });
        logger.info(`✅ Usuario ${from} aceptó el consentimiento`);

        const pendingMessage = chatService.getPendingMessage(from);
        if (pendingMessage) {
          chatService.clearPendingMessage(from);
          const response = await chatService.generateTextResponse(from, pendingMessage, { skipConsent: true });
          if (response) {
            let responseText = typeof response === 'string' ? response : response.text || '';
            if (responseText) {
              await client.sendMessage(rawFrom, { text: responseText });
              io.emit('bot-response', {
                to: from,
                response: `[Aceptó consentimiento y respondió]: ${responseText.substring(0, 50)}...`,
                chatType, sessionId
              });
            }
          }
        } else {
          await client.sendMessage(rawFrom, { text: 'Sumercé, en qué le podemos ayudar?' });
          io.emit('bot-response', { to: from, response: 'Aceptó consentimiento', chatType, sessionId });
        }
      } else if (selectedButtonId === 'consent_reject') {
        chatService.setConsentResponse(from, false);
        const client = sessionProvider.getClient();
        await client.sendMessage(rawFrom, {
          text: 'Entendido. Sin el consentimiento no podemos continuar con la conversación. Si cambia de opinión, puede iniciar una nueva conversación.'
        });
        logger.info(`❌ Usuario ${from} rechazó el consentimiento`);
      }

      io.emit('bot-response', {
        to: from,
        response: selectedButtonId === 'consent_accept' ? 'Aceptó consentimiento' : 'Rechazó consentimiento',
        chatType, sessionId
      });
      return;
    }

    // ===========================================
    // TEXT CONSENT RESPONSE HANDLING
    // ===========================================
    const hasPendingMessage = chatService.getPendingMessage(from);
    const interactionCount = chatService.getUserInteractionCount(from);
    const hasConsent = chatService.hasUserConsent(from);

    if (hasPendingMessage && !hasConsent && interactionCount >= 2) {
      const normalizedBody = body.toLowerCase().trim();
      const positiveResponses = ['1', 'aceptar', 'ok', 'si', 'sí', 'yes', 'acepto'];
      const negativeResponses = ['2', 'no aceptar', 'no', 'rechazar', 'rechazo'];

      let consentResponse = null;

      if (positiveResponses.includes(normalizedBody) || positiveResponses.some(r => normalizedBody.includes(r))) {
        consentResponse = 'accept';
      } else if (negativeResponses.includes(normalizedBody) || negativeResponses.some(r => normalizedBody.includes(r))) {
        consentResponse = 'reject';
      }

      if (consentResponse) {
        const client = sessionProvider.getClient();

        if (consentResponse === 'accept') {
          chatService.setConsentResponse(from, true);
          await client.sendMessage(rawFrom, { text: '✅ Gracias por aceptar. Procesando su consulta...' });

          const pendingMessage = chatService.getPendingMessage(from);
          if (pendingMessage) {
            chatService.clearPendingMessage(from);
            const response = await chatService.generateTextResponse(from, pendingMessage, { skipConsent: true });
            if (response) {
              let responseText = typeof response === 'string' ? response : response.text || '';
              if (responseText) {
                await client.sendMessage(rawFrom, { text: responseText });
                io.emit('bot-response', {
                  to: from,
                  response: `[Aceptó consentimiento y respondió]: ${responseText.substring(0, 50)}...`,
                  chatType, sessionId
                });
              }
            }
          } else {
            await client.sendMessage(rawFrom, { text: 'Sumercé, en qué le podemos ayudar?' });
            io.emit('bot-response', { to: from, response: 'Aceptó consentimiento', chatType, sessionId });
          }
        } else {
          chatService.setConsentResponse(from, false);
          await client.sendMessage(rawFrom, {
            text: 'Entendido. Sin el consentimiento no podemos continuar con la conversación. Si cambia de opinión, puede iniciar una nueva conversación.'
          });
          io.emit('bot-response', { to: from, response: 'Rechazó consentimiento', chatType, sessionId });
        }
        return;
      }
    }

    // Notify dashboard
    io.emit('message-received', { from, body, type, chatType, sessionId });

    // ===========================================
    // PROCESS MESSAGE (text or multimedia)
    // ===========================================
    if (type === 'chat' || type === 'conversation') {
      logger.info(`🔄 [${sessionId}] Procesando mensaje de texto con messageProcessor...`);

      const response = await messageProcessor.processIncomingMessage(from, body, { 
        pushName,
        whatsappMessageId: message.id,
        sessionId: sessionId 
      });

      if (!response) {
        logger.debug('⏭️ Sin respuesta externa (ya procesada internamente)');
        return;
      }

      logger.info(`✅ Respuesta generada: ${response.substring(0, 50)}...`);

      try {
        const client = sessionProvider.getClient();
        // Split into multiple bubbles for a human-like feel
        const bubbles = splitIntoBubbles(response);
        for (let i = 0; i < bubbles.length; i++) {
          if (i > 0) {
            // Short typing indicator between bubbles (0.8s per ~50 chars)
            await client.sendPresenceUpdate('composing', rawFrom);
            const delayMs = Math.min(Math.max(bubbles[i].length * 16, 600), 2000);
            await new Promise(r => setTimeout(r, delayMs));
            await client.sendPresenceUpdate('paused', rawFrom);
          }
          await client.sendMessage(rawFrom, { text: bubbles[i] });
        }
        logger.info(`✅ [${sessionId}] Respuesta enviada a ${from} (${bubbles.length} burbujas)`);
      } catch (sendError) {
        logger.error(`❌ Error enviando respuesta: ${sendError.message}`);
        throw sendError;
      }

      io.emit('bot-response', { to: from, response, chatType, sessionId });

    } else if (type === 'audio' || type === 'image' || type === 'document' || type === 'video') {
      logger.info(`🔄 [${sessionId}] Procesando mensaje multimedia (${type})...`);

      // Persist multimedia file to disk/S3
      let mediaData = null;
      try {
        const mediaStorageService = require('./src/services/media-storage.service');
        mediaData = await mediaStorageService.saveMediaFromMessage(message);
        if (mediaData) {
          logger.info(`✅ Media guardada: ${mediaData.mediaUrl} (${mediaData.fileName})`);
        }
      } catch (mediaError) {
        logger.warn(`⚠️ Error guardando media (no crítico): ${mediaError.message}`);
      }

      const caption = message.body || '';
      const mediaLabel = type === 'audio' ? '[Audio recibido]' :
        type === 'image' ? '[Imagen recibida]' :
          type === 'document' ? '[Documento recibido]' : '[Video recibido]';
      const mediaBody = caption || mediaLabel;

      const response = await messageProcessor.processIncomingMessage(from, mediaBody, {
        pushName,
        messageType: type,
        originalMessage: message,
        mediaData: mediaData,
        whatsappMessageId: message.id,
        sessionId: sessionId // ✅ BUG 1 FIXED: Pass sessionId to processor
      });

      if (!response) {
        logger.debug('⏭️ Sin respuesta externa para multimedia');
        return;
      }

      try {
        const client = sessionProvider.getClient();
        // Split into multiple bubbles for a human-like feel
        const bubbles = splitIntoBubbles(response);
        for (let i = 0; i < bubbles.length; i++) {
          if (i > 0) {
            await client.sendPresenceUpdate('composing', rawFrom);
            const delayMs = Math.min(Math.max(bubbles[i].length * 16, 600), 2000);
            await new Promise(r => setTimeout(r, delayMs));
            await client.sendPresenceUpdate('paused', rawFrom);
          }
          await client.sendMessage(rawFrom, { text: bubbles[i] });
        }
        logger.info(`✅ [${sessionId}] Respuesta enviada a ${from} (${bubbles.length} burbujas)`);
      } catch (sendError) {
        logger.error(`❌ Error enviando respuesta: ${sendError.message}`);
        throw sendError;
      }

      io.emit('bot-response', { to: from, response, chatType, sessionId });


    } else {
      logger.warn(`⚠️ Tipo de mensaje no soportado: ${type}`);
    }

  } catch (error) {
    logger.error('❌ Error procesando mensaje:', error);
    logger.error('Stack trace:', error.stack);

    try {
      const sessionProvider = sessionManager.getSession(sessionId);
      const client = sessionProvider ? sessionProvider.getClient() : null;
      const userPhone = message?.from || message?.key?.remoteJid;

      if (client && userPhone) {
        await client.sendMessage(userPhone, {
          text: 'Disculpa, tuve un problema procesando tu mensaje. Por favor intenta de nuevo.'
        });
      }
    } catch (e) {
      logger.error('❌❌ Error enviando mensaje de error:', e);
    }
  }
});

// ===========================================
// CAPTURE OUTGOING MESSAGES (FROM PHONE)
// ===========================================
sessionManager.on('session:outgoing', async ({ sessionId, to, body, id, mediaType, originalMsg }) => {
  try {
    logger.info(`📤 [${sessionId}] Guardando mensaje enviado desde celular → ${to}: "${body.substring(0, 50)}"`);

    // Persist multimedia from phone
    let mediaData = null;
    if (originalMsg && mediaType !== 'text') {
      try {
        const mediaStorageService = require('./src/services/media-storage.service');
        mediaData = await mediaStorageService.saveMediaFromMessage(originalMsg);
        if (mediaData) {
          logger.info(`✅ [${sessionId}] Media saliente guardada: ${mediaData.mediaUrl}`);
        }
      } catch (mediaError) {
        logger.warn(`⚠️ [${sessionId}] Error guardando media saliente: ${mediaError.message}`);
      }
    }

    await messageProcessor.saveOutgoingMessage(to, body, id, mediaData);
    logger.info(`✅ [${sessionId}] Mensaje desde celular guardado correctamente`);
  } catch (err) {
    logger.error(`❌ [${sessionId}] Error guardando mensaje desde celular: ${err.message}`);
  }
});

// ===========================================
// SESSION ENDPOINTS (Logout/Clear per session)
// ===========================================

// Logout a specific session
app.post('/logout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId || 'session1';
    logger.info(`Solicitando cierre de sesión para ${sessionId}...`);

    await sessionManager.logoutSession(sessionId);
    io.emit('session:disconnected', { sessionId, reason: 'Sesión cerrada manualmente' });
    if (sessionId === 'session1') {
      io.emit('disconnected', 'Sesión cerrada manualmente');
    }

    // Reinitialize after 2 seconds
    setTimeout(async () => {
      try {
        logger.info(`🔄 Reinicializando ${sessionId} después de logout...`);
        await sessionManager.reinitializeSession(sessionId);
      } catch (error) {
        logger.error(`Error reinicializando ${sessionId}:`, error);
      }
    }, 2000);

    res.json({
      success: true,
      message: `Sesión ${sessionId} cerrada. Reconectando automáticamente...`
    });
  } catch (error) {
    logger.error('Error cerrando sesión:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clear session and generate new QR
app.post('/clear-session', requireAuth, async (req, res) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId || 'session1';
    logger.info(`Limpiando sesión ${sessionId} y generando nuevo QR...`);

    await sessionManager.clearSession(sessionId);
    io.emit('session:disconnected', { sessionId, reason: 'Sesión limpiada manualmente' });
    if (sessionId === 'session1') {
      io.emit('disconnected', 'Sesión limpiada manualmente');
    }

    // Reinitialize after 3 seconds
    setTimeout(async () => {
      try {
        logger.info(`🔄 Reinicializando ${sessionId} para nuevo QR...`);
        await sessionManager.reinitializeSession(sessionId);
      } catch (error) {
        logger.error(`Error reinicializando ${sessionId}:`, error);
      }
    }, 3000);

    res.json({
      success: true,
      message: `Sesión ${sessionId} limpiada. Generando nuevo QR...`
    });
  } catch (error) {
    logger.error('Error limpiando sesión:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get status of all sessions (REST API)
app.get('/api/sessions/status', requireAuth, (_req, res) => {
  try {
    const allStatuses = sessionManager.getAllStatuses();
    res.json({ success: true, sessions: allStatuses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===========================================
// START SERVER
// ===========================================
server.listen(PORT, async () => {
  logger.info(`🚀 Servidor iniciado en http://localhost:${PORT}`);
  logger.info(`📱 Abre http://localhost:${PORT} para conectar WhatsApp`);

  // Rebuild media index from DynamoDB
  try {
    const mediaStorageService = require('./src/services/media-storage.service');
    const rebuilt = await mediaStorageService.rebuildIndexFromDB();
    logger.info(`📎 Media index rebuilt: ${rebuilt} entries from DynamoDB`);
  } catch (err) {
    logger.warn(`⚠️ Error rebuilding media index: ${err.message}`);
  }

  // Initialize embeddings in background
  initializeEmbeddingsInBackground();

  // Initialize and connect all WhatsApp sessions
  try {
    await sessionManager.initialize();
    await sessionManager.connectAll();
  } catch (error) {
    logger.error('Error inicializando sesiones de WhatsApp:', error);
  }
});

// ===========================================
// EMBEDDINGS BACKGROUND INITIALIZATION
// ===========================================

async function initializeEmbeddingsInBackground() {
  try {
    if (process.env.USE_EMBEDDINGS !== 'false') {
      logger.info('🧠 Inicializando embeddings en background...');
      logger.info('   (El bot ya está funcionando, esto se procesa en segundo plano)');

      await embeddingsService.loadAllChunks();
      await embeddingsService.warmup();

      const stats = embeddingsService.getEmbeddingStats();
      const totalChunks = stats.totalChunks;
      const withEmbeddings = stats.withEmbeddings;
      const withoutEmbeddings = stats.withoutEmbeddings;

      logger.info(`📊 Estadísticas de embeddings:`);
      logger.info(`   Total chunks: ${totalChunks}`);
      logger.info(`   ✅ Con embeddings: ${withEmbeddings} (${totalChunks > 0 ? ((withEmbeddings / totalChunks) * 100).toFixed(1) : 0}%)`);
      logger.info(`   ❌ Sin embeddings: ${withoutEmbeddings} (${totalChunks > 0 ? ((withoutEmbeddings / totalChunks) * 100).toFixed(1) : 0}%)`);

      if (withoutEmbeddings > 0) {
        logger.info(`🔄 Generando ${withoutEmbeddings} embeddings faltantes en background...`);

        const knowledgeUploadService = require('./src/services/knowledge-upload.service');
        const files = knowledgeUploadService.getUploadedFiles();

        let processedCount = 0;
        let generatedCount = 0;

        for (const file of files) {
          try {
            const data = await knowledgeUploadService.getFileData(file);

            if (data && data.chunks) {
              const chunksNeedingEmbeddings = data.chunks.filter(c => !c.embeddingGenerated && !c.embedding);

              if (chunksNeedingEmbeddings.length > 0) {
                const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(data.chunks);
                await knowledgeUploadService.saveFileData(file, {
                  ...data,
                  chunks: chunksWithEmbeddings
                });
                generatedCount += chunksNeedingEmbeddings.length;
              }

              processedCount++;

              if (processedCount % 3 === 0 || processedCount === files.length) {
                logger.info(`   Progreso: ${processedCount}/${files.length} archivos procesados (${generatedCount} embeddings generados)...`);
              }
            }
          } catch (error) {
            logger.warn(`⚠️ Error procesando embeddings para ${file.originalName}: ${error.message}`);
          }
        }

        logger.info(`✅ Embeddings inicializados: ${processedCount} archivos procesados, ${generatedCount} embeddings generados`);

        await embeddingsService.reloadChunks();

        const finalStats = embeddingsService.getEmbeddingStats();
        logger.info(`📊 Estadísticas finales:`);
        logger.info(`   ✅ Con embeddings: ${finalStats.withEmbeddings}/${finalStats.totalChunks} (${((finalStats.withEmbeddings / finalStats.totalChunks) * 100).toFixed(1)}%)`);
        logger.info(`🎯 Búsqueda vectorial activa`);
      } else {
        logger.info('✅ Todos los chunks ya tienen embeddings');
        logger.info('🎯 Búsqueda vectorial activa');
      }
    } else {
      logger.info('ℹ️ Embeddings desactivados (USE_EMBEDDINGS=false)');
    }
  } catch (error) {
    logger.error('❌ Error inicializando embeddings:', error.message);
    logger.warn('   El bot continuará funcionando sin embeddings');
  }
}

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) {
    logger.warn('Shutdown ya en progreso, ignorando señal duplicada...');
    return;
  }

  isShuttingDown = true;
  logger.info(`${signal} recibido. Cerrando servidor...`);

  // 1. Close Socket.IO
  try {
    if (io) {
      io.sockets.disconnectSockets();
      await new Promise((resolve) => {
        io.close(() => {
          logger.info('Socket.IO cerrado');
          resolve();
        });
      });
    }
  } catch (e) {
    logger.warn('Error cerrando Socket.IO:', e.message);
  }

  // 2. Close all WhatsApp sessions
  try {
    await sessionManager.destroy();
    logger.info('Todas las sesiones de WhatsApp cerradas');
  } catch (e) {
    logger.warn('Error cerrando sesiones de WhatsApp:', e.message);
  }

  // 3. Close HTTP server
  try {
    server.close(() => {
      logger.info('✅ Servidor HTTP cerrado correctamente');
      process.exit(0);
    });
  } catch (e) {
    logger.error('Error cerrando servidor HTTP:', e.message);
    process.exit(1);
  }

  // 4. Force exit after timeout
  setTimeout(() => {
    logger.error('⚠️ Timeout: Cierre forzado después de 30 segundos');
    try { server.closeAllConnections(); } catch (e) { /* ignore */ }
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Excepción no capturada:', error);

  const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN'];
  const errorCode = error.code || error.cause?.code || '';
  const isTransient = transientCodes.includes(errorCode)
    || error.message?.includes('terminated')
    || error.message?.includes('ECONNRESET')
    || error.message?.includes('fetch failed');

  if (isTransient) {
    logger.warn('⚠️ Error de red transitorio, el servidor continúa ejecutándose');
    return;
  }

  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa rechazada no manejada:', reason);
});

module.exports = server;
