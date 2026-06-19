/**
 * ===========================================
 * UTILIDAD DE RETRY CON BACKOFF EXPONENCIAL
 * ===========================================
 *
 * Ejecuta una función async con reintentos automáticos.
 * Solo reintenta en errores transitorios (429, 500, 502, 503).
 * NO reintenta errores de auth (401) o validación (400).
 */

const logger = require('./logger');

/**
 * Espera un tiempo determinado
 * @param {number} ms - Milisegundos a esperar
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Errores HTTP que se consideran transitorios (se pueden reintentar)
 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Errores HTTP que NO se deben reintentar
 */
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 422];

/**
 * Ejecuta una función con retry y backoff exponencial
 *
 * @param {Function} fn - Función async a ejecutar
 * @param {Object} options - Opciones de configuración
 * @param {number} options.maxRetries - Máximo de reintentos (default: 3)
 * @param {number} options.initialDelayMs - Delay inicial en ms (default: 1000)
 * @param {number} options.backoffMultiplier - Multiplicador de backoff (default: 2)
 * @param {number} options.maxDelayMs - Delay máximo en ms (default: 10000)
 * @param {string} options.operationName - Nombre de la operación para logs
 * @returns {Promise<*>} Resultado de la función
 */
const withRetry = async (fn, options = {}) => {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        backoffMultiplier = 2,
        maxDelayMs = 10000,
        operationName = 'operación'
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn();
            if (attempt > 0) {
                logger.info(`✅ ${operationName} exitosa en intento ${attempt + 1}/${maxRetries + 1}`);
            }
            return result;
        } catch (error) {
            lastError = error;

            // Determinar si el error es recuperable
            const statusCode = error.status || error.statusCode || 0;
            const isRetryable = isRetryableError(error);

            // Si NO es recuperable, lanzar inmediatamente
            if (!isRetryable) {
                logger.warn(`❌ ${operationName} falló con error NO recuperable (status: ${statusCode}): ${error.message}`);
                throw error;
            }

            // Si ya agotamos los reintentos, lanzar
            if (attempt >= maxRetries) {
                logger.error(`❌ ${operationName} falló después de ${maxRetries + 1} intentos: ${error.message}`);
                throw error;
            }

            // Calcular delay con backoff exponencial
            const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);

            // Si es rate limit (429), usar Retry-After si está disponible
            const retryAfter = error.headers?.['retry-after'];
            const actualDelay = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, delay) : delay;

            logger.warn(`⚠️ ${operationName} - Intento ${attempt + 1}/${maxRetries + 1} falló (status: ${statusCode}). Reintentando en ${actualDelay}ms...`);

            await sleep(actualDelay);
        }
    }

    throw lastError;
};

/**
 * Determina si un error es recuperable (se puede reintentar)
 * @param {Error} error - Error a evaluar
 * @returns {boolean}
 */
const isRetryableError = (error) => {
    const statusCode = error.status || error.statusCode || 0;

    // Errores explícitamente NO recuperables
    if (NON_RETRYABLE_STATUS_CODES.includes(statusCode)) {
        return false;
    }

    // Errores explícitamente recuperables
    if (RETRYABLE_STATUS_CODES.includes(statusCode)) {
        return true;
    }

    // Errores de red (sin status code) son recuperables
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return true;
    }

    // Error de timeout
    if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
        return true;
    }

    // Por defecto, NO reintentar errores desconocidos
    return false;
};

module.exports = {
    withRetry,
    isRetryableError,
    sleep,
    RETRYABLE_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES
};
