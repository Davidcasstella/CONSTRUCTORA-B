/**
 * ===========================================
 * FUNCIONES HELPER
 * ===========================================
 *
 * Responsabilidades:
 * - Funciones utilitarias generales
 * - Formateo de datos
 * - Manejo de strings
 * - Operaciones comunes
 */

/**
 * Espera un tiempo determinado (promesa)
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Reintentar una función con backoff exponencial
 * @param {Function} fn - Función a ejecutar
 * @param {Object} options - Opciones de reintento
 * @returns {Promise<any>}
 */
const retry = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);

      if (onRetry) {
        onRetry(error, attempt, waitTime);
      }

      await sleep(waitTime);
    }
  }

  throw lastError;
};

/**
 * Trunca un texto a una longitud máxima
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @param {string} suffix - Sufijo a agregar si se trunca
 * @returns {string}
 */
const truncate = (text, maxLength = 100, suffix = '...') => {
  if (!text || text.length <= maxLength) {
    return text || '';
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Genera un ID único simple
 * @returns {string}
 */
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Formatea bytes a formato legible
 * @param {number} bytes - Bytes a formatear
 * @returns {string}
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Formatea una duración en milisegundos
 * @param {number} ms - Milisegundos
 * @returns {string}
 */
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

/**
 * Escapa caracteres especiales de Markdown para WhatsApp
 * @param {string} text - Texto a escapar
 * @returns {string}
 */
const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/([_*~`])/g, '\\$1');
};

/**
 * Parsea menciones en un mensaje
 * @param {string} text - Texto con menciones
 * @returns {Array<string>} Array de números mencionados
 */
const parseMentions = (text) => {
  if (!text) return [];
  const mentionRegex = /@(\d+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
};

/**
 * Divide un texto largo en chunks para WhatsApp
 * WhatsApp tiene límite de ~4096 caracteres por mensaje
 * @param {string} text - Texto a dividir
 * @param {number} maxLength - Longitud máxima por chunk
 * @returns {Array<string>}
 */
const splitIntoChunks = (text, maxLength = 4000) => {
  if (!text || text.length <= maxLength) {
    return [text || ''];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Buscar punto de corte natural (salto de línea o espacio)
    let cutPoint = remaining.lastIndexOf('\n', maxLength);
    if (cutPoint === -1 || cutPoint < maxLength / 2) {
      cutPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (cutPoint === -1 || cutPoint < maxLength / 2) {
      cutPoint = maxLength;
    }

    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint).trimStart();
  }

  return chunks;
};

/**
 * Crea un objeto con solo las propiedades especificadas
 * @param {Object} obj - Objeto original
 * @param {Array<string>} keys - Propiedades a incluir
 * @returns {Object}
 */
const pick = (obj, keys) => {
  if (!obj) return {};
  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Crea un objeto sin las propiedades especificadas
 * @param {Object} obj - Objeto original
 * @param {Array<string>} keys - Propiedades a excluir
 * @returns {Object}
 */
const omit = (obj, keys) => {
  if (!obj) return {};
  return Object.keys(obj).reduce((result, key) => {
    if (!keys.includes(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Verifica si un valor está vacío
 * @param {any} value - Valor a verificar
 * @returns {boolean}
 */
const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

module.exports = {
  sleep,
  retry,
  truncate,
  generateId,
  formatBytes,
  formatDuration,
  escapeMarkdown,
  parseMentions,
  splitIntoChunks,
  pick,
  omit,
  isEmpty
};
