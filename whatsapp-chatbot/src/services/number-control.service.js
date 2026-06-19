/**
 * ===========================================
 * SERVICIO DE CONTROL DE NÚMEROS
 * ===========================================
 *
 * Gestiona números a los que la IA NO debe responder.
 *
 * IMPORTANTE:
 * - No es un bloqueo total del número
 * - El número puede seguir escribiendo
 * - Solo se bloquea la respuesta automática de la IA
 */

const logger = require('../utils/logger');

/**
 * Estructura de datos por número controlado:
 *
 * {
 *   phoneNumber: "573503267342",
 *   name: "Juan Pérez",              // Opcional
 *   reason: "Cliente VIP",           // Motivo (opcional, informativo)
 *   iaActive: false,                 // false = IA desactivada para este número
 *   registeredAt: 1706544000000,     // Timestamp de registro
 *   registeredBy: "Asesor 1",        // Quién lo registró (opcional)
 *   updatedAt: 1706547600000,        // Última actualización
 *   updatedBy: null                  // Quién actualizó
 * }
 */

// Almacenamiento en memoria (puede migrarse a DB después)
const controlledNumbers = new Map();

/**
 * Normaliza un número de teléfono para búsqueda consistente
 * Elimina prefijos de país, espacios, guiones, etc.
 *
 * @param {string} phoneNumber - Número en cualquier formato
 * @returns {string} Número normalizado (solo dígitos, sin código de país)
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';

  let normalized = String(phoneNumber).trim();

  // Eliminar sufijos de WhatsApp
  normalized = normalized.replace(/@lid$/, '');
  normalized = normalized.replace(/@s\.whatsapp\.net$/, '');
  normalized = normalized.replace(/@c\.us$/, '');
  normalized = normalized.replace(/@g\.us$/, '');

  // Eliminar "whatsapp:" si existe
  normalized = normalized.replace(/^whatsapp:/i, '');

  // Eliminar el signo +
  normalized = normalized.replace(/\+/g, '');

  // Eliminar cualquier caracter que no sea dígito
  normalized = normalized.replace(/\D/g, '');

  // Si tiene más de 13 dígitos (wa_id interno), tomar últimos 10
  if (normalized.length > 13) {
    const last10 = normalized.slice(-10);
    if (last10.length === 10) {
      return last10;
    }
    return normalized;
  }

  // Para números de 12-13 dígitos, intentar quitar código de país Colombia (57)
  if (normalized.startsWith('57') && normalized.length >= 12) {
    normalized = normalized.substring(2);
  }

  return normalized;
}

/**
 * Registra un número para desactivar la IA
 * Si el número ya existe, actualiza sus datos y desactiva la IA
 *
 * @param {Object} data - Datos del número
 * @param {string} data.phoneNumber - Número de teléfono (obligatorio)
 * @param {string} data.name - Nombre (opcional)
 * @param {string} data.reason - Motivo (opcional)
 * @param {string} data.registeredBy - Quién lo registra (opcional)
 * @returns {Object} Registro creado o actualizado
 */
function addControlledNumber(data) {
  const { phoneNumber, name, reason, registeredBy } = data;

  if (!phoneNumber) {
    throw new Error('El número de teléfono es obligatorio');
  }

  const normalized = normalizePhoneNumber(phoneNumber);

  if (!normalized) {
    throw new Error('Número de teléfono inválido');
  }

  // Verificar si ya existe
  const existing = controlledNumbers.get(normalized);

  if (existing) {
    // Actualizar registro existente
    existing.iaActive = false;  // Desactivar IA
    existing.reason = reason || existing.reason;
    existing.name = name || existing.name;
    existing.updatedAt = Date.now();
    existing.updatedBy = registeredBy || 'Sistema';

    logger.info(`🔴 Número actualizado (IA desactivada): ${normalized}`);
    logger.info(`   Motivo: ${existing.reason || 'Sin motivo'}`);

    return existing;
  }

  // Crear nuevo registro
  const record = {
    phoneNumber: normalized,
    originalPhone: phoneNumber,
    name: name || '',
    reason: reason || '',
    iaActive: false,  // IA desactivada por defecto al registrar
    registeredAt: Date.now(),
    registeredBy: registeredBy || 'Sistema',
    updatedAt: Date.now(),
    updatedBy: null
  };

  controlledNumbers.set(normalized, record);

  logger.info(`🔴 Número registrado para control de IA: ${normalized}`);
  logger.info(`   Nombre: ${name || 'Sin nombre'}`);
  logger.info(`   Motivo: ${reason || 'Sin motivo'}`);
  logger.info(`   IA Activa: ${record.iaActive}`);

  return record;
}

/**
 * Actualiza el estado de IA para un número
 *
 * @param {string} phoneNumber - Número de teléfono
 * @param {boolean} iaActive - true = IA activa, false = IA desactivada
 * @param {string} updatedBy - Quién actualiza (opcional)
 * @returns {Object|null} Registro actualizado o null si no existe
 */
function updateIAStatus(phoneNumber, iaActive, updatedBy = null) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!controlledNumbers.has(normalized)) {
    logger.warn(`⚠️ Número no encontrado para actualizar: ${normalized}`);
    return null;
  }

  const record = controlledNumbers.get(normalized);
  record.iaActive = iaActive;
  record.updatedAt = Date.now();
  record.updatedBy = updatedBy;

  logger.info(`🔄 Estado de IA actualizado para ${normalized}: ${iaActive ? 'ACTIVA' : 'DESACTIVADA'}`);

  return record;
}

/**
 * Actualiza los datos de un número controlado
 *
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} data - Datos a actualizar
 * @returns {Object|null} Registro actualizado o null si no existe
 */
function updateControlledNumber(phoneNumber, data) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!controlledNumbers.has(normalized)) {
    return null;
  }

  const record = controlledNumbers.get(normalized);

  if (data.name !== undefined) record.name = data.name;
  if (data.reason !== undefined) record.reason = data.reason;
  if (data.iaActive !== undefined) record.iaActive = data.iaActive;
  if (data.updatedBy !== undefined) record.updatedBy = data.updatedBy;

  record.updatedAt = Date.now();

  logger.info(`📝 Número actualizado: ${normalized}`);

  return record;
}

/**
 * Elimina un número del control
 *
 * @param {string} phoneNumber - Número de teléfono
 * @returns {boolean} true si se eliminó, false si no existía
 */
function removeControlledNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!controlledNumbers.has(normalized)) {
    return false;
  }

  controlledNumbers.delete(normalized);
  logger.info(`🗑️ Número eliminado del control: ${normalized}`);

  return true;
}

/**
 * Verifica si la IA debe responder a un número
 *
 * IMPORTANTE: Esta función se usa en message-processor.service.js
 * ANTES de llamar al modelo de IA
 *
 * @param {string} phoneNumber - Número de teléfono (userId de WhatsApp)
 * @returns {Object} { shouldRespond: boolean, record: Object|null, reason: string }
 */
function shouldIARespond(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);

  // Si el número no está en la lista de control, la IA debe responder normalmente
  if (!controlledNumbers.has(normalized)) {
    return {
      shouldRespond: true,
      record: null,
      reason: 'Número no está en lista de control'
    };
  }

  const record = controlledNumbers.get(normalized);

  // Si iaActive es true, la IA responde
  // Si iaActive es false, la IA NO responde
  if (record.iaActive === false) {
    logger.info(`🔴 IA desactivada para ${normalized}. No se generará respuesta.`);
    return {
      shouldRespond: false,
      record: record,
      reason: record.reason || 'IA desactivada para este número'
    };
  }

  return {
    shouldRespond: true,
    record: record,
    reason: 'IA activa para este número'
  };
}

/**
 * Obtiene todos los números controlados
 *
 * @returns {Array} Lista de registros
 */
function getAllControlledNumbers() {
  return Array.from(controlledNumbers.values()).sort((a, b) => b.registeredAt - a.registeredAt);
}

/**
 * Obtiene un número controlado por su teléfono
 *
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Object|null} Registro o null si no existe
 */
function getControlledNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return controlledNumbers.get(normalized) || null;
}

/**
 * Obtiene el nombre de un número si está registrado
 *
 * @param {string} phoneNumber - Número de teléfono
 * @returns {string} Nombre o "Sin nombre" si no existe
 */
function getNameByPhone(phoneNumber) {
  const record = getControlledNumber(phoneNumber);
  return record?.name || 'Sin nombre';
}

/**
 * Obtiene estadísticas del control de números
 *
 * @returns {Object} Estadísticas
 */
function getStats() {
  const all = getAllControlledNumbers();

  return {
    total: all.length,
    iaActive: all.filter(r => r.iaActive === true).length,
    iaInactive: all.filter(r => r.iaActive === false).length
  };
}

module.exports = {
  // CRUD
  addControlledNumber,
  updateControlledNumber,
  updateIAStatus,
  removeControlledNumber,
  getControlledNumber,
  getAllControlledNumbers,

  // Funciones de verificación
  shouldIARespond,
  getNameByPhone,
  normalizePhoneNumber,

  // Estadísticas
  getStats
};
