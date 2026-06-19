/**
 * ===========================================
 * LOGGER CENTRALIZADO
 * ===========================================
 *
 * Responsabilidades:
 * - Proveer logging consistente en toda la aplicación
 * - Formatear logs según ambiente (desarrollo/producción)
 * - Escribir logs a archivos en producción
 * - Niveles: error, warn, info, debug
 *
 * USO:
 * const logger = require('./utils/logger');
 * logger.info('Mensaje informativo');
 * logger.error('Error:', error);
 */

const winston = require('winston');
const path = require('path');

// Configuración desde variables de entorno
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const LOG_DIR = process.env.LOG_DIR || './logs';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===========================================
// FORMATO PERSONALIZADO
// ===========================================

const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

  // Agregar metadata si existe
  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`;
  }

  return log;
});

// ===========================================
// CONFIGURACIÓN DE TRANSPORTS
// ===========================================

const transports = [];

// Console transport (siempre activo)
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      customFormat
    )
  })
);

// File transports (✅ MEJORADO: activos en TODOS los ambientes con rotación)
// Archivo para todos los logs
transports.push(
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      winston.format.json()
    ),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true
  })
);

// Archivo solo para errores
transports.push(
  new winston.transports.File({
    filename: path.join(LOG_DIR, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      winston.format.json()
    ),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true
  })
);

// ===========================================
// CREAR INSTANCIA DE LOGGER
// ===========================================

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp()
  ),
  transports,
  // No salir en errores no manejados
  exitOnError: false
});

// ===========================================
// MÉTODOS ADICIONALES
// ===========================================

/**
 * Log de inicio de request (para middleware)
 */
logger.logRequest = (req) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip
  });
};

/**
 * Log de respuesta (para middleware)
 */
logger.logResponse = (req, res, duration) => {
  logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
};

/**
 * Log de error con contexto
 */
logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    stack: error.stack,
    ...context
  });
};

module.exports = logger;
