/**
 * ===========================================
 * SERVICIO DE ESCALACIÓN A HUMANO
 * ===========================================
 *
 * Responsabilidades:
 * - Detectar cuándo una conversación requiere intervención humana
 * - Evaluar reglas de escalación
 * - Verificar horarios de atención
 * - Gestionar prioridades de escalación
 */

const logger = require('../utils/logger');

/**
 * Configuración de reglas de escalación
 */
const escalationRules = {
  // Frases que indican una SOLICITUD CLARA de hablar con asesor
  // ✅ MEJORADO: Incluye variaciones con "un/una" y más formas de solicitar asesor
  explicitRequest: [
    // Variaciones de "quiero asesor"
    'quiero asesor',
    'quiero un asesor',
    'quiero una asesora',
    'quiero hablar con asesor',
    'quiero hablar con un asesor',
    'quiero hablar con una asesora',
    'quiero que me atienda un asesor',
    'quiero atencion personal',
    'quiero hablar con persona',
    'quiero hablar con alguien',
    // Variaciones de "necesito asesor"
    'necesito asesor',
    'necesito un asesor',
    'necesito una asesora',
    'necesito hablar con asesor',
    'necesito hablar con un asesor',
    'necesito hablar con alguien',
    'necesito hablar con persona',
    'necesito atencion de asesor',
    // Variaciones de "contactar/comunicar"
    'contactame con asesor',
    'contactame con un asesor',
    'contactarme con asesor',
    'contactarme con un asesor',
    'comuniqueme con asesor',
    'comuniqueme con un asesor',
    'comunicarme con asesor',
    'comunicarme con un asesor',
    'conectarme con asesor',
    'conectarme con un asesor',
    // Variaciones de "pasar/transferir"
    'pasame con asesor',
    'pasame con un asesor',
    'pasarme con asesor',
    'pasarme con un asesor',
    'transferirme a asesor',
    'transferirme a un asesor',
    // Otras formas de pedir asesor
    'hablar con humano',
    'hablar con persona',
    'atención de asesor',
    'atención personal',
    'atencion humana',
    'como puedo hablar con un asesor',
    'como hablar con asesor',
    'puedo hablar con asesor',
    'puedo hablar con un asesor',
    'deseo hablar con asesor',
    'deseo hablar con un asesor'
  ],

  // ✅ NUEVO: Palabras clave de intención + "asesor" para detección flexible
  // Si el mensaje contiene una palabra de intención + "asesor", es solicitud de escalación
  advisorIntentKeywords: ['quiero', 'necesito', 'contacta', 'comunica', 'conecta', 'pasa', 'transfier', 'hablar', 'atencion', 'atención'],

  // ✅ NUEVO: Frases que indican confusión o no entendimiento
  // Cuando el usuario no entiende, mejor escalar a humano
  userConfusion: [
    'no entiendo',
    'no entiendo nada',
    'no te entiendo',
    'no le entiendo',
    'no comprendo',
    'no sé',
    'no se',
    'explicame mejor',
    'explícame mejor',
    'expliqueme mejor',
    'explíqueme mejor',
    'no me queda claro',
    'no quedo claro',
    'que significa eso',
    'qué significa eso',
    'no me ayuda',
    'eso no me sirve',
    'no me sirve',
    'repiteme',
    'repíteme',
    'otra vez',
    'no es lo que pregunto',
    'no es lo que pregunté'
  ],

  // Tópicos complejos/sensibles que requieren atención humana
  complexTopics: [
    'queja', 'reclamo', 'problema', 'error', 'no funciona',
    'insatisfecho', 'descontento', 'mal servicio', 'demorado',
    'urgente', 'emergencia'
  ],

  // ❌ ELIMINADO: Ya no se usa límite de intentos
  // La IA siempre intenta responder primero
  // maxRetries: 3,

  // Horario laboral (PUNTO DE CONTROL 4)
  // ✅ ACTUALIZADO: Lee de schedule-config.service.js (configurable desde dashboard)
  get workingHours() {
    const scheduleConfig = require('./schedule-config.service');
    const cfg = scheduleConfig.getConfig();
    return {
      start: cfg.weekdays.start,
      end: cfg.weekdays.endHour,
      endMinute: cfg.weekdays.endMinute,
      timezone: cfg.timezone,
      weekdays: cfg.weekdays.days || [1, 2, 3, 4, 5],
      saturday: {
        start: cfg.saturday.start,
        end: cfg.saturday.endHour,
        endMinute: cfg.saturday.endMinute,
        enabled: cfg.saturday.enabled
      },
      sunday: {
        enabled: cfg.sunday.enabled
      }
    };
  },

  // Tiempo mínimo entre mensajes para considerar "reintento"
  retryMinInterval: 30000 // 30 segundos
};

/**
 * Historial temporal para detectar reintentos
 * Map<userId, Array<{timestamp, message}>>
 */
const retryHistory = new Map();

/**
 * Evalúa si un mensaje requiere escalación a humano
 *
 * @param {string} userId - ID del usuario
 * @param {string} message - Mensaje del usuario
 * @param {number} interactionCount - Número de interacciones en el ciclo actual
 * @returns {Object} - { needsHuman, reason, priority, message }
 */
function evaluateEscalation(userId, message, interactionCount = 0) {
  const normalizedMessage = message.toLowerCase().trim();

  // ✅ NUEVO: Obtener conversación para verificar si fue reactivada manualmente
  const conversationStateService = require('./conversation-state.service');
  const conversation = conversationStateService.getConversation(userId);

  // ✅ NUEVO: Si fue reactivada manualmente, ignorar regla de múltiples intentos
  // (Ya no se usa la regla de múltiples intentos, pero mantenemos el flag por si acaso)
  if (conversation && conversation.manuallyReactivated) {
    logger.info(`🔄 Conversación ${userId} fue reactivada manualmente. Reseteando flag.`);

    // Resetear el flag para que solo se aplique una vez
    conversation.manuallyReactivated = false;

    // No escalar (la regla de múltiples intentos ya no existe)
    logger.info(`   ✅ Flag de reactivación manual reseteado`);
    logger.info(`   ✅ La IA intentará responder normalmente`);

    return {
      needsHuman: false,
      reason: null,
      priority: null,
      message: null
    };
  }

  // 1. Solicitud explícita de asesor humano (frases exactas)
  const explicitMatch = escalationRules.explicitRequest.find(keyword =>
    normalizedMessage.includes(keyword.toLowerCase())
  );

  if (explicitMatch) {
    logger.info(`🚨 Escalación explícita detectada para ${userId}: "${explicitMatch}"`);

    return {
      needsHuman: true,
      reason: 'user_requested',
      priority: 'high',
      message: 'El usuario solicita hablar con un asesor.',
      detectedKeyword: explicitMatch
    };
  }

  // 1b. ✅ NUEVO: Detección flexible de intención de asesor
  // Si el mensaje contiene "asesor" Y una palabra de intención, es solicitud de escalación
  const hasAsesor = normalizedMessage.includes('asesor');
  if (hasAsesor) {
    const intentMatch = escalationRules.advisorIntentKeywords.find(intent =>
      normalizedMessage.includes(intent.toLowerCase())
    );

    if (intentMatch) {
      logger.info(`🚨 Intención de asesor detectada para ${userId}: "${intentMatch}" + "asesor"`);

      return {
        needsHuman: true,
        reason: 'user_requested',
        priority: 'high',
        message: 'El usuario solicita hablar con un asesor.',
        detectedKeyword: `${intentMatch} + asesor`
      };
    }
  }

  // 2. Tópico complejo o sensible
  const complexMatch = escalationRules.complexTopics.find(keyword =>
    normalizedMessage.includes(keyword.toLowerCase())
  );

  if (complexMatch) {
    logger.info(`⚠️ Tópico complejo detectado para ${userId}: "${complexMatch}"`);

    return {
      needsHuman: true,
      reason: 'complex_topic',
      priority: 'medium',
      message: `Tópico sensible detectado: "${complexMatch}". Requiere atención humana.`,
      detectedKeyword: complexMatch
    };
  }

  // 3. ✅ NUEVO: Detectar confusión del usuario
  // Si el usuario indica que no entiende, es mejor escalar a humano
  const confusionMatch = escalationRules.userConfusion.find(phrase =>
    normalizedMessage.includes(phrase.toLowerCase())
  );

  if (confusionMatch) {
    logger.info(`❓ Confusión detectada para ${userId}: "${confusionMatch}"`);

    return {
      needsHuman: true,
      reason: 'user_confusion',
      priority: 'medium',
      message: `El usuario indica confusión: "${confusionMatch}". Requiere atención humana para aclarar.`,
      detectedKeyword: confusionMatch
    };
  }

  // ===========================================
  // ❌ ELIMINADO: Regla de múltiples intentos
  // ===========================================
  // La IA SIEMPRE debe intentar responder primero.
  // Solo se escala si:
  // 1. El usuario lo solicita explícitamente
  // 2. Es un tópico complejo/sensible
  // 3. La IA indica que no tiene información (baja confianza)
  //
  // No tiene sentido escalar automáticamente después de N mensajes,
  // ya que la IA moderna puede manejar conversaciones largas perfectamente.

  // 3. Múltiples intentos sin resolución (usar interactionCount) - ELIMINADO
  // if (interactionCount >= escalationRules.maxRetries) {
  //   logger.info(`🔄 Múltiples intentos para ${userId}: ${interactionCount}+`);
  //   return {
  //     needsHuman: true,
  //     reason: 'multiple_retries',
  //     priority: 'medium',
  //     message: `Usuario realizó ${interactionCount}+ interacciones sin resolución satisfactoria.`
  //   };
  // }

  // 4. Verificar si está fuera de horario laboral
  const isWithinHours = isWithinWorkingHours();

  if (!isWithinHours) {
    logger.info(`🌙 Fuera de horario laboral`);

    return {
      needsHuman: false,
      reason: 'out_of_hours',
      priority: 'low',
      message: 'Fuera del horario de atención (8:00 AM - 4:30 PM, Lun-Vie).'
    };
  }

  // No requiere escalación
  return {
    needsHuman: false,
    reason: null,
    priority: null,
    message: null
  };
}

/**
 * Verifica si estamos dentro del horario laboral
 * PUNTO DE CONTROL 4: Horario diferenciado por día
 *
 * Horarios:
 * - Lunes a Viernes: 8:00 AM - 4:30 PM
 * - Sábados: 9:00 AM - 12:00 PM
 * - Domingos: No se atiende
 *
 * @returns {boolean}
 */
function isWithinWorkingHours() {
  try {
    const now = new Date();

    // Obtener hora y minuto en la zona horaria configurada
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    const { start, end, endMinute, weekdays, saturday, sunday } = escalationRules.workingHours;

    const currentTimeDecimal = hour + (minute / 60);

    // Domingo: No se atiende
    if (day === 0) {
      if (!sunday.enabled) {
        logger.debug(`Hoy es domingo (día ${day}) - No se atiende`);
        return false;
      }
      // Si en el futuro se habilita domingo, agregar lógica aquí
    }

    // Sábado: Horario especial 9:00 AM - 12:00 PM
    if (day === 6) {
      if (!saturday.enabled) {
        logger.debug(`Hoy es sábado (día ${day}) - No se atiende`);
        return false;
      }

      const satStart = saturday.start;
      const satEnd = saturday.end;
      const satEndTimeDecimal = satEnd + (saturday.endMinute / 60);

      const isSaturdayWorkHour = currentTimeDecimal >= satStart && currentTimeDecimal < satEndTimeDecimal;

      logger.debug(`Sábado - Horario check: ${hour}:${minute.toString().padStart(2, '0')} está en rango ${satStart}:00-${satEnd}:${saturday.endMinute.toString().padStart(2, '0')}? ${isSaturdayWorkHour}`);

      return isSaturdayWorkHour;
    }

    // Lunes a Viernes: 8:00 AM - 4:30 PM
    const isWorkday = weekdays.includes(day);

    if (!isWorkday) {
      logger.debug(`Hoy no es día laboral (día ${day})`);
      return false;
    }

    const endTimeDecimal = end + (endMinute / 60);
    const isWorkHour = currentTimeDecimal >= start && currentTimeDecimal < endTimeDecimal;

    logger.debug(`Lunes a Viernes - Horario check: ${hour}:${minute.toString().padStart(2, '0')} está en rango ${start}:00-${end}:${endMinute.toString().padStart(2, '0')}? ${isWorkHour}`);

    return isWorkHour;
  } catch (error) {
    logger.error('Error verificando horario laboral:', error);
    // En caso de error, asumimos que estamos en horario laboral
    return true;
  }
}

/**
 * Obtiene el próximo horario de apertura
 *
 * Horarios:
 * - Lunes a Viernes: 8:00 AM - 4:30 PM
 * - Sábados: 9:00 AM - 12:00 PM
 * - Domingos: Cerrado
 *
 * @returns {Object} - { date, formatted }
 */
function getNextOpeningTime() {
  const now = new Date();
  const { start, weekdays, saturday, sunday } = escalationRules.workingHours;

  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeDecimal = currentHour + (currentMinute / 60);

  let nextOpening = new Date(now);

  // Definir horarios según día - ✅ ACTUALIZADO: lee dinámicamente
  const wh = escalationRules.workingHours;
  const weekdayEndDecimal = wh.end + (wh.endMinute / 60);
  const satEndDecimal = wh.saturday.enabled ? wh.saturday.end + (wh.saturday.endMinute / 60) : 0;

  const schedule = {
    1: { start: wh.start, end: weekdayEndDecimal, name: 'lunes' },
    2: { start: wh.start, end: weekdayEndDecimal, name: 'martes' },
    3: { start: wh.start, end: weekdayEndDecimal, name: 'miércoles' },
    4: { start: wh.start, end: weekdayEndDecimal, name: 'jueves' },
    5: { start: wh.start, end: weekdayEndDecimal, name: 'viernes' },
    6: wh.saturday.enabled ? { start: wh.saturday.start, end: satEndDecimal, name: 'sábado' } : null,
    0: wh.sunday.enabled ? { start: 0, end: 0, name: 'domingo' } : null
  };

  // Si estamos dentro del horario actual de hoy, retornar null
  const todaySchedule = schedule[currentDay];
  if (todaySchedule && currentTimeDecimal >= todaySchedule.start && currentTimeDecimal < todaySchedule.end) {
    // Estamos dentro del horario de hoy
    return {
      date: now,
      formatted: 'Ahora (dentro del horario de atención)',
      isOpen: true
    };
  }

  // Buscar próximo día laboral
  let daysToAdd = 1;
  let foundSchedule = null;

  while (daysToAdd <= 7) { // Máximo buscar 7 días adelante
    const targetDay = (currentDay + daysToAdd) % 7;
    const targetSchedule = schedule[targetDay];

    if (targetSchedule) {
      foundSchedule = targetSchedule;

      // Calcular la fecha de apertura
      nextOpening = new Date(now);
      nextOpening.setDate(now.getDate() + daysToAdd);
      nextOpening.setHours(targetSchedule.start, 0, 0, 0);

      break;
    }

    daysToAdd++;
  }

  const formatted = nextOpening.toLocaleString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: escalationRules.workingHours.timezone
  });

  return {
    date: nextOpening,
    formatted: formatted,
    isOpen: false,
    schedule: foundSchedule ? foundSchedule.name : null
  };
}

/**
 * Registra un reintento para detección de múltiples intentos
 *
 * @param {string} userId
 * @param {string} message
 */
function registerRetry(userId, message) {
  if (!retryHistory.has(userId)) {
    retryHistory.set(userId, []);
  }

  const userRetries = retryHistory.get(userId);
  const now = Date.now();

  // Agregar reintento
  userRetries.push({
    timestamp: now,
    message
  });

  // Limpiar reintentos antiguos (más de 5 minutos)
  const recentRetries = userRetries.filter(r =>
    now - r.timestamp < 5 * 60 * 1000
  );

  retryHistory.set(userId, recentRetries);

  logger.debug(`Reintento registrado para ${userId}. Total reciente: ${recentRetries.length}`);
}

/**
 * Obtiene el número de reintentos recientes de un usuario
 *
 * @param {string} userId
 * @returns {number}
 */
function getRetryCount(userId) {
  const userRetries = retryHistory.get(userId);
  return userRetries ? userRetries.length : 0;
}

/**
 * Limpia el historial de reintentos de un usuario
 *
 * @param {string} userId
 */
function clearRetryHistory(userId) {
  retryHistory.delete(userId);
  logger.debug(`Historial de reintentos limpiado para ${userId}`);
}

/**
 * Obtiene estadísticas de escalación
 *
 * @returns {Object}
 */
function getEscalationStats() {
  const now = Date.now();
  let totalRetries = 0;
  let recentRetries = 0;

  for (const [userId, retries] of retryHistory.entries()) {
    totalRetries += retries.length;
    recentRetries += retries.filter(r => now - r.timestamp < 60 * 60 * 1000).length;
  }

  return {
    totalUsersWithRetries: retryHistory.size,
    totalRetries,
    recentRetries,
    isWithinWorkingHours: isWithinWorkingHours(),
    nextOpeningTime: getNextOpeningTime()
  };
}

module.exports = {
  evaluateEscalation,
  isWithinWorkingHours,
  getNextOpeningTime,
  registerRetry,
  getRetryCount,
  clearRetryHistory,
  getEscalationStats
};
