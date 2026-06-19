/**
 * ===========================================
 * SERVICIO DE CONTROL ANTI-SPAM
 * ===========================================
 *
 * Detecta mensajes repetidos consecutivos del mismo usuario
 * para evitar consumo innecesario de tokens de IA.
 *
 * REGLAS:
 * - Si un usuario envía el mismo mensaje (o muy similar) 3+ veces seguidas:
 *   → Advertencia interna (log)
 * - Si lo envía 4+ veces seguidas:
 *   → NO se llama a la IA, NO se consumen tokens
 *   → Se desactiva la IA para ese número automáticamente
 *   → Se registra en el sistema de control de números
 * - El contador se reinicia cuando el usuario cambia de pregunta
 * - El bloqueo aplica SOLO a ese usuario específico
 *
 * PERSISTENCIA:
 * - Los bloqueos por spam se persisten en archivo JSON
 * - Sobreviven reinicios del servidor
 *
 * INTEGRACIÓN:
 * - Se integra con number-control.service.js para desactivar IA
 * - Se visualiza en el dashboard de Control de Números
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const timezone = require('../utils/timezone');

// ===========================================
// CONFIGURACIÓN
// ===========================================
const CONFIG = {
  WARNING_THRESHOLD: parseInt(process.env.SPAM_MAX_REPEATED, 10) || 3,
  BLOCK_THRESHOLD: (parseInt(process.env.SPAM_MAX_REPEATED, 10) || 3) + 1,
  SIMILARITY_THRESHOLD: parseFloat(process.env.SPAM_SIMILARITY_THRESHOLD) || 0.9,
  HISTORY_SIZE: parseInt(process.env.SPAM_HISTORY_SIZE, 10) || 10
};

// Archivo de persistencia para bloqueos por spam
const SPAM_BLOCKS_FILE = path.join(process.cwd(), 'data', 'spam-blocks.json');

// Almacenamiento en memoria: userId → estado de spam
const userSpamState = new Map();

// Registro de bloqueos persistentes: phoneNumber → datos del bloqueo
let spamBlocks = new Map();

// Referencia al servicio de control de números (se inyecta para evitar circular)
let numberControlService = null;

// ===========================================
// PERSISTENCIA EN ARCHIVO
// ===========================================

/**
 * Asegura que el directorio de datos exista
 */
function ensureDataDir() {
  const dataDir = path.dirname(SPAM_BLOCKS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info(`📁 Directorio de datos creado: ${dataDir}`);
  }
}

/**
 * Carga los bloqueos persistentes desde archivo
 */
function loadSpamBlocks() {
  try {
    ensureDataDir();
    if (fs.existsSync(SPAM_BLOCKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPAM_BLOCKS_FILE, 'utf8'));
      spamBlocks = new Map(Object.entries(data));
      logger.info(`📂 Cargados ${spamBlocks.size} bloqueos de spam desde archivo`);
    }
  } catch (error) {
    logger.warn(`⚠️ Error cargando bloqueos de spam: ${error.message}`);
    spamBlocks = new Map();
  }
}

/**
 * Guarda los bloqueos persistentes en archivo
 */
function saveSpamBlocks() {
  try {
    ensureDataDir();
    const data = Object.fromEntries(spamBlocks);
    fs.writeFileSync(SPAM_BLOCKS_FILE, JSON.stringify(data, null, 2), 'utf8');
    logger.debug(`💾 Bloqueos de spam guardados (${spamBlocks.size} registros)`);
  } catch (error) {
    logger.error(`❌ Error guardando bloqueos de spam: ${error.message}`);
  }
}

// Cargar al iniciar
loadSpamBlocks();

// ===========================================
// INYECCIÓN DE DEPENDENCIA
// ===========================================

/**
 * Inyecta el servicio de control de números (evita dependencia circular)
 * @param {Object} service - numberControlService
 */
function setNumberControlService(service) {
  numberControlService = service;
  logger.info('✅ numberControlService inyectado en spam-control');

  // Restaurar bloqueos persistentes en number-control
  restoreBlocksToNumberControl();
}

/**
 * Restaura los bloqueos persistentes en el servicio de control de números
 * Se ejecuta después de inyectar numberControlService
 */
function restoreBlocksToNumberControl() {
  if (!numberControlService) return;

  let restored = 0;
  for (const [phone, block] of spamBlocks) {
    if (block.active) {
      try {
        // Verificar si ya está registrado
        const existing = numberControlService.getControlledNumber(phone);
        if (!existing) {
          numberControlService.addControlledNumber({
            phoneNumber: phone,
            name: block.name || '',
            reason: `Spam repetitivo (${block.consecutiveCount} repeticiones)`,
            registeredBy: 'Sistema Anti-Spam'
          });
        } else if (existing.iaActive !== false) {
          numberControlService.updateIAStatus(phone, false, 'Sistema Anti-Spam');
        }
        restored++;
      } catch (e) {
        logger.warn(`⚠️ Error restaurando bloqueo para ${phone}: ${e.message}`);
      }
    }
  }

  if (restored > 0) {
    logger.info(`🔄 Restaurados ${restored} bloqueos de spam en number-control`);
  }
}

// ===========================================
// FUNCIONES DE NORMALIZACIÓN Y SIMILARIDAD
// ===========================================

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  if (str1.length < 2 || str2.length < 2) {
    return str1 === str2 ? 1.0 : 0.0;
  }

  const bigrams1 = new Set();
  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.substring(i, i + 2));
  }

  const bigrams2 = new Set();
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.substring(i, i + 2));
  }

  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) intersection++;
  }

  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

// ===========================================
// ESTADO POR USUARIO
// ===========================================

function getOrCreateState(userId) {
  if (!userSpamState.has(userId)) {
    userSpamState.set(userId, {
      messages: [],
      consecutiveCount: 0,
      lastNormalized: null,
      blocked: false,
      blockedAt: null,
      totalBlocked: 0
    });
  }
  return userSpamState.get(userId);
}

// ===========================================
// FUNCIÓN PRINCIPAL
// ===========================================

/**
 * Evalúa si un mensaje es spam repetitivo.
 * Si se detecta bloqueo, desactiva la IA automáticamente.
 *
 * @param {string} userId - ID del usuario (WhatsApp)
 * @param {string} message - Mensaje del usuario (texto original)
 * @param {Object} options - Opciones adicionales
 * @param {string} options.phoneNumber - Número normalizado (para persistencia)
 * @param {string} options.userName - Nombre del usuario (para registro)
 * @returns {Object} { isSpam, shouldBlock, consecutiveCount, similarity, reason, iaDeactivated }
 */
function evaluateMessage(userId, message, options = {}) {
  const state = getOrCreateState(userId);
  const normalized = normalizeText(message);

  if (!normalized) {
    return { isSpam: false, shouldBlock: false, consecutiveCount: 0, similarity: 0, reason: null, iaDeactivated: false };
  }

  // Calcular similaridad con el último mensaje
  let similarity = 0;
  if (state.lastNormalized) {
    similarity = calculateSimilarity(normalized, state.lastNormalized);
  }

  const isRepeated = similarity >= CONFIG.SIMILARITY_THRESHOLD;

  if (isRepeated) {
    state.consecutiveCount++;
  } else {
    state.consecutiveCount = 1;
    state.blocked = false;
    state.blockedAt = null;
  }

  state.lastNormalized = normalized;

  // Guardar en historial
  state.messages.push({
    normalized,
    original: message.substring(0, 100),
    timestamp: Date.now(),
    similarity
  });
  if (state.messages.length > CONFIG.HISTORY_SIZE) {
    state.messages.shift();
  }

  const result = {
    isSpam: false,
    shouldBlock: false,
    consecutiveCount: state.consecutiveCount,
    similarity: Math.round(similarity * 100) / 100,
    reason: null,
    iaDeactivated: false
  };

  // BLOQUEO (4+ repeticiones)
  if (state.consecutiveCount >= CONFIG.BLOCK_THRESHOLD) {
    result.isSpam = true;
    result.shouldBlock = true;
    result.reason = `Mensaje repetido ${state.consecutiveCount} veces consecutivas (similaridad: ${Math.round(similarity * 100)}%)`;

    state.blocked = true;
    state.blockedAt = state.blockedAt || Date.now();
    state.totalBlocked++;

    logger.warn(`🚫 SPAM BLOQUEADO para ${userId}: ${result.reason}`);
    logger.warn(`   Mensaje: "${message.substring(0, 80)}..."`);
    logger.warn(`   Total bloqueados: ${state.totalBlocked}`);

    // ✅ AUTO-DESACTIVAR IA en number-control
    const deactivated = autoDeactivateIA(userId, state, options);
    result.iaDeactivated = deactivated;

    return result;
  }

  // ADVERTENCIA (3 repeticiones)
  if (state.consecutiveCount >= CONFIG.WARNING_THRESHOLD) {
    result.isSpam = true;
    result.shouldBlock = false;
    result.reason = `Advertencia: mensaje repetido ${state.consecutiveCount} veces (similaridad: ${Math.round(similarity * 100)}%)`;

    logger.warn(`⚠️ SPAM ADVERTENCIA para ${userId}: ${result.reason}`);
    logger.warn(`   Próxima repetición será BLOQUEADA`);

    return result;
  }

  return result;
}

// ===========================================
// AUTO-DESACTIVACIÓN DE IA
// ===========================================

/**
 * Desactiva la IA automáticamente para un número por spam.
 * Registra en number-control y persiste en archivo.
 *
 * @param {string} userId - ID del usuario
 * @param {Object} state - Estado de spam actual
 * @param {Object} options - { phoneNumber, userName }
 * @returns {boolean} true si se desactivó exitosamente
 */
function autoDeactivateIA(userId, state, options = {}) {
  if (!numberControlService) {
    logger.warn(`⚠️ numberControlService no disponible - no se puede desactivar IA automáticamente`);
    return false;
  }

  try {
    const phoneNumber = options.phoneNumber || userId;
    const userName = options.userName || '';
    const now = timezone.now();

    // Registrar en number-control
    const existing = numberControlService.getControlledNumber(phoneNumber);

    if (existing) {
      // Actualizar registro existente
      numberControlService.updateControlledNumber(phoneNumber, {
        iaActive: false,
        reason: `Spam repetitivo (${state.consecutiveCount} repeticiones)`,
        updatedBy: 'Sistema Anti-Spam'
      });
    } else {
      // Crear nuevo registro
      numberControlService.addControlledNumber({
        phoneNumber,
        name: userName,
        reason: `Spam repetitivo (${state.consecutiveCount} repeticiones)`,
        registeredBy: 'Sistema Anti-Spam'
      });
    }

    // Persistir bloqueo en archivo
    const blockRecord = {
      phoneNumber,
      userId,
      name: userName,
      reason: `Spam repetitivo (${state.consecutiveCount} repeticiones)`,
      consecutiveCount: state.consecutiveCount,
      blockedAt: Date.now(),
      blockedAtFormatted: `${now.dateString} ${now.timeString}`,
      timezone: now.timezone,
      totalBlockedMessages: state.totalBlocked,
      lastMessage: state.messages.length > 0 ? state.messages[state.messages.length - 1].original : '',
      active: true,
      reactivatedAt: null,
      reactivatedBy: null
    };

    spamBlocks.set(phoneNumber, blockRecord);
    saveSpamBlocks();

    logger.warn(`🔴 IA DESACTIVADA AUTOMÁTICAMENTE por spam para ${phoneNumber}`);
    logger.warn(`   Repeticiones: ${state.consecutiveCount}`);
    logger.warn(`   Fecha: ${blockRecord.blockedAtFormatted} (${now.timezone})`);

    return true;
  } catch (error) {
    logger.error(`❌ Error desactivando IA por spam: ${error.message}`);
    return false;
  }
}

// ===========================================
// REACTIVACIÓN
// ===========================================

/**
 * Reactiva la IA para un número bloqueado por spam.
 * Limpia el estado de spam y actualiza number-control.
 *
 * @param {string} phoneNumber - Número de teléfono
 * @param {string} reactivatedBy - Quién reactiva (nombre del admin)
 * @returns {Object} Resultado de la reactivación
 */
function reactivateFromSpam(phoneNumber, reactivatedBy = 'Admin') {
  const now = timezone.now();

  // 1. Actualizar bloqueo persistente
  if (spamBlocks.has(phoneNumber)) {
    const block = spamBlocks.get(phoneNumber);
    block.active = false;
    block.reactivatedAt = Date.now();
    block.reactivatedAtFormatted = `${now.dateString} ${now.timeString}`;
    block.reactivatedBy = reactivatedBy;
    saveSpamBlocks();
  }

  // 2. Reiniciar estado en memoria para todos los userIds asociados
  for (const [userId, state] of userSpamState) {
    // Buscar por phoneNumber en el userId
    if (userId.includes(phoneNumber) || userId === phoneNumber) {
      state.consecutiveCount = 0;
      state.blocked = false;
      state.blockedAt = null;
      state.lastNormalized = null;
      logger.info(`✅ Estado anti-spam reiniciado para ${userId}`);
    }
  }

  // 3. Reactivar en number-control
  if (numberControlService) {
    const record = numberControlService.getControlledNumber(phoneNumber);
    if (record) {
      numberControlService.updateControlledNumber(phoneNumber, {
        iaActive: true,
        reason: '',
        updatedBy: reactivatedBy
      });
    }
  }

  logger.info(`🟢 IA REACTIVADA para ${phoneNumber} por ${reactivatedBy}`);
  logger.info(`   Fecha: ${now.dateString} ${now.timeString} (${now.timezone})`);

  return {
    success: true,
    phoneNumber,
    reactivatedBy,
    reactivatedAt: `${now.dateString} ${now.timeString}`,
    message: `IA reactivada exitosamente para ${phoneNumber}`
  };
}

// ===========================================
// CONSULTAS
// ===========================================

/**
 * Reinicia el estado de spam de un usuario (sin afectar bloqueo persistente).
 */
function resetUserState(userId) {
  if (userSpamState.has(userId)) {
    userSpamState.delete(userId);
    logger.info(`✅ Estado anti-spam reiniciado para ${userId}`);
  }
}

function getUserState(userId) {
  return userSpamState.get(userId) || null;
}

/**
 * Obtiene todos los bloqueos por spam (activos e históricos).
 *
 * @param {boolean} onlyActive - Si true, solo devuelve bloqueos activos
 * @returns {Array} Lista de bloqueos
 */
function getSpamBlocks(onlyActive = false) {
  const blocks = Array.from(spamBlocks.values());
  if (onlyActive) {
    return blocks.filter(b => b.active);
  }
  return blocks.sort((a, b) => b.blockedAt - a.blockedAt);
}

/**
 * Verifica si un número está bloqueado por spam.
 *
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Object|null} Datos del bloqueo o null
 */
function getSpamBlock(phoneNumber) {
  return spamBlocks.get(phoneNumber) || null;
}

/**
 * Verifica si un número está activamente bloqueado por spam.
 *
 * @param {string} phoneNumber - Número de teléfono
 * @returns {boolean}
 */
function isBlockedBySpam(phoneNumber) {
  const block = spamBlocks.get(phoneNumber);
  return block ? block.active : false;
}

function getStats() {
  let totalUsers = userSpamState.size;
  let blockedUsers = 0;
  let totalBlockedMessages = 0;

  for (const [, state] of userSpamState) {
    if (state.blocked) blockedUsers++;
    totalBlockedMessages += state.totalBlocked;
  }

  const activeBlocks = Array.from(spamBlocks.values()).filter(b => b.active).length;
  const historicalBlocks = spamBlocks.size;

  return {
    totalTrackedUsers: totalUsers,
    currentlyBlocked: blockedUsers,
    totalBlockedMessages,
    activeSpamBlocks: activeBlocks,
    historicalSpamBlocks: historicalBlocks,
    config: {
      warningThreshold: CONFIG.WARNING_THRESHOLD,
      blockThreshold: CONFIG.BLOCK_THRESHOLD,
      similarityThreshold: CONFIG.SIMILARITY_THRESHOLD,
      historySize: CONFIG.HISTORY_SIZE
    }
  };
}

function isBlocked(userId) {
  const state = userSpamState.get(userId);
  return state ? state.blocked : false;
}

module.exports = {
  evaluateMessage,
  resetUserState,
  getUserState,
  getStats,
  isBlocked,
  normalizeText,
  calculateSimilarity,
  // Nuevas funciones
  setNumberControlService,
  reactivateFromSpam,
  getSpamBlocks,
  getSpamBlock,
  isBlockedBySpam
};
