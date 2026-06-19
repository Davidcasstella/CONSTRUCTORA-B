/**
 * ===========================================
 * SERVICIO DE MÉTRICAS
 * ===========================================
 *
 * Recopila estadísticas de uso en memoria:
 * - Mensajes procesados por día
 * - Tiempo promedio de respuesta de IA
 * - Mensajes por tipo
 * - Escalaciones por día
 * - Bloqueos de spam
 */

const logger = require('../utils/logger');

// ===========================================
// ALMACENAMIENTO DE MÉTRICAS
// ===========================================

const metrics = {
    // Contadores generales
    totalMessages: 0,
    totalAIResponses: 0,
    totalEscalations: 0,
    totalSpamBlocks: 0,

    // Por día (últimos 7 días)
    daily: new Map(),

    // Tiempos de respuesta IA (últimos 100)
    aiResponseTimes: [],

    // Por tipo de mensaje
    messageTypes: {
        text: 0,
        audio: 0,
        image: 0,
        document: 0,
        video: 0,
        other: 0
    },

    // Últimos errores
    recentErrors: [],

    // Inicio del servicio
    startedAt: new Date().toISOString()
};

/**
 * Obtiene la clave del día actual (YYYY-MM-DD)
 */
const getTodayKey = () => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Obtiene o crea las métricas del día actual
 */
const getDailyMetrics = () => {
    const key = getTodayKey();
    if (!metrics.daily.has(key)) {
        metrics.daily.set(key, {
            messages: 0,
            aiResponses: 0,
            escalations: 0,
            spamBlocks: 0,
            avgResponseTime: 0,
            responseTimes: []
        });

        // Limpiar días antiguos (mantener solo 7)
        const keys = Array.from(metrics.daily.keys()).sort();
        while (keys.length > 7) {
            metrics.daily.delete(keys.shift());
        }
    }
    return metrics.daily.get(key);
};

// ===========================================
// FUNCIONES DE REGISTRO
// ===========================================

/**
 * Registra un mensaje procesado
 */
const recordMessage = (type = 'text') => {
    metrics.totalMessages++;
    getDailyMetrics().messages++;

    const normalizedType = type.toLowerCase();
    if (metrics.messageTypes[normalizedType] !== undefined) {
        metrics.messageTypes[normalizedType]++;
    } else {
        metrics.messageTypes.other++;
    }
};

/**
 * Registra una respuesta de IA con su tiempo
 */
const recordAIResponse = (responseTimeMs) => {
    metrics.totalAIResponses++;
    getDailyMetrics().aiResponses++;

    // Guardar tiempo de respuesta (últimos 100)
    metrics.aiResponseTimes.push(responseTimeMs);
    if (metrics.aiResponseTimes.length > 100) {
        metrics.aiResponseTimes.shift();
    }

    const daily = getDailyMetrics();
    daily.responseTimes.push(responseTimeMs);
    daily.avgResponseTime = daily.responseTimes.reduce((a, b) => a + b, 0) / daily.responseTimes.length;
};

/**
 * Registra una escalación
 */
const recordEscalation = () => {
    metrics.totalEscalations++;
    getDailyMetrics().escalations++;
};

/**
 * Registra un bloqueo de spam
 */
const recordSpamBlock = () => {
    metrics.totalSpamBlocks++;
    getDailyMetrics().spamBlocks++;
};

/**
 * Registra un error
 */
const recordError = (error, context = '') => {
    metrics.recentErrors.push({
        message: error.message || String(error),
        context,
        timestamp: new Date().toISOString()
    });

    // Mantener solo los últimos 20 errores
    if (metrics.recentErrors.length > 20) {
        metrics.recentErrors.shift();
    }
};

// ===========================================
// CONSULTAS
// ===========================================

/**
 * Obtiene todas las métricas formateadas
 */
const getMetrics = () => {
    const avgResponseTime = metrics.aiResponseTimes.length > 0
        ? Math.round(metrics.aiResponseTimes.reduce((a, b) => a + b, 0) / metrics.aiResponseTimes.length)
        : 0;

    // Convertir daily Map a objeto
    const dailyStats = {};
    metrics.daily.forEach((value, key) => {
        dailyStats[key] = {
            messages: value.messages,
            aiResponses: value.aiResponses,
            escalations: value.escalations,
            spamBlocks: value.spamBlocks,
            avgResponseTimeMs: Math.round(value.avgResponseTime)
        };
    });

    return {
        summary: {
            totalMessages: metrics.totalMessages,
            totalAIResponses: metrics.totalAIResponses,
            totalEscalations: metrics.totalEscalations,
            totalSpamBlocks: metrics.totalSpamBlocks,
            avgAIResponseTimeMs: avgResponseTime,
            uptime: process.uptime(),
            startedAt: metrics.startedAt
        },
        messageTypes: { ...metrics.messageTypes },
        daily: dailyStats,
        recentErrors: metrics.recentErrors.slice(-10)
    };
};

/**
 * Reinicia las métricas
 */
const resetMetrics = () => {
    metrics.totalMessages = 0;
    metrics.totalAIResponses = 0;
    metrics.totalEscalations = 0;
    metrics.totalSpamBlocks = 0;
    metrics.aiResponseTimes = [];
    metrics.messageTypes = { text: 0, audio: 0, image: 0, document: 0, video: 0, other: 0 };
    metrics.daily.clear();
    metrics.recentErrors = [];
    metrics.startedAt = new Date().toISOString();

    logger.info('📊 Métricas reiniciadas');
};

module.exports = {
    recordMessage,
    recordAIResponse,
    recordEscalation,
    recordSpamBlock,
    recordError,
    getMetrics,
    resetMetrics
};
