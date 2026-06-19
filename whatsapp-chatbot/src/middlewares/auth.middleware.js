/**
 * ===========================================
 * MIDDLEWARE DE AUTENTICACIÓN
 * ===========================================
 *
 * Responsabilidades:
 * - Verificar tokens JWT
 * - Proteger rutas sensibles
 * - Validar firmas de webhooks (seguridad)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authConfig = require('../config/auth.config');
const logger = require('../utils/logger');

// ===========================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ===========================================

/**
 * Verifica el token JWT en el header Authorization
 *
 * Header esperado: Authorization: Bearer <token>
 *
 * Si el token es válido, agrega req.user con los datos del usuario
 * Si el token es inválido o está ausente, retorna 401
 */
const requireAuth = (req, res, next) => {
  try {
    // Obtener header Authorization
    // Obtener header Authorization o query param
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      // ✅ NUEVO: Permitir token en query param (para descargas/streams)
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'No se proporcionó token de autenticación',
        code: 'NO_TOKEN'
      });
    }

    /*
    // Extraer token del header "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Formato de token inválido. Use: Authorization: Bearer <token>',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const token = parts[1];
    */

    // Verificar token
    const decoded = jwt.verify(token, authConfig.jwtSecret);

    // Agregar información del usuario al request
    req.user = {
      username: decoded.username,
      role: decoded.role || 'admin',
      iat: decoded.iat,
      exp: decoded.exp
    };

    logger.debug(`Usuario autenticado: ${req.user.username}`);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }

    logger.error('Error en autenticación:', error);
    return res.status(500).json({
      error: 'Error en autenticación',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware opcional de autenticación
 *
 * Si el token está presente, lo verifica y agrega req.user
 * Si no está presente, continúa sin req.user
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No hay token, continuar sin autenticación
      return next();
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      // Formo inválido, continuar sin autenticación
      return next();
    }

    const token = parts[1];

    // Verificar token
    const decoded = jwt.verify(token, authConfig.jwtSecret);

    req.user = {
      username: decoded.username,
      role: decoded.role || 'admin',
      iat: decoded.iat,
      exp: decoded.exp
    };

    next();
  } catch (error) {
    // Token inválido, continuar sin autenticación
    next();
  }
};

// ===========================================
// VERIFICACIÓN DE WEBHOOKS (EXISTENTE)
// ===========================================

/**
 * Verifica la firma del webhook de Meta
 * Meta envía la firma en el header X-Hub-Signature-256
 */
const verifyWebhookSignature = (req, res, next) => {
  // TODO: Implementar verificación de firma según proveedor

  const config = require('../config');

  if (config.whatsapp.provider === 'meta') {
    return verifyMetaSignature(req, res, next);
  }

  if (config.whatsapp.provider === 'twilio') {
    return verifyTwilioSignature(req, res, next);
  }

  // Si no hay proveedor configurado, continuar (solo en desarrollo)
  if (config.server.isDevelopment) {
    logger.warn('Verificación de firma omitida en desarrollo');
    return next();
  }

  return res.status(401).json({ error: 'Proveedor no configurado' });
};

/**
 * Verificación de firma para Meta (Facebook)
 */
const verifyMetaSignature = (req, res, next) => {
  // TODO: Implementar verificación HMAC-SHA256
  // const signature = req.headers['x-hub-signature-256'];
  // const expectedSignature = crypto
  //   .createHmac('sha256', APP_SECRET)
  //   .update(JSON.stringify(req.body))
  //   .digest('hex');

  // Por ahora, pasar en desarrollo
  const config = require('../config');

  if (config.server.isDevelopment) {
    return next();
  }

  // Placeholder para implementación
  logger.debug('Verificando firma Meta...');
  next();
};

/**
 * Verificación de firma para Twilio
 */
const verifyTwilioSignature = (req, res, next) => {
  // TODO: Implementar verificación de Twilio
  // Usar twilio.validateRequest()

  const config = require('../config');

  if (config.server.isDevelopment) {
    return next();
  }

  logger.debug('Verificando firma Twilio...');
  next();
};

module.exports = {
  // Middleware JWT
  requireAuth,
  optionalAuth,

  // Middleware de webhooks
  verifyWebhookSignature,
  verifyMetaSignature,
  verifyTwilioSignature
};
