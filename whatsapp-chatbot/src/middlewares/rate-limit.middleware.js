/**
 * ===========================================
 * MIDDLEWARE DE RATE LIMITING
 * ===========================================
 *
 * Limitación de tasa por IP sin dependencias externas.
 * Usa un Map en memoria con limpieza automática.
 *
 * - API general: 100 req/min por IP
 * - Envío de mensajes: 20 req/min por IP
 */

const logger = require('../utils/logger');

/**
 * Store en memoria para tracking de requests
 * Estructura: Map<string, { count: number, resetTime: number }>
 */
const stores = new Map();

/**
 * Limpieza periódica de entradas expiradas (cada 5 minutos)
 */
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    stores.forEach((store) => {
        for (const [key, value] of store.entries()) {
            if (now > value.resetTime) {
                store.delete(key);
            }
        }
    });
}, 5 * 60 * 1000);

if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

/**
 * Crea un middleware de rate limiting
 *
 * @param {Object} options - Opciones de configuración
 * @param {number} options.maxRequests - Máximo de requests permitidos en la ventana
 * @param {number} options.windowMs - Ventana de tiempo en milisegundos
 * @param {string} options.name - Nombre del limiter para logs
 * @param {string} options.message - Mensaje de error cuando se excede
 * @returns {Function} Middleware de Express
 */
const createRateLimiter = (options = {}) => {
    const {
        maxRequests = 100,
        windowMs = 60 * 1000, // 1 minuto por defecto
        name = 'general',
        message = 'Demasiadas solicitudes. Por favor, intente más tarde.'
    } = options;

    // Crear store dedicado para este limiter
    const store = new Map();
    stores.set(name, store);

    return (req, res, next) => {
        // Obtener identificador del cliente
        const clientId = req.ip || req.connection.remoteAddress || 'unknown';

        // ✅ SKIP: No aplicar rate limit a llamadas internas (localhost/dashboard)
        const localhostIPs = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];
        if (localhostIPs.includes(clientId)) {
            return next();
        }
        const now = Date.now();

        // Obtener o crear entrada
        let entry = store.get(clientId);

        if (!entry || now > entry.resetTime) {
            // Nueva ventana
            entry = {
                count: 0,
                resetTime: now + windowMs
            };
            store.set(clientId, entry);
        }

        entry.count++;

        // Calcular valores para headers
        const remaining = Math.max(0, maxRequests - entry.count);
        const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

        // Agregar headers informativos
        res.set({
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(resetSeconds)
        });

        // Verificar si excede el límite
        if (entry.count > maxRequests) {
            logger.warn(`🚫 Rate limit excedido [${name}]: IP=${clientId}, count=${entry.count}/${maxRequests}`);

            res.set('Retry-After', String(resetSeconds));

            return res.status(429).json({
                error: {
                    message: message,
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: resetSeconds
                }
            });
        }

        next();
    };
};

/**
 * Rate limiter general para API (1000 req/min para soportar polling del Dashboard)
 */
const apiLimiter = createRateLimiter({
    maxRequests: 1000,
    windowMs: 60 * 1000,
    name: 'api-general',
    message: 'Demasiadas solicitudes a la API. Máximo 1000 por minuto.'
});

/**
 * Rate limiter estricto para envío de mensajes (20 req/min)
 */
const messageLimiter = createRateLimiter({
    maxRequests: 20,
    windowMs: 60 * 1000,
    name: 'send-message',
    message: 'Demasiados mensajes enviados. Máximo 20 por minuto.'
});

/**
 * Obtiene estadísticas del rate limiter
 */
const getStats = () => {
    const stats = {};
    stores.forEach((store, name) => {
        stats[name] = {
            activeClients: store.size,
            entries: Array.from(store.entries()).map(([ip, data]) => ({
                ip: ip.replace(/^.*:/, ''), // Limpiar IPv6 prefix
                count: data.count,
                resetIn: Math.max(0, Math.ceil((data.resetTime - Date.now()) / 1000))
            }))
        };
    });
    return stats;
};

/**
 * Rate limiter for bulk send campaigns (max 2 per 30 min)
 */
const bulkSendLimiter = createRateLimiter({
    maxRequests: 2,
    windowMs: 30 * 60 * 1000,
    name: 'bulk-send',
    message: 'Demasiadas campañas. Máximo 2 cada 30 minutos.'
});

module.exports = {
    createRateLimiter,
    apiLimiter,
    messageLimiter,
    bulkSendLimiter,
    getStats
};
