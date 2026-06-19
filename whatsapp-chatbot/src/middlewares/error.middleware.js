/**
 * ===========================================
 * MIDDLEWARE DE MANEJO DE ERRORES
 * ===========================================
 *
 * Responsabilidades:
 * - Capturar errores no manejados
 * - Formatear respuestas de error consistentes
 * - Loggear errores para debugging
 * - Ocultar detalles sensibles en producción
 *
 * IMPORTANTE: Este middleware debe ser el ÚLTIMO
 * en la cadena de middlewares de Express.
 */

const logger = require('../utils/logger');
const config = require('../config');

/**
 * Middleware global de manejo de errores
 * Express identifica este middleware por tener 4 parámetros
 */
const errorMiddleware = (err, req, res, next) => {
  // Loggear el error completo
  logger.error('Error no manejado:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determinar código de estado
  const statusCode = err.statusCode || err.status || 500;

  // Construir respuesta de error
  const errorResponse = {
    error: {
      message: err.message || 'Error interno del servidor',
      code: err.code || 'INTERNAL_ERROR'
    }
  };

  // En desarrollo, incluir stack trace
  if (config.server.isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details;
  }

  // Enviar respuesta
  res.status(statusCode).json(errorResponse);
};

/**
 * Clase de error personalizada para la aplicación
 * Permite especificar código de estado y código de error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguir de errores de programación

    Error.captureStackTrace(this, this.constructor);
  }
}

// Errores comunes predefinidos
const Errors = {
  NotFound: (resource = 'Recurso') =>
    new AppError(`${resource} no encontrado`, 404, 'NOT_FOUND'),

  BadRequest: (message = 'Petición inválida') =>
    new AppError(message, 400, 'BAD_REQUEST'),

  Unauthorized: (message = 'No autorizado') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  Forbidden: (message = 'Acceso denegado') =>
    new AppError(message, 403, 'FORBIDDEN'),

  ValidationError: (message = 'Error de validación') =>
    new AppError(message, 422, 'VALIDATION_ERROR'),

  ExternalServiceError: (service = 'Servicio externo') =>
    new AppError(`Error en ${service}`, 502, 'EXTERNAL_SERVICE_ERROR')
};

module.exports = errorMiddleware;
module.exports.AppError = AppError;
module.exports.Errors = Errors;
