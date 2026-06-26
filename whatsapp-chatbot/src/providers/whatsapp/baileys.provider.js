/**
 * ===========================================
 * PROVEEDOR BAILEYS (WhatsApp sin navegador)
 * ===========================================
 *
 * Conecta WhatsApp usando @whiskeysockets/baileys
 * - Sin Chrome/Puppeteer
 * - Conexión WebSocket directa
 * - Más estable y rápido
 * - Basado en CHAT-BOT-WIMPY/WhatsAppConnection.js
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestWaWebVersion, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const EventEmitter = require('events');
const conversationStateService = require('../../services/conversation-state.service');
const mediaStorageService = require('../../services/media-storage.service');

// ✅ FFMPEG para conversión de audio (Compatibilidad móvil)
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

class BaileysProvider extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {string} [options.sessionId='default'] - Unique session identifier
   * @param {string} [options.authPath] - Custom auth directory path
   */
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || 'default';
    this.sock = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = 'disconnected';
    this.miNumero = null;
    this.miLid = null;     // Own LID for multi-device status broadcasting
    this.miNombre = null;
    this.isConnecting = false;
    this.authPath = options.authPath || path.join(process.cwd(), 'baileys_auth');
    // Local chat storage (for dashboard)
    this.localChats = new Map(); // id -> chat data
    // LID → phone map to avoid duplicate chats
    this.lidToPhone = new Map(); // lid@lid -> number@s.whatsapp.net
    // Timer management to avoid loops
    this.reconnectTimeout = null;
    this.qrTimeout = null;
    // Counter to prevent infinite auth failure loops
    this.authFailureCount = 0;
    this.MAX_AUTH_RETRIES = 1; // Only retry once after auth failure, then wait for manual QR
  }

  /**
   * Inicializa el cliente de WhatsApp con Baileys
   * Detecta sesión existente y evita generar QR innecesario
   */
  async initialize() {
    logger.info('[WhatsApp] Initializing client...');

    // ✅ NUEVO: Cancelar reconexiones pendientes
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    if (this.isConnecting) {
      logger.warn('[WhatsApp] Client already initializing (skip)');
      return;
    }

    // If already connected, skip re-initialization
    if (this.isReady && this.sock) {
      logger.info('[WhatsApp] Client already connected (skip)');
      return;
    }

    // ✅ FIX: Destroy previous socket to prevent listener accumulation
    await this._destroySocket();

    this.isConnecting = true;
    this.qrEmitted = false;  // 🔑 Nuevo: rastrear si ya se emitió QR
    this.hasExistingSession = false;  // 🔑 Nuevo: rastrear si hay sesión previa

    try {
      // Crear directorio de autenticación si no existe
      if (!fs.existsSync(this.authPath)) {
        fs.mkdirSync(this.authPath, { recursive: true });
        logger.info('Directorio de autenticación creado (nueva sesión)');
      }

      // Verificar si hay archivos de sesión existentes
      const authFiles = fs.existsSync(this.authPath) ? fs.readdirSync(this.authPath) : [];
      this.hasExistingSession = authFiles.length > 0;

      if (this.hasExistingSession) {
        logger.info(`📁 Sesión existente detectada (${authFiles.length} archivos): ${authFiles.join(', ')}`);
        logger.info(`📂 Ruta de autenticación: ${this.authPath}`);
        logger.info(`♻️  Intentando restaurar sesión sin QR...`);
      } else {
        logger.info('📝 No hay sesión previa en baileys_auth');
        logger.info('📱 Se generará nuevo código QR para escanear');
      }

      // Cargar estado de autenticación
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

      // ✅ FIX 405: Fetch the latest WA Web version to avoid protocol mismatch
      let waVersion;
      try {
        const versionInfo = await fetchLatestWaWebVersion({});
        waVersion = versionInfo.version;
        logger.info(`📡 WA Web version obtenida: ${waVersion}`);
      } catch (e) {
        logger.warn(`⚠️ No se pudo obtener WA Web version: ${e.message}. Usando default.`);
        waVersion = undefined; // Baileys will use its internal default
      }

      // Crear socket de WhatsApp
      const socketConfig = {
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        browser: Browsers.appropriate('Chrome'), // ✅ FIX 405: Use Baileys built-in browser fingerprint
        syncFullHistory: true,
        markOnlineOnConnect: false,
        emitOwnEvents: true
      };

      // Only set version if we fetched it successfully
      if (waVersion) {
        socketConfig.version = waVersion;
      }

      logger.info(`🔧 Socket config: browser=${JSON.stringify(socketConfig.browser)}, version=${waVersion || 'default'}`);
      this.sock = makeWASocket(socketConfig);

      // Guardar credenciales cuando se actualicen
      this.sock.ev.on('creds.update', saveCreds);

      // ✅ NUEVO: Store en memoria para capturar chats del historial
      const chatsStore = {};
      const store = {
        get: (id) => chatsStore[id],
        set: (id) => chatsStore[id] = id,
        all: () => Object.keys(chatsStore)
      };

      // ✅ NUEVO: Escuchar eventos de actualización de chats (historial de WhatsApp)
      this.sock.ev.on('chats.set', async ({ chats, lastMsg, isLatest }) => {
        if (!chats || chats.length === 0) {
          logger.debug('📂 No hay chats en el evento chats.set');
          return;
        }

        logger.info(`📂 Recibiendo ${chats.length} chats desde WhatsApp (isLatest: ${isLatest})`);

        let importedCount = 0;
        for (const chat of chats) {
          const chatId = chat.id;
          if (!chatId) continue;

          // ✅ Guardar en almacenamiento local
          this.localChats.set(chatId, chat);

          // Process individual chats AND group chats (for dashboard Groups filter)
          if (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us')) {
            continue;
          }

          store.set(chatId, chatId);

          // Extraer número de teléfono (o ID del grupo)
          const phoneNumber = chatId.includes('@g.us') ? chatId.replace('@g.us', '') : chatId.replace('@s.whatsapp.net', '');

          // Obtener nombre del chat
          const chatName = chat.name || chat.notify || null;

          // Crear o actualizar conversación
          const existingConv = conversationStateService.getConversation(chatId);

          if (!existingConv) {
            conversationStateService.getOrCreateConversation(chatId, {
              whatsappName: chatName,
              realPhoneNumber: phoneNumber
            });
            importedCount++;
            logger.debug(`📂 Chat importado: ${phoneNumber} (${chatName || 'Sin nombre'})`);
          } else {
            // Actualizar nombre si no existe
            if (chatName && !existingConv.whatsappName) {
              existingConv.whatsappName = chatName;
              existingConv.whatsappNameUpdatedAt = Date.now();
            }
          }
        }

        logger.info(`✅ ${importedCount} nuevos chats importados desde WhatsApp`);
      });

      // Manejar eventos de conexión
      this.sock.ev.on('connection.update', async (update) => {
        await this._handleConnectionUpdate(update);
      });

      // Manejar mensajes entrantes
      this.sock.ev.on('messages.upsert', async (m) => {
        await this._handleMessages(m);
      });

      // ✅ NUEVO: Detectar fallos silenciosos en envío de media
      // ✅ FIX: Enhanced monitoring for status@broadcast ACKs
      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          const status = update.update?.status;
          const msgId = update.key?.id;
          const remoteJid = update.key?.remoteJid;
          const isStatusMsg = remoteJid === 'status@broadcast';

          if (status !== undefined) {
            // status: 0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
            if (isStatusMsg) {
              // Always log status@broadcast ACKs at info level for debugging
              const statusNames = { 0: 'ERROR', 1: 'PENDING', 2: 'SERVER_ACK', 3: 'DELIVERY_ACK', 4: 'READ', 5: 'PLAYED' };
              const statusName = statusNames[status] || `UNKNOWN(${status})`;
              if (status === 0) {
                logger.error(`❌ [WA-STATUS ACK] Estado FALLIDO id=${msgId}, status=${statusName} — WhatsApp rechazó el estado`);
              } else {
                logger.info(`📡 [WA-STATUS ACK] id=${msgId}, status=${statusName}`);
              }
            } else {
              if (status === 0) {
                logger.error(`❌ [MSG-UPDATE] MENSAJE FALLIDO id=${msgId}, status=ERROR(0)`);
              } else if (status >= 2) {
                logger.debug(`✅ [MSG-UPDATE] id=${msgId}, status=${status}`);
              }
            }
          }
        }
      });

      // ✅ NUEVO: Escuchar evento de sincronización de historial
      this.sock.ev.on('messaging-history:sync', async ({ chats, messages, contacts }) => {
        logger.info('📂 Sincronización de historial recibida de WhatsApp');

        if (chats && chats.length > 0) {
          logger.info(`📂 Procesando ${chats.length} chats del historial...`);
          let importedCount = 0;

          for (const chat of chats) {
            // chat tiene estructura: { id, name, t (timestamp), ... }
            const chatId = chat.id;

            // Process individual chats AND group chats (for dashboard)
            if (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us')) {
              continue;
            }

            const phoneNumber = chatId.includes('@g.us') ? chatId.replace('@g.us', '') : chatId.replace('@s.whatsapp.net', '');
            const chatName = chat.name || chat.notify || null;

            const existingConv = conversationStateService.getConversation(chatId);

            if (!existingConv) {
              conversationStateService.getOrCreateConversation(chatId, {
                whatsappName: chatName,
                realPhoneNumber: phoneNumber
              });
              importedCount++;
            } else {
              // Actualizar nombre si no existe
              if (chatName && !existingConv.whatsappName) {
                existingConv.whatsappName = chatName;
                existingConv.whatsappNameUpdatedAt = Date.now();
              }
            }
          }

          logger.info(`✅ ${importedCount} nuevos chats importados desde historial`);

          // Los chats ya se persistieron individualmente via getOrCreateConversation -> persistConversation
          if (importedCount > 0) {
            logger.info(`✅ ${importedCount} chats del historial ya persistidos individualmente`);
          }
        }
      });

      // ✅ NUEVO: Escuchar evento chat.upsert (cuando se actualiza un chat individual)
      this.sock.ev.on('chat.upsert', (chat) => {
        const chatId = chat.id;
        if (!chatId || (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us'))) {
          return;
        }

        // ✅ Guardar en almacenamiento local
        this.localChats.set(chatId, chat);

        const phoneNumber = chatId.replace('@s.whatsapp.net', '');
        const chatName = chat.name || chat.notify || null;

        const existingConv = conversationStateService.getConversation(chatId);

        if (!existingConv) {
          conversationStateService.getOrCreateConversation(chatId, {
            whatsappName: chatName,
            realPhoneNumber: phoneNumber
          });
          logger.debug(`📂 Chat upsert: ${phoneNumber} (${chatName || 'Sin nombre'})`);
        } else {
          if (chatName && !existingConv.whatsappName) {
            existingConv.whatsappName = chatName;
            existingConv.whatsappNameUpdatedAt = Date.now();
          }
        }
      });

      // ✅ NUEVO: Escuchar contacts.upsert para construir mapa LID ↔ teléfono
      this.sock.ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
          const id = contact.id;
          if (!id) continue;

          // Si el contact tiene lid Y id es teléfono → mapear
          if (id.endsWith('@s.whatsapp.net') && contact.lid) {
            this.lidToPhone.set(contact.lid, id);
            logger.debug(`🔗 [LID MAP] contacts.upsert: ${contact.lid} → ${id}`);
          }
          // Si el id es LID y tiene phoneNumber → mapear al revés
          if (id.endsWith('@lid') && contact.phoneNumber) {
            const phoneJid = contact.phoneNumber.replace(/\+/g, '') + '@s.whatsapp.net';
            this.lidToPhone.set(id, phoneJid);
            logger.debug(`🔗 [LID MAP] contacts.upsert: ${id} → ${phoneJid}`);
          }
        }
        if (this.lidToPhone.size > 0) {
          logger.info(`🔗 [LID MAP] Total mapeos LID→teléfono: ${this.lidToPhone.size}`);
        }
      });

      // ✅ NUEVO: Escuchar contacts.update para actualizar mapa LID ↔ teléfono
      this.sock.ev.on('contacts.update', (updates) => {
        for (const update of updates) {
          const id = update.id;
          if (!id) continue;
          if (id.endsWith('@s.whatsapp.net') && update.lid) {
            this.lidToPhone.set(update.lid, id);
            logger.debug(`🔗 [LID MAP] contacts.update: ${update.lid} → ${id}`);
          }
          if (id.endsWith('@lid') && update.phoneNumber) {
            const phoneJid = update.phoneNumber.replace(/\+/g, '') + '@s.whatsapp.net';
            this.lidToPhone.set(id, phoneJid);
            logger.debug(`🔗 [LID MAP] contacts.update: ${id} → ${phoneJid}`);
          }
        }
      });

      // ✅ NUEVO: Escuchar evento chats.upsert (cuando se agregan múltiples chats)
      this.sock.ev.on('chats.upsert', (chats) => {
        if (!chats || chats.length === 0) return;

        logger.info(`📂 chats.upsert: ${chats.length} chats recibidos`);

        for (const chat of chats) {
          const chatId = chat.id;
          if (!chatId || (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us'))) {
            continue;
          }

          // ✅ Guardar en almacenamiento local
          this.localChats.set(chatId, chat);

          const phoneNumber = chatId.includes('@g.us') ? chatId.replace('@g.us', '') : chatId.replace('@s.whatsapp.net', '');
          const chatName = chat.name || chat.notify || null;

          const existingConv = conversationStateService.getConversation(chatId);

          if (!existingConv) {
            conversationStateService.getOrCreateConversation(chatId, {
              whatsappName: chatName,
              realPhoneNumber: phoneNumber
            });
            logger.debug(`📂 Chat upsert: ${phoneNumber} (${chatName || 'Sin nombre'})`);
          } else {
            if (chatName && !existingConv.whatsappName) {
              existingConv.whatsappName = chatName;
              existingConv.whatsappNameUpdatedAt = Date.now();
            }
          }
        }
      });

      // ✅ NUEVO: Escuchar evento "messaging-history:set" que contiene los chats
      this.sock.ev.on('messaging-history:set', ({ chats, contacts }) => {
        if (chats && chats.length > 0) {
          logger.info(`📂 messaging-history:set: ${chats.length} chats recibidos`);

          for (const chat of chats) {
            const chatId = chat.id;
            if (!chatId || (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us'))) {
              continue;
            }

            const phoneNumber = chatId.includes('@g.us') ? chatId.replace('@g.us', '') : chatId.replace('@s.whatsapp.net', '');
            const chatName = chat.name || chat.notify || null;

            const existingConv = conversationStateService.getConversation(chatId);

            if (!existingConv) {
              conversationStateService.getOrCreateConversation(chatId, {
                whatsappName: chatName,
                realPhoneNumber: phoneNumber
              });
              logger.debug(`📂 Chat from history: ${phoneNumber} (${chatName || 'Sin nombre'})`);
            } else {
              if (chatName && !existingConv.whatsappName) {
                existingConv.whatsappName = chatName;
                existingConv.whatsappNameUpdatedAt = Date.now();
              }
            }
          }
        }
      });

      logger.info('[WhatsApp] Socket initialized, waiting for connection...');

    } catch (error) {
      logger.error('Error inicializando Baileys:', error);
      this.isConnecting = false;
      this.status = 'error';
      throw error;
    }
  }

  /**
   * ✅ FIX: Properly destroy the existing socket and remove all listeners
   * This prevents listener accumulation and zombie connections
   */
  async _destroySocket() {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
        logger.info('🔌 Socket anterior destruido correctamente');
      } catch (e) {
        logger.debug(`Socket cleanup warning: ${e.message}`);
      }
      this.sock = null;
    }
  }

  /**
   * Maneja actualizaciones de conexión
   * Implementa lógica para evitar QR innecesario con sesión existente
   */
  async _handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    // QR Code generado
    if (qr) {
      // ✅ FIX: If already connected, ignore spurious QR events
      if (this.isReady) {
        logger.info('[WhatsApp] QR received but already connected (ignoring)');
        return;
      }

      logger.info('[WhatsApp] QR code received');

      // If we have an existing session, wait briefly for auto-reconnect
      if (this.hasExistingSession && !this.qrEmitted) {
        logger.info('[WhatsApp] Existing session detected, waiting for auto-connect (8s)...');

        if (this.qrTimeout) clearTimeout(this.qrTimeout);

        this.qrTimeout = setTimeout(async () => {
          if (!this.isReady) {
            logger.info('[WhatsApp] Auto-connect timeout, showing QR');
            this._emitQR(qr);
          } else {
            logger.info('[WhatsApp] Session restored automatically (no QR needed)');
          }
          this.qrTimeout = null;
        }, 8000);
      } else {
        // No existing session, emit QR immediately
        this._emitQR(qr);
      }
    }

    // Conexión cerrada
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      const isRateLimited = statusCode === 405;
      const isAuthFailure = statusCode === DisconnectReason.loggedOut
        || statusCode === 401 || statusCode === 403;

      logger.warn(`[WhatsApp] Connection closed (status: ${statusCode})`);
      this.isReady = false;
      this.isConnecting = false;
      this.status = 'disconnected';
      this.qrCode = null;
      this.miNumero = null;
      this.miLid = null;
      this.qrEmitted = false;

      // ✅ FIX: Cancel any pending reconnect to avoid accumulating timers
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      if (this.qrTimeout) {
        clearTimeout(this.qrTimeout);
        this.qrTimeout = null;
      }

      this.emit('disconnected', lastDisconnect?.error?.message || 'Desconectado');

      if (isRateLimited) {
        logger.warn('[WhatsApp] Rate limited (405). Waiting for manual action.');
        this.status = 'rate_limited';
        this.emit('session-expired', 'WhatsApp rechazó la conexión. Espera 2-3 min y usa "Limpiar sesión" desde el dashboard.');

      } else if (isAuthFailure) {
        logger.warn('[WhatsApp] Auth failure, cleaning credentials...');
        try {
          if (fs.existsSync(this.authPath)) {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            logger.info('[WhatsApp] Invalid session removed from baileys_auth/');
          }
        } catch (e) {
          logger.error('[WhatsApp] Error cleaning session:', e.message);
        }
        this.status = 'waiting_manual_qr';
        this.emit('session-expired', 'Sesión inválida. Usa "Limpiar sesión" en el dashboard.');

      } else if (shouldReconnect) {
        this.authFailureCount = 0;
        logger.info('[WhatsApp] Reconnecting in 10 seconds...');
        this.reconnectTimeout = setTimeout(() => this.initialize(), 10000);

      } else {
        logger.error('[WhatsApp] Session closed by user');
      }
    }

    // Conexión exitosa
    if (connection === 'open') {
      // ✅ FIX: Prevent double-handling if already ready
      if (this.isReady) {
        logger.info('[WhatsApp] Connection open event received but already ready (ignoring)');
        return;
      }
      await this._handleReady();
    }
  }

  /**
   * Emite el QR al dashboard y terminal
   * (método auxiliar para no duplicar código)
   */
  async _emitQR(qr) {
    if (this.qrEmitted) return;  // Already emitted

    // ✅ FIX: Double-check we're not already connected
    if (this.isReady) {
      logger.info('[WhatsApp] QR generation skipped (already connected)');
      return;
    }

    logger.info('[WhatsApp] QR generated - scan with WhatsApp');
    this.status = 'waiting_qr';
    this.qrEmitted = true;

    // Show QR in terminal
    qrcode.generate(qr, { small: true });

    // Generate QR as data URL for web dashboard
    try {
      const qrDataUrl = await qrcodeImage.toDataURL(qr);
      this.qrCode = qrDataUrl;
      this.emit('qr', qrDataUrl);
      logger.info('[WhatsApp] QR emitted to dashboard');
    } catch (err) {
      logger.error('[WhatsApp] Error generating QR data URL:', err);
      this.qrCode = qr;
      this.emit('qr', qr);
    }
  }

  /**
   * Maneja cuando el bot está listo
   */
  async _handleReady() {
    // ✅ FIX: Clear QR and timers FIRST to prevent stale state
    this.qrCode = null;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    // ✅ FIX: Single state assignment (was duplicated before)
    this.isReady = true;
    this.isConnecting = false;
    this.status = 'ready';
    this.authFailureCount = 0;

    // Inject socket into media service
    mediaStorageService.setWhatsAppSocket(this.sock);

    // Log connection type
    if (this.hasExistingSession && !this.qrEmitted) {
      logger.info('[WhatsApp] Connected (session restored automatically, no QR needed)');
    } else if (this.qrEmitted) {
      logger.info('[WhatsApp] Connected (new session via QR scan)');
    } else {
      logger.info('[WhatsApp] Connected');
    }

    try {
      const user = this.sock.user;
      if (user && user.id) {
        this.miNumero = user.id.split(':')[0];
        this.miNombre = user.name || null;
        // Store own LID for status broadcasting (multi-device protocol)
        this.miLid = user.lid || null;
        logger.info(`[WhatsApp] My number: ${this.miNumero}, name: ${this.miNombre}, lid: ${this.miLid || 'N/A'}`);
      }
    } catch (e) {
      logger.warn('[WhatsApp] Could not retrieve own number');
    }

    // Load historical chats after Baileys finishes syncing
    setTimeout(async () => {
      await this._loadHistoricalChats();
    }, 25000);

    // ✅ FIX: Emit events ONCE (was emitting after duplicate state assignment)
    this.emit('authenticated');
    this.emit('ready');
    logger.info('[WhatsApp] Ready — bot is active and listening for messages');
  }

  /**
   * ✅ NUEVO: Cargar chats históricos desde WhatsApp
   * Se ejecuta automáticamente después de conectar
   */
  async _loadHistoricalChats() {
    if (!this.sock || !this.isReady) {
      logger.warn('⚠️ No se pueden cargar chats: WhatsApp no está listo');
      return;
    }

    try {
      logger.info('📂 Cargando chats históricos desde WhatsApp...');

      let chats = null;
      let source = '';

      // MÉTODO 1: Intentar obtener desde this.sock.chats
      if (this.sock.chats && Object.keys(this.sock.chats).length > 0) {
        chats = this.sock.chats;
        source = 'sock.chats';
        logger.info(`📂 Chats encontrados en sock.chats: ${Object.keys(chats).length}`);
      }

      // MÉTODO 2: Intentar usar fetchChats si existe
      if (!chats && typeof this.sock.fetchChats === 'function') {
        try {
          logger.info('📂 Intentando fetchChats()...');
          const fetchedChats = await this.sock.fetchChats(undefined, true);
          if (fetchedChats && fetchedChats.length > 0) {
            // Convertir array a Map para procesamiento uniforme
            chats = {};
            for (const chat of fetchedChats) {
              chats[chat.id] = chat;
            }
            source = 'fetchChats()';
            logger.info(`📂 Chats obtenidos via fetchChats(): ${fetchedChats.length}`);
          }
        } catch (e) {
          logger.debug(`fetchChats() falló: ${e.message}`);
        }
      }

      if (!chats || Object.keys(chats).length === 0) {
        logger.warn('⚠️ No se encontraron chats en la sesión de WhatsApp');
        logger.info('💡 Los chats se cargarán automáticamente cuando lleguen nuevos mensajes');
        return;
      }

      let importedCount = 0;
      let updatedCount = 0;

      for (const [chatId, chatData] of Object.entries(chats)) {
        // Process individual chats AND group chats (for dashboard)
        if (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us')) {
          continue;
        }

        const phoneNumber = chatId.includes('@g.us') ? chatId.replace('@g.us', '') : chatId.replace('@s.whatsapp.net', '');
        const chatName = chatData.name || chatData.notify || null;

        const existingConv = conversationStateService.getConversation(chatId);

        if (!existingConv) {
          conversationStateService.getOrCreateConversation(chatId, {
            whatsappName: chatName,
            realPhoneNumber: phoneNumber
          });
          importedCount++;
          logger.debug(`📂 Chat importado: ${phoneNumber} (${chatName || 'Sin nombre'})`);
        } else {
          // Actualizar nombre si no existe
          if (chatName && !existingConv.whatsappName) {
            existingConv.whatsappName = chatName;
            existingConv.whatsappNameUpdatedAt = Date.now();
            updatedCount++;
          }
        }
      }

      logger.info(`✅ Importación de chats completada (${source}): ${importedCount} nuevos, ${updatedCount} actualizados`);

      // Los chats ya se persistieron individualmente via getOrCreateConversation -> persistConversation
      if (importedCount > 0 || updatedCount > 0) {
        logger.info(`✅ Chats históricos ya persistidos individualmente (${importedCount} nuevos, ${updatedCount} actualizados)`);
      }

    } catch (error) {
      logger.error('Error cargando chats históricos:', error);
    }
  }

  /**
   * Resuelve un LID (@lid) al JID de teléfono (@s.whatsapp.net) correspondiente.
   * Esto evita que el mismo contacto aparezca como dos chats diferentes.
   *
   * Orden de resolución:
   * 1. remoteJidAlt del mensaje (Baileys v7+)
   * 2. Mapa interno lidToPhone (construido de contacts.upsert/update)
   * 3. Sin resolver (mantiene LID como fallback)
   *
   * @param {string} jid - El JID a resolver
   * @param {Object} msg - El mensaje original de Baileys (para acceder a remoteJidAlt)
   * @returns {string} JID resuelto (teléfono si fue posible, LID si no)
   */
  _resolveLid(jid, msg = null) {
    if (!jid || !jid.endsWith('@lid')) return jid;

    // 1. remoteJidAlt del mensaje (más confiable)
    const alt = msg?.key?.remoteJidAlt;
    if (alt && alt.endsWith('@s.whatsapp.net')) {
      if (!this.lidToPhone.has(jid)) {
        logger.info(`🔄 [LID→PN] Resuelto vía remoteJidAlt: ${jid} → ${alt}`);
      }
      this.lidToPhone.set(jid, alt);
      return alt;
    }

    // 2. Mapa interno
    if (this.lidToPhone.has(jid)) {
      const resolved = this.lidToPhone.get(jid);
      logger.debug(`🔄 [LID→PN] Resuelto vía mapa: ${jid} → ${resolved}`);
      return resolved;
    }

    // 3. Sin resolver — mantener LID como identificador
    logger.debug(`⚠️ [LID] No se pudo resolver ${jid} a número de teléfono`);
    return jid;
  }

  /**
   * Maneja mensajes entrantes
   */
  async _handleMessages(m) {
    try {
      if (m.type !== 'notify') return;

      const msg = m.messages[0];
      if (!msg || !msg.message) return;

      // ✅ NUEVO: Ignorar mensajes de protocolo (HISTORY_SYNC, etc.)
      if (msg.message.protocolMessage) {
        logger.debug('📨 Mensaje de protocolo ignorado (HISTORY_SYNC)');
        return;
      }

      // ✅ Verificar que el mensaje tenga la estructura mínima necesaria
      if (!msg.key || !msg.key.remoteJid) {
        logger.debug('📨 Mensaje sin remoteJid, ignorando...');
        return;
      }

      // Mensajes propios (fromMe=true): capturar los enviados manualmente desde el celular
      // IMPORTANTE: No se activa lógica de bot, solo se guarda para el historial del dashboard
      if (msg.key.fromMe) {
        await this._handleOutgoingMessage(msg);
        return;
      }

      // Ignorar mensajes de broadcast
      if (msg.key.remoteJid === 'status@broadcast') return;

      // ✅ LOG CRÍTICO ANTES DE TRANSFORMAR
      logger.info(`📨 [RAW MESSAGE] remoteJid="${msg.key.remoteJid}", hasConversation=${!!msg.message.conversation}`);

      // Transformar mensaje al formato esperado por server.js
      const transformedMessage = this._transformMessage(msg);

      if (!transformedMessage) {
        logger.error('❌ [HANDLE] _transformMessage retornó NULL');
        return;
      }

      if (!transformedMessage.from) {
        logger.error('❌ [HANDLE] Mensaje transformado SIN "from"');

        // Escribir a archivo para debug seguro
        try {
          fs.writeFileSync('debug_message.json', JSON.stringify({
            key: msg.key,
            message: msg.message,
            full: msg,
            transformed: transformedMessage
          }, null, 2));
          logger.error('❌ Estructura del mensaje guardada en debug_message.json');
        } catch (e) {
          logger.error('Error escribiendo debug_message.json', e);
        }

        return;
      }

      // ✅ LOG ANTES DE EMITIR
      logger.info(`🚀 [EMIT] Emitiendo evento 'message': from="${transformedMessage.from}", body="${transformedMessage.body?.substring(0, 30)}"`);
      this.emit('message', transformedMessage);

    } catch (error) {
      logger.error('❌ [HANDLE] Error procesando mensaje:', error);
    }
  }

  /**
   * Captura mensajes enviados desde el celular físico (fromMe=true).
   * Solo extrae el texto y emite un evento 'outgoing-message' separado.
   * NO activa la lógica del bot, NO genera respuestas automáticas.
   */
  async _handleOutgoingMessage(msg) {
    try {
      let remoteJid = msg.key?.remoteJid;

      // Only process individual chats, LID chats, and group chats
      if (!remoteJid) return;
      if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid') && !remoteJid.endsWith('@g.us')) return;
      if (remoteJid === 'status@broadcast') return;

      // ✅ Resolver LID a número de teléfono para evitar chats duplicados
      remoteJid = this._resolveLid(remoteJid, msg);

      // Extraer texto del mensaje (puede estar vacío para multimedia)
      const body = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        '';

      // Detectar tipo de multimedia
      const isImage = !!msg.message?.imageMessage;
      const isVideo = !!msg.message?.videoMessage;
      const isAudio = !!msg.message?.audioMessage || !!msg.message?.pttMessage;
      const isDocument = !!msg.message?.documentMessage;
      const isMultimedia = isImage || isVideo || isAudio || isDocument;

      // Solo descartar si no hay texto NI multimedia
      if ((!body || body.trim() === '') && !isMultimedia) return;

      // Para multimedia sin texto, generar etiqueta descriptiva
      let displayBody = body;
      let mediaType = 'text';
      if (!displayBody || displayBody.trim() === '') {
        if (isImage) { displayBody = '[Imagen enviada]'; mediaType = 'image'; }
        else if (isVideo) { displayBody = '[Video enviado]'; mediaType = 'video'; }
        else if (isAudio) { displayBody = '[Audio enviado]'; mediaType = 'audio'; }
        else if (isDocument) { displayBody = '[Documento enviado]'; mediaType = 'document'; }
      }

      const messageId = msg.key.id;

      logger.info(`📤 [OUTGOING] Mensaje desde celular capturado → ${remoteJid}: "${displayBody.substring(0, 60)}" (tipo: ${mediaType})`);

      // Emitir evento separado — server.js lo escucha para guardar sin activar bot
      // Se incluye el objeto original del mensaje para que server.js pueda descargar multimedia
      this.emit('outgoing-message', {
        to: remoteJid,
        body: displayBody,
        id: messageId,
        timestamp: msg.messageTimestamp || Date.now(),
        mediaType: mediaType,
        // Include the full Baileys message so server.js can call saveMediaFromMessage for media
        originalMsg: isMultimedia ? { ...msg, _original: msg } : null
      });
    } catch (err) {
      logger.error('❌ Error capturando mensaje saliente desde celular:', err.message);
    }
  }

  /**
   * Transforma mensaje de Baileys al formato esperado
   * (compatible con web.provider.js)
   */
  _transformMessage(msg) {
    // ✅ Validar estructura mínima del mensaje
    if (!msg || !msg.key) {
      logger.warn('❌ MSG o MSG.KEY FALTANTE');
      return null;
    }

    // Extraer remoteJid - este es el campo crítico
    let from = msg.key.remoteJid;

    // ✅ Resolver LID a número de teléfono para evitar chats duplicados
    from = this._resolveLid(from, msg);

    logger.info(`📨 [TRANSFORM] remoteJid="${from}", fromMe=${msg.key.fromMe}`);

    if (!from) {
      logger.error('❌ remoteJid es vacío, intentando participant...');
      if (msg.key.participant) {
        from = msg.key.participant;
        logger.info(`✅ Recuperado from de participant: ${from}`);
      } else {
        logger.error('❌ Imposible recuperar from - RETORNANDO NULL');
        return null;
      }
    }

    const body = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.documentMessage?.caption ||
      '';

    let type = 'chat';
    if (msg.message?.imageMessage) type = 'image';
    else if (msg.message?.videoMessage) type = 'video';
    else if (msg.message?.audioMessage || msg.message?.pttMessage) type = 'audio';
    else if (msg.message?.documentMessage) type = 'document';
    else if (msg.message?.buttonsResponseMessage) type = 'button_response';

    // ✅ Extraer pushName del mensaje o del objeto completo
    let pushName = msg.pushName || null;

    if (!pushName) {
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (contextInfo?.participant) {
        pushName = contextInfo.participant.split('@')[0] || null;
      } else if (msg.message?.contactMessage?.displayName) {
        pushName = msg.message.contactMessage.displayName;
      } else if (msg.key?.participant) {
        pushName = msg.key.participant.split('@')[0] || null;
      }
    }

    // Limpiar el nombre
    if (pushName) {
      pushName = String(pushName).trim();
      if (/^\d+$/.test(pushName) || pushName === '') {
        pushName = null;
      }
    }

    const result = {
      from: from,
      to: msg.key.toJid || null,
      body: body,
      type: type,
      fromMe: msg.key.fromMe || false,
      id: msg.key.id,
      timestamp: msg.messageTimestamp || Date.now(),
      hasMedia: !!(
        msg.message?.imageMessage ||
        msg.message?.videoMessage ||
        msg.message?.audioMessage ||
        msg.message?.documentMessage
      ),
      pushName: pushName,
      _original: msg,
      message: msg.message
    };

    logger.info(`✅ [TRANSFORM] Mensaje transformado: from=${result.from}, body="${body.substring(0, 30)}"`);

    return result;
  }

  /**
   * Envía un mensaje de texto
   * @param {string} to - Destinatario (número o JID)
   * @param {string|object} content - Texto o objeto con contenido
   * @param {object} options - Opciones adicionales (ej: quoted)
   */
  async sendMessage(to, content, options = {}) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      // Formatear número si es necesario
      const chatId = this._formatNumber(to);
      const sendOptions = {};

      // ✅ SOPORTE PARA REPLY (QUOTED)
      if (options.quoted) {
        sendOptions.quoted = options.quoted;
      }

      // Si content es un string, enviar como texto simple
      if (typeof content === 'string') {
        const result = await this.sock.sendMessage(chatId, { text: content }, sendOptions);
        logger.debug(`Mensaje enviado a ${to}`);
        return result;
      }

      // Si es un objeto con botones, enviar mensaje con botones
      if (content.buttons && Array.isArray(content.buttons)) {
        // Formatear botones para Baileys
        const formattedButtons = content.buttons.map(btn => ({
          buttonId: btn.buttonId,
          buttonText: { displayText: btn.buttonText },
          type: btn.type || 1
        }));

        const result = await this.sock.sendMessage(chatId, {
          text: content.text,
          buttons: formattedButtons
        }, sendOptions);

        logger.debug(`Mensaje con botones enviado a ${to}`);
        return result;
      }

      // Si es un objeto con text, enviar como texto
      if (content.text) {
        const result = await this.sock.sendMessage(chatId, { text: content.text }, sendOptions);
        logger.debug(`Mensaje enviado a ${to}`);
        return result;
      }

      // Fallback: intentar enviar directamente
      const result = await this.sock.sendMessage(chatId, content, sendOptions);
      logger.debug(`Mensaje enviado a ${to}`);
      return result;

    } catch (error) {
      logger.error('Error enviando mensaje:', error);
      throw error;
    }
  }

  /**
   * ✅ Sends a "composing" (typing) presence indicator to a user.
   * The recipient will see "escribiendo..." in their WhatsApp client.
   * @param {string} to - Recipient number or JID
   */
  async sendTyping(to) {
    if (!this.isReady || !this.sock) {
      logger.warn(`⌨️ Cannot send typing: WhatsApp not ready`);
      return;
    }
    try {
      const chatId = this._formatNumber(to);
      await this.sock.presenceSubscribe(chatId);
      await this.sock.sendPresenceUpdate('composing', chatId);
      logger.info(`⌨️ Typing indicator sent to ${to}`);
    } catch (err) {
      // Non-critical — never break the message flow for a typing indicator
      logger.warn(`⚠️ Could not send typing indicator to ${to}: ${err.message}`);
    }
  }

  /**
   * ✅ Clears the typing indicator (sets presence to "paused").
   * @param {string} to - Recipient number or JID
   */
  async clearTyping(to) {
    if (!this.isReady || !this.sock) return;
    try {
      const chatId = this._formatNumber(to);
      await this.sock.sendPresenceUpdate('paused', chatId);
    } catch (err) {
      logger.debug(`⚠️ Could not clear typing indicator: ${err.message}`);
    }
  }

  /**
   * Envía una imagen
   * ✅ FIX: Incluye mimetype explícito detectado por magic bytes
   */
  async sendImage(to, imagePath, caption = '') {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      const chatId = this._formatNumber(to);

      // Read image as buffer
      const imageBuffer = fs.readFileSync(imagePath);

      // ✅ Validate buffer is not empty
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error(`Buffer vacío para imagen: ${imagePath}`);
      }

      // ✅ Detect mimetype from magic bytes (header)
      const header = imageBuffer.slice(0, 4).toString('hex');
      let mimetype = 'image/jpeg'; // Default fallback
      if (header.startsWith('ffd8')) mimetype = 'image/jpeg';
      else if (header.startsWith('8950')) mimetype = 'image/png';
      else if (header.startsWith('4749')) mimetype = 'image/gif';
      else if (header.startsWith('5249')) mimetype = 'image/webp';

      logger.info(`🖼️ [SEND-IMAGE] to=${to}, path=${imagePath}, size=${imageBuffer.length} bytes, mimetype=${mimetype}, caption="${(caption || '').substring(0, 40)}"`);

      // ✅ FIX: Send with explicit mimetype — required by Baileys for CDN upload
      const result = await this.sock.sendMessage(
        chatId,
        {
          image: imageBuffer,
          mimetype: mimetype,
          caption: caption
        }
      );

      logger.info(`✅ [SEND-IMAGE] Imagen enviada a ${to}, msgId=${result?.key?.id}, status=${result?.status}`);
      return result;
    } catch (error) {
      logger.error(`❌ [SEND-IMAGE] Error enviando imagen a ${to}:`, error);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Envía un audio
   * Soporta: mp3, ogg, wav, webm
   */
  async sendAudio(to, audioPath) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    let finalAudioPath = audioPath;
    let needsCleanup = false;

    try {
      const chatId = this._formatNumber(to);
      const ext = path.extname(audioPath).toLowerCase();

      // ✅ CONVERSIÓN FFMPEG: Garantizar OGG/Opus para móviles
      // WhatsApp móvil es muy estricto con el formato de notas de voz.
      // WebM (Chrome) y OGG (Firefox) a veces no tienen los codecs exactos.
      if (ext === '.webm' || ext === '.ogg' || ext === '.mp3' || ext === '.wav' || ext === '.m4a') {
        const outputPath = path.join(path.dirname(audioPath), `converted_${Date.now()}.ogg`);

        logger.info(`🔄 Convirtiendo audio ${ext} a OGG/Opus para compatibilidad móvil...`);

        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .audioCodec('libopus')
            .toFormat('ogg')
            .addOutputOption('-avoid_negative_ts make_zero') // Fix timestamps
            .on('end', () => resolve(true))
            .on('error', (err) => {
              logger.error('Error conversión ffmpeg:', err);
              reject(err);
            })
            .save(outputPath);
        });

        finalAudioPath = outputPath;
        needsCleanup = true;
        logger.info(`✅ Audio convertido: ${finalAudioPath}`);
      }

      // Leer audio final
      const audioBuffer = fs.readFileSync(finalAudioPath);

      // Enviar audio
      const result = await this.sock.sendMessage(
        chatId,
        {
          audio: audioBuffer,
          mimetype: 'audio/ogg; codecs=opus', // Siempre enviar como OGG/Opus
          ptt: true
        }
      );

      logger.info(`✅ Audio enviado a ${to} (OGG/Opus, ptt=true)`);

      // Limpiar archivo temporal
      if (needsCleanup && fs.existsSync(finalAudioPath)) {
        fs.unlinkSync(finalAudioPath);
      }

      return result;
    } catch (error) {
      logger.error('Error enviando audio:', error);
      // Limpiar archivo temporal en caso de error
      if (needsCleanup && finalAudioPath && fs.existsSync(finalAudioPath)) {
        try { fs.unlinkSync(finalAudioPath); } catch (e) { }
      }
      throw error;
    }
  }

  /**
   * Envía un documento
   */
  async sendDocument(to, filePath, filename, caption = '') {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      const chatId = this._formatNumber(to);

      // Read document as buffer
      const docBuffer = fs.readFileSync(filePath);

      // ✅ Validate buffer is not empty
      if (!docBuffer || docBuffer.length === 0) {
        throw new Error(`Buffer vacío para documento: ${filePath}`);
      }

      // Determine mimetype from extension
      const ext = path.extname(filePath).toLowerCase();
      const mimetype = this._getMimeType(ext);

      logger.info(`📄 [SEND-DOC] to=${to}, path=${filePath}, size=${docBuffer.length} bytes, mimetype=${mimetype}, caption="${caption}"`);

      // Send document
      const result = await this.sock.sendMessage(
        chatId,
        {
          document: docBuffer,
          mimetype: mimetype,
          filename: filename || path.basename(filePath),
          caption: caption || ''
        }
      );

      logger.info(`✅ [SEND-DOC] Documento enviado a ${to}, msgId=${result?.key?.id}`);
      return result;
    } catch (error) {
      logger.error(`❌ [SEND-DOC] Error enviando documento a ${to}:`, error);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Envía un video
   * Soporta: mp4, 3gp
   */
  async sendVideo(to, videoPath, caption = '') {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      const chatId = this._formatNumber(to);

      // Read video as buffer
      const videoBuffer = fs.readFileSync(videoPath);

      // ✅ Validate buffer is not empty
      if (!videoBuffer || videoBuffer.length === 0) {
        throw new Error(`Buffer vacío para video: ${videoPath}`);
      }

      // ✅ Detect mimetype from extension
      const ext = path.extname(videoPath).toLowerCase();
      let mimetype = 'video/mp4'; // Default
      if (ext === '.3gp') mimetype = 'video/3gpp';
      else if (ext === '.webm') mimetype = 'video/webm';
      else if (ext === '.mov') mimetype = 'video/quicktime';

      logger.info(`🎬 [SEND-VIDEO] to=${to}, path=${videoPath}, size=${videoBuffer.length} bytes, mimetype=${mimetype}`);

      // ✅ FIX: Send with explicit mimetype
      const result = await this.sock.sendMessage(
        chatId,
        {
          video: videoBuffer,
          mimetype: mimetype,
          caption: caption
        }
      );

      logger.info(`✅ [SEND-VIDEO] Video enviado a ${to}, msgId=${result?.key?.id}`);
      return result;
    } catch (error) {
      logger.error(`❌ [SEND-VIDEO] Error enviando video a ${to}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene el mimetype basado en la extensión
   */
  _getMimeType(ext) {
    const mimes = {
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      // Audio
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.m4a': 'audio/mp4',
      // Video
      '.mp4': 'video/mp4',
      '.3gp': 'video/3gpp'
    };
    return mimes[ext] || 'application/octet-stream';
  }

  /**
   * Formatea el número para WhatsApp
   */
  _formatNumber(number) {
    // Si ya tiene @s.whatsapp.net o @g.us, retornar tal cual
    if (number.includes('@')) {
      return number;
    }

    // Agregar sufijo de WhatsApp
    return `${number}@s.whatsapp.net`;
  }

  /**
   * Obtiene el cliente de WhatsApp directamente
   */
  getClient() {
    return this.sock;
  }

  /**
   * Obtiene el estado actual
   */
  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      hasQR: !!this.qrCode,
      miNumero: this.miNumero,
      miNombre: this.miNombre
    };
  }

  /**
   * Obtiene el código QR actual
   */
  getQRCode() {
    return this.qrCode;
  }

  /**
   * Cierra la conexión
   */
  async destroy() {
    if (this.sock) {
      try {
        // ✅ FIX: Do NOT call logout() here — that deletes the WhatsApp session
        // from baileys_auth/ and forces a new QR scan on next start.
        // We only want to close the socket cleanly so the session is preserved.
        // For explicit user-requested logout, use the logout() method instead.
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (e) {
        logger.warn('Error cerrando socket:', e.message);
      }
    }

    // ✅ NUEVO: Cancelar todos los temporizadores
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    this.isReady = false;
    this.isConnecting = false;
    this.status = 'disconnected';
    this.qrCode = null;
    this.miNumero = null;
    this.miLid = null;
    this.miNombre = null;
    this.qrEmitted = false;  // 🔑 Resetear flag
    this.authFailureCount = 0; // ✅ FIX: Reset on explicit destroy/logout

    logger.info('Conexión de Baileys cerrada');
  }

  /**
   * ✅ FIX: Reset auth failure counter so the user can request a new QR manually
   * Call this before calling initialize() from the dashboard/server
   */
  resetAuthFailures() {
    this.authFailureCount = 0;
    logger.info('🔄 Contador de fallos de autenticación reseteado');
  }

  /**
   * Cierra sesión (borra autenticación)
   */
  async logout() {
    await this.destroy();

    // Eliminar archivos de sesión
    if (fs.existsSync(this.authPath)) {
      fs.rmSync(this.authPath, { recursive: true, force: true });
      logger.info('Sesión de Baileys eliminada');
    }
  }

  // ===========================================
  // ✅ NUEVO: OBTENER CHATS DESDE WHATSAPP
  // ===========================================

  /**
   * Obtiene chats desde WhatsApp con límite
   * @param {number} limit - Cantidad de chats a obtener (default: 20)
   * @returns {Promise<Array>} Lista de chats
   */
  async fetchChats(limit = 20) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      logger.info(`📱 Obteniendo ${limit} chats desde WhatsApp...`);

      // Obtener chats desde el almacenamiento local (se llena con eventos)
      let allChats = Array.from(this.localChats.values());

      // Si localChats está vacío, intentar con sock.chats
      if (allChats.length === 0 && this.sock.chats) {
        const chatsMap = this.sock.chats;
        allChats = Object.values(chatsMap);
      }

      logger.info(`📱 Total de chats en almacenamiento local: ${allChats.length}`);

      // Ordenar por último mensaje (más recientes primero)
      const sortedChats = allChats.sort((a, b) => {
        const timeA = a.lastMessageRecvTimestamp || 0;
        const timeB = b.lastMessageRecvTimestamp || 0;
        return timeB - timeA;
      });

      // Aplicar límite
      const limitedChats = sortedChats.slice(0, limit);

      logger.info(`📱 Retornando ${limitedChats.length} chats`);

      // Transformar al formato que espera el dashboard
      return limitedChats.map(chat => this._transformChat(chat));
    } catch (error) {
      logger.error('Error obteniendo chats:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los chats desde WhatsApp
   * @returns {Promise<Array>} Lista de chats
   */
  async fetchAllChats() {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      // Obtener chats desde el almacenamiento local
      let allChats = Array.from(this.localChats.values());

      // Si localChats está vacío, intentar con sock.chats
      if (allChats.length === 0 && this.sock.chats) {
        const chatsMap = this.sock.chats;
        allChats = Object.values(chatsMap);
      }

      logger.info(`📱 Chats obtenidos desde almacenamiento local: ${allChats.length}`);

      // Transformar al formato que espera el dashboard
      return chats.map(chat => this._transformChat(chat));
    } catch (error) {
      logger.error('Error obteniendo chats:', error);
      throw error;
    }
  }

  /**
   * Obtiene mensajes de un chat específico
   * @param {string} jid - JID del chat (ej: 573001234567@s.whatsapp.net)
   * @param {number} limit - Cantidad de mensajes (default: 20)
   * @param {string} cursor - Cursor para paginación
   * @returns {Promise<Object>} Mensajes y metadata de paginación
   */
  async fetchChatMessages(jid, limit = 20, cursor = null) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }

    try {
      logger.info(`📜 Obteniendo mensajes para ${jid}...`);

      // Obtener mensajes desde this.sock.messages (si está disponible)
      let messages = [];

      if (this.sock.messages && this.sock.messages[jid]) {
        // Los mensajes están en un Map por chat
        const chatMessages = this.sock.messages[jid];
        messages = Object.values(chatMessages);
        logger.info(`📜 Mensajes encontrados en sock.messages[${jid}]: ${messages.length}`);
      } else if (typeof this.sock.fetchMessages === 'function') {
        // Fallback a fetchMessages si existe
        const options = { limit };
        if (cursor) {
          options.cursor = cursor;
        }
        messages = await this.sock.fetchMessages(jid, options);
        logger.info(`📜 Mensajes obtenidos via fetchMessages: ${messages.length}`);
      }

      // Ordenar por timestamp (más recientes primero)
      messages.sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));

      // Aplicar límite
      const limitedMessages = messages.slice(0, limit);

      logger.info(`📜 Retornando ${limitedMessages.length} mensajes para ${jid}`);

      // Transformar mensajes al formato del dashboard
      const transformedMessages = limitedMessages.map(msg => this._transformMessageForDashboard(msg, jid));

      // Determinar si hay más mensajes
      const hasMore = messages.length > limit;

      // Obtener cursor del último mensaje para siguiente página
      const nextCursor = limitedMessages.length > 0
        ? limitedMessages[limitedMessages.length - 1].key.id
        : null;

      return {
        messages: transformedMessages,
        hasMore: hasMore,
        nextCursor: nextCursor
      };
    } catch (error) {
      logger.error('Error obteniendo mensajes:', error);
      throw error;
    }
  }

  /**
   * Obtiene la foto de perfil de un contacto desde WhatsApp
   * @param {string} jid x  
   * @returns {Promise<string|null>}
   */
  async getProfilePictureUrl(jid) {
    if (!this.isReady || !this.sock) {
      return null;
    }
    try {
      // Baileys usa profilePictureUrl para obtener el avatar
      // el segundo param es 'image' o 'preview'
      const url = await this.sock.profilePictureUrl(jid, 'image');
      return url;
    } catch (error) {
      // Es normal que tire error si el usuario no tiene foto o la tiene privada.
      logger.debug(`No se pudo obtener foto de perfil para ${jid} (quizás privada o sin foto).`);
      return null;
    }
  }

  /**
   * Transforma un chat de Baileys al formato del dashboard
   */
  _transformChat(chat) {
    const jid = chat.id;
    const phoneNumber = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');

    // Obtener último mensaje
    let lastMessage = '';
    let lastMessageTime = Date.now();

    if (chat.messages && chat.messages.length > 0) {
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg.message) {
        const msgType = Object.keys(lastMsg.message)[0];
        if (msgType === 'conversation') {
          lastMessage = lastMsg.message.conversation;
        } else if (msgType === 'extendedTextMessage') {
          lastMessage = lastMsg.message.extendedTextMessage.text;
        } else if (msgType === 'imageMessage') {
          lastMessage = '[Foto]';
        } else if (msgType === 'audioMessage') {
          lastMessage = '[Audio]';
        } else if (msgType === 'videoMessage') {
          lastMessage = '[Video]';
        } else if (msgType === 'documentMessage') {
          lastMessage = `[${lastMsg.message.documentMessage.fileName || 'Documento'}]`;
        } else {
          lastMessage = `[${msgType}]`;
        }
        lastMessageTime = lastMsg.messageTimestamp * 1000;
      }
    }

    return {
      userId: jid,
      phoneNumber: phoneNumber,
      whatsappName: chat.name || chat.notify || null,
      registeredName: chat.name || chat.notify || null,  // Para compatibilidad con frontend
      lastMessage: lastMessage,
      lastInteraction: lastMessageTime,
      unreadCount: chat.unreadCount || 0,
      // Campos compatibles con el formato existente
      status: 'active',
      consentStatus: 'accepted',
      bot_active: true,
      messages: []
    };
  }

  /**
   * Transforma un mensaje de Baileys al formato del dashboard
   * (versión para mensajes históricos fetchChatMessages)
   */
  _transformMessageForDashboard(msg, jid) {
    const message = msg.message || {};
    const msgType = Object.keys(message)[0];

    let text = '';
    let type = 'text';
    let mediaUrl = null;
    let fileName = null;

    switch (msgType) {
      case 'conversation':
        text = message.conversation;
        type = 'text';
        break;
      case 'extendedTextMessage':
        text = message.extendedTextMessage.text;
        type = 'text';
        break;
      case 'imageMessage':
        text = message.imageMessage.caption || '[Foto]';
        type = 'image';
        // Nota: Para obtener la URL real habría que descargar el media
        break;
      case 'audioMessage':
        text = '[Audio]';
        type = 'audio';
        break;
      case 'videoMessage':
        text = message.videoMessage.caption || '[Video]';
        type = 'video';
        break;
      case 'documentMessage':
        text = `[${message.documentMessage.fileName || 'Documento'}]`;
        type = 'document';
        fileName = message.documentMessage.fileName;
        break;
      default:
        text = `[${msgType}]`;
        type = 'text';
    }

    // Determinar si es mensaje entrante o saliente
    const isFromMe = msg.key.fromMe;
    const sender = isFromMe ? 'admin' : 'user';

    return {
      id: msg.key.id,
      message: text,
      sender: sender,
      timestamp: (msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
      type: type,
      mediaUrl: mediaUrl,
      fileName: fileName
    };
  }
  /**
   * ✅ NUEVO: Publica un estado (historia) de WhatsApp via status@broadcast.
   *
   * Lo ven todos los contactos que tengan tu número guardado y cuya privacidad
   * lo permita — exactamente igual que publicar desde el celular.
   *
   * @param {object} opts
   * @param {'text'|'image'|'video'} opts.type
   * @param {string}  [opts.text]      - Required for type='text'
   * @param {string}  [opts.bgColor]   - Background hex color for text status
   * @param {Buffer}  [opts.fileBuffer]- Required for type='image' or 'video'
   * @param {string}  [opts.mimetype]  - e.g. 'image/jpeg', 'video/mp4'
   * @param {string}  [opts.caption]   - Optional caption for image/video
   */
  async postWhatsAppStatus({ type, text, bgColor, fileBuffer, mimetype, caption }) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado. Escanea el QR primero.');
    }

    const STATUS_JID = 'status@broadcast';

    // Build the JID list of who can see the status.
    const statusJidList = this._buildStatusJidList();
    logger.info(`📋 [WA-STATUS] Publicando para ${statusJidList.length} contacto(s)`);

    // ── KNOWN LIMITATION: Baileys v7 + status@broadcast ─────────────────
    // As of Baileys v7.0.0-rc.9, posting to status@broadcast is unreliable.
    // This is a KNOWN BUG tracked in multiple GitHub issues:
    //   - #1196, #2084, #2118, #2217 on WhiskeySockets/Baileys
    //
    // The server accepts the message (returns a msgId), but the status
    // never appears on the sender's phone. This affects ALL implementations
    // regardless of:
    //   - Session freshness (tested with brand-new QR scan)
    //   - Sender key management (tested clearing keys via API + filesystem)
    //   - Addressing mode (error 479 confirms 'pn' is rejected, 'lid' is
    //     required but still results in invisible statuses)
    //   - Signal session refresh (assertSessions with force=true)
    //
    // The implementation below is correct per the Baileys API. The feature
    // may start working when Baileys pushes a fix or WhatsApp server-side
    // changes allow it again. Monitor the GitHub issues for updates.

    // Use sendMessage which defaults to addressing_mode:'lid' (required by WhatsApp).
    // Error 479 confirmed that 'pn' mode is rejected for status broadcasts.
    const sendOptions = { statusJidList };

    try {
      let result;

      if (type === 'text') {
        if (!text || !text.trim()) throw new Error('El texto del estado no puede estar vacío');

        result = await this.sock.sendMessage(
          STATUS_JID,
          {
            text: text.trim(),
            backgroundColor: bgColor
              ? parseInt('0xFF' + bgColor.replace('#', ''), 16)
              : 0xFF075E54,
            font: 2,
          },
          sendOptions
        );
      } else if (type === 'image') {
        if (!fileBuffer) throw new Error('Se requiere el buffer de imagen');

        result = await this.sock.sendMessage(
          STATUS_JID,
          {
            image: fileBuffer,
            mimetype: mimetype || 'image/jpeg',
            caption: (caption || '').trim() || undefined,
          },
          sendOptions
        );
      } else if (type === 'video') {
        if (!fileBuffer) throw new Error('Se requiere el buffer de video');

        result = await this.sock.sendMessage(
          STATUS_JID,
          {
            video: fileBuffer,
            mimetype: mimetype || 'video/mp4',
            caption: (caption || '').trim() || undefined,
          },
          sendOptions
        );
      } else {
        throw new Error(`Tipo de estado no soportado: ${type}`);
      }

      logger.info(`✅ [WA-STATUS] Estado de ${type} publicado (msgId=${result?.key?.id}, status=${result?.status})`);

      // ✅ FIX: Log full result details for debugging
      logger.debug(`📋 [WA-STATUS] Result details: key=${JSON.stringify(result?.key)}, participant=${result?.participant}`);

      return result;

    } catch (error) {
      logger.error(`❌ [WA-STATUS] Error publicando estado de WhatsApp:`, error);
      // ✅ FIX: Log specific error details for Baileys issues
      if (error?.output?.statusCode) {
        logger.error(`❌ [WA-STATUS] Baileys error code: ${error.output.statusCode}`);
      }
      if (error?.data) {
        logger.error(`❌ [WA-STATUS] Error data:`, JSON.stringify(error.data));
      }
      throw error;
    }
  }

  /**
   * Builds the list of JIDs that will receive/see the WhatsApp status.
   * WhatsApp requires at least one JID (typically your own number) for the
   * status to appear on the phone. Without this, the message is accepted by
   * the server but never shown in the Status tab.
   *
   * @returns {string[]} Array of JIDs like ['573XXXXXXXXX@s.whatsapp.net', ...]
   */
  _buildStatusJidList() {
    const jids = new Set();

    // Always include own number so the status appears on the sender's phone.
    // IMPORTANT: Only use @s.whatsapp.net JIDs — Baileys passes these to
    // getUSyncDevices() which resolves them to LID device-lists internally.
    // Passing @lid JIDs directly causes a 400 error from WhatsApp's server.
    if (this.miNumero) {
      jids.add(`${this.miNumero}@s.whatsapp.net`);
    } else {
      logger.warn('⚠️ [WA-STATUS] miNumero is null — cannot add own JID to statusJidList');
    }

    // Add all known contacts from localChats (people who have chatted with the bot)
    for (const [jid] of this.localChats) {
      if (jid && jid.endsWith('@s.whatsapp.net')) {
        jids.add(jid);
      }
    }

    // Also add phone JIDs from the lidToPhone map (contacts discovered via LID)
    for (const phoneJid of this.lidToPhone.values()) {
      if (phoneJid && phoneJid.endsWith('@s.whatsapp.net')) {
        jids.add(phoneJid);
      }
    }

    // ✅ FIX: Fallback — pull contacts from Baileys internal store if localChats
    // is empty (common after server restart before any messages arrive).
    // The sock.store or sock.chats may have contacts from the initial sync.
    if (jids.size <= 1 && this.sock) {
      try {
        // Try sock.store.chats (if using makeInMemoryStore)
        const storeChats = this.sock.chats || this.sock.store?.chats;
        if (storeChats) {
          const entries = typeof storeChats.all === 'function'
            ? storeChats.all()
            : (typeof storeChats === 'object' ? Object.keys(storeChats) : []);

          for (const entry of entries) {
            const chatId = typeof entry === 'string' ? entry : entry?.id;
            if (chatId && chatId.endsWith('@s.whatsapp.net')) {
              jids.add(chatId);
            }
          }
          if (entries.length > 0) {
            logger.debug(`[WA-STATUS] Added ${entries.length} contacts from sock.chats/store fallback`);
          }
        }
      } catch (e) {
        logger.debug(`[WA-STATUS] Could not read sock.chats/store: ${e.message}`);
      }
    }

    const list = Array.from(jids);

    if (list.length === 0) {
      logger.warn('⚠️ [WA-STATUS] statusJidList VACÍO — el estado NO aparecerá en el celular. Asegúrate de que miNumero esté configurado.');
    } else if (list.length === 1) {
      logger.info(`📋 [WA-STATUS] statusJidList: ${list.length} contacto (solo tú) → ${list[0]}`);
      logger.info(`💡 [WA-STATUS] Nota: Con solo tu JID, el estado aparecerá en tu celular pero no será visible para otros contactos hasta que interactúen con el bot.`);
    } else {
      logger.info(`📋 [WA-STATUS] statusJidList: ${list.length} contacto(s) → ${list.slice(0, 5).join(', ')}${list.length > 5 ? ` ... y ${list.length - 5} más` : ''}`);
    }

    return list;
  }

  /**
   * Revokes (deletes) a previously published WhatsApp status.
   * Uses the MessageKey returned when the status was originally sent.
   *
   * @param {object} waMessageKey - { id, remoteJid, fromMe, participant }
   */
  async deleteWhatsAppStatus(waMessageKey) {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp no está conectado');
    }
    if (!waMessageKey?.id) {
      throw new Error('waMessageKey inválido — no se puede revocar el estado');
    }

    // Build the full key object Baileys expects for revocation
    const key = {
      remoteJid: waMessageKey.remoteJid || 'status@broadcast',
      fromMe: waMessageKey.fromMe ?? true,
      id: waMessageKey.id,
      participant: waMessageKey.participant || `${this.miNumero}@s.whatsapp.net`,
    };

    // statusJidList is required for the revocation to reach the same contacts
    const statusJidList = this._buildStatusJidList();

    await this.sock.sendMessage(
      'status@broadcast',
      { delete: key },
      { statusJidList, broadcast: true }
    );

    logger.info(`🗑️ [WA-STATUS] Estado revocado en WhatsApp (msgId=${key.id})`);
  }

}

// Export the class for multi-instance usage (SessionManager creates instances)
module.exports = BaileysProvider;
