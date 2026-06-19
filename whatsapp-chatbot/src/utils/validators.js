/**
 * ===========================================
 * VALIDADORES
 * ===========================================
 *
 * Responsabilidades:
 * - Validar formatos de datos comunes
 * - Validar números de teléfono
 * - Validar payloads de webhooks
 * - Sanitizar entradas
 *
 * USO:
 * const validators = require('./utils/validators');
 * if (validators.isValidPhone(number)) { ... }
 */

/**
 * Valida un número de teléfono (formato internacional)
 * @param {string} phone - Número a validar
 * @returns {boolean}
 */
const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Limpiar espacios y guiones
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // Formato: + seguido de 7-15 dígitos
  const phoneRegex = /^\+?[1-9]\d{6,14}$/;
  return phoneRegex.test(cleaned);
};

/**
 * Normaliza un número de teléfono
 * @param {string} phone - Número a normalizar
 * @returns {string} Número normalizado
 */
const normalizePhone = (phone) => {
  if (!phone) return '';

  // Quitar todo excepto dígitos y +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Asegurar que tenga + al inicio
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  return normalized;
};

/**
 * Valida un email
 * @param {string} email - Email a validar
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida que un objeto tenga las propiedades requeridas
 * @param {Object} obj - Objeto a validar
 * @param {Array<string>} required - Propiedades requeridas
 * @returns {Object} { isValid, missing }
 */
const hasRequiredFields = (obj, required) => {
  if (!obj || typeof obj !== 'object') {
    return { isValid: false, missing: required };
  }

  const missing = required.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || value === '';
  });

  return {
    isValid: missing.length === 0,
    missing
  };
};

/**
 * Valida payload de webhook de Meta
 * @param {Object} payload - Payload a validar
 * @returns {Object} { isValid, error }
 */
const validateMetaWebhookPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Payload vacío o inválido' };
  }

  if (!payload.object || payload.object !== 'whatsapp_business_account') {
    return { isValid: false, error: 'Tipo de objeto inválido' };
  }

  if (!Array.isArray(payload.entry) || payload.entry.length === 0) {
    return { isValid: false, error: 'No hay entries en el payload' };
  }

  return { isValid: true, error: null };
};

/**
 * Sanitiza texto para prevenir inyección
 * @param {string} text - Texto a sanitizar
 * @param {Object} options - Opciones de sanitización
 * @returns {string} Texto sanitizado
 */
const sanitizeText = (text, options = {}) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Limitar longitud
  const maxLength = options.maxLength || 4096;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Quitar caracteres de control (excepto saltos de línea)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim
  if (options.trim !== false) {
    sanitized = sanitized.trim();
  }

  return sanitized;
};

/**
 * Valida URL
 * @param {string} url - URL a validar
 * @returns {boolean}
 */
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valida tipo MIME
 * @param {string} mimeType - Tipo MIME a validar
 * @param {Array<string>} allowed - Tipos permitidos
 * @returns {boolean}
 */
const isAllowedMimeType = (mimeType, allowed = []) => {
  if (!mimeType) return false;

  // Si no hay restricciones, permitir todos
  if (allowed.length === 0) return true;

  // Verificar si está en la lista o si coincide el tipo general
  return allowed.some(type => {
    if (type.endsWith('/*')) {
      // Tipo general (ej: "image/*")
      const category = type.replace('/*', '');
      return mimeType.startsWith(category);
    }
    return mimeType === type;
  });
};

module.exports = {
  isValidPhone,
  normalizePhone,
  isValidEmail,
  hasRequiredFields,
  validateMetaWebhookPayload,
  sanitizeText,
  isValidUrl,
  isAllowedMimeType
};
