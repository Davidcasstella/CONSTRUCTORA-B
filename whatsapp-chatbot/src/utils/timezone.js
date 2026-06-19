/**
 * ===========================================
 * UTILIDAD DE ZONA HORARIA FIJA
 * ===========================================
 *
 * Centraliza TODAS las operaciones de fecha/hora del sistema.
 * Usa una zona horaria fija configurada en .env (TIMEZONE),
 * independiente del servidor AWS o del país de conexión.
 *
 * IMPORTANTE: NUNCA usar new Date() directamente para obtener
 * horas/minutos locales. Siempre usar este módulo.
 */

const logger = require('./logger');

// Zona horaria fija del sistema (por defecto: America/Bogota)
const SYSTEM_TIMEZONE = process.env.TIMEZONE || 'America/Bogota';

/**
 * Obtiene la fecha/hora actual en la zona horaria del sistema.
 * Retorna un objeto con las partes de la fecha ya convertidas.
 *
 * @returns {Object} { hours, minutes, seconds, year, month, day, dateString, timeString, decimal }
 */
function now() {
  const date = new Date();

  // Usar Intl.DateTimeFormat para obtener las partes en la zona horaria fija
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: SYSTEM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = {};
  formatter.formatToParts(date).forEach(({ type, value }) => {
    parts[type] = value;
  });

  const hours = parseInt(parts.hour, 10);
  const minutes = parseInt(parts.minute, 10);
  const seconds = parseInt(parts.second, 10);
  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);

  return {
    hours,
    minutes,
    seconds,
    year,
    month,
    day,
    // Hora en formato decimal (ej: 16.5 = 4:30 PM)
    decimal: hours + (minutes / 60),
    // Strings formateados
    timeString: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    dateString: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    // Timestamp UTC (para almacenamiento)
    timestamp: date.getTime(),
    // Zona horaria configurada
    timezone: SYSTEM_TIMEZONE
  };
}

/**
 * Obtiene la hora actual en formato decimal.
 * Ejemplo: 16.5 = 4:30 PM
 *
 * @returns {number} Hora decimal en la zona horaria del sistema
 */
function getDecimalHour() {
  return now().decimal;
}

/**
 * Obtiene la hora actual como string legible.
 *
 * @returns {string} Hora en formato "HH:MM:SS"
 */
function getTimeString() {
  return now().timeString;
}

/**
 * Obtiene la fecha actual como string.
 *
 * @returns {string} Fecha en formato "YYYY-MM-DD"
 */
function getDateString() {
  return now().dateString;
}

/**
 * Obtiene el día de la semana actual (0=domingo, 6=sábado)
 *
 * @returns {number} Día de la semana
 */
function getDayOfWeek() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SYSTEM_TIMEZONE,
    weekday: 'short'
  });
  const dayName = formatter.format(date);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[dayName] ?? 0;
}

/**
 * Obtiene la zona horaria configurada.
 *
 * @returns {string} Zona horaria (ej: "America/Bogota")
 */
function getTimezone() {
  return SYSTEM_TIMEZONE;
}

/**
 * Obtiene un timestamp actual (siempre UTC, para almacenamiento)
 *
 * @returns {number} Timestamp en milisegundos
 */
function getTimestamp() {
  return Date.now();
}

/**
 * Formatea un timestamp a la zona horaria del sistema.
 *
 * @param {number} timestamp - Timestamp en milisegundos
 * @returns {string} Fecha/hora formateada en la zona horaria del sistema
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('es-CO', { timeZone: SYSTEM_TIMEZONE });
}

// Log al inicializar
logger.info(`⏰ Zona horaria del sistema configurada: ${SYSTEM_TIMEZONE}`);
logger.info(`   Hora actual del sistema: ${now().timeString} (${SYSTEM_TIMEZONE})`);

module.exports = {
  now,
  getDecimalHour,
  getTimeString,
  getDateString,
  getDayOfWeek,
  getTimezone,
  getTimestamp,
  formatTimestamp,
  SYSTEM_TIMEZONE
};
