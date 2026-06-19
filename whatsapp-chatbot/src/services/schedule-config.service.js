/**
 * ===========================================
 * SERVICIO DE CONFIGURACIÓN DE HORARIO
 * ===========================================
 *
 * Centraliza la configuración de horarios de atención.
 * Persiste en data/schedule-config.json.
 *
 * Antes, los horarios estaban hardcodeados en:
 *   - message-processor.service.js (BUSINESS_HOURS)
 *   - escalation.service.js (escalationRules.workingHours)
 *
 * Ahora ambos leen de este servicio.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_FILE = path.join(process.cwd(), 'data', 'schedule-config.json');

// Valores por defecto (los mismos que estaban hardcodeados)
const DEFAULT_CONFIG = {
    weekdays: {
        start: 8,         // 8:00 AM
        endHour: 16,      // 4:00 PM
        endMinute: 30,    // → 4:30 PM
        days: [1, 2, 3, 4, 5] // Lun-Vie
    },
    saturday: {
        start: 9,         // 9:00 AM
        endHour: 12,      // 12:00 PM
        endMinute: 0,     // → 12:00 PM exacto
        enabled: true
    },
    sunday: {
        enabled: false
    },
    timezone: 'America/Bogota',
    // ✅ PERSISTENCIA: Estados de activación guardados en disco (no en memoria)
    scheduleCheckEnabled: false,  // false = el bot responde sin verificar horario
    holidayCheckEnabled: true     // true = el bot verifica días festivos
};

// Configuración en memoria
let currentConfig = null;

/**
 * Carga la configuración desde el archivo JSON.
 * Si no existe, crea el archivo con valores por defecto.
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            currentConfig = JSON.parse(raw);
            logger.info('📅 Configuración de horario cargada desde archivo');
        } else {
            currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            saveConfigToFile();
            logger.info('📅 Configuración de horario creada con valores por defecto');
        }
    } catch (error) {
        logger.error('Error cargando configuración de horario, usando defaults:', error.message);
        currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
}

/**
 * Guarda la configuración actual en el archivo JSON.
 */
function saveConfigToFile() {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
        logger.info('📅 Configuración de horario guardada');
        return true;
    } catch (error) {
        logger.error('Error guardando configuración de horario:', error.message);
        return false;
    }
}

/**
 * Obtiene la configuración actual de horario.
 * @returns {Object} Configuración de horario
 */
function getConfig() {
    if (!currentConfig) {
        loadConfig();
    }
    return { ...currentConfig };
}

/**
 * Actualiza la configuración de horario.
 * Solo actualiza los campos proporcionados.
 *
 * @param {Object} newConfig - Campos a actualizar
 * @returns {{ success: boolean, config: Object }}
 */
function updateConfig(newConfig) {
    if (!currentConfig) {
        loadConfig();
    }

    // Validar que los valores numéricos sean correctos
    if (newConfig.weekdays) {
        const w = newConfig.weekdays;
        if (w.start !== undefined) {
            if (typeof w.start !== 'number' || w.start < 0 || w.start > 23) {
                return { success: false, error: 'Hora de inicio L-V inválida (0-23)' };
            }
            currentConfig.weekdays.start = w.start;
        }
        if (w.endHour !== undefined) {
            if (typeof w.endHour !== 'number' || w.endHour < 0 || w.endHour > 23) {
                return { success: false, error: 'Hora de fin L-V inválida (0-23)' };
            }
            currentConfig.weekdays.endHour = w.endHour;
        }
        if (w.endMinute !== undefined) {
            if (typeof w.endMinute !== 'number' || w.endMinute < 0 || w.endMinute > 59) {
                return { success: false, error: 'Minutos de fin L-V inválidos (0-59)' };
            }
            currentConfig.weekdays.endMinute = w.endMinute;
        }
    }

    if (newConfig.saturday) {
        const s = newConfig.saturday;
        if (s.start !== undefined) {
            if (typeof s.start !== 'number' || s.start < 0 || s.start > 23) {
                return { success: false, error: 'Hora de inicio sábado inválida (0-23)' };
            }
            currentConfig.saturday.start = s.start;
        }
        if (s.endHour !== undefined) {
            if (typeof s.endHour !== 'number' || s.endHour < 0 || s.endHour > 23) {
                return { success: false, error: 'Hora de fin sábado inválida (0-23)' };
            }
            currentConfig.saturday.endHour = s.endHour;
        }
        if (s.endMinute !== undefined) {
            if (typeof s.endMinute !== 'number' || s.endMinute < 0 || s.endMinute > 59) {
                return { success: false, error: 'Minutos de fin sábado inválidos (0-59)' };
            }
            currentConfig.saturday.endMinute = s.endMinute;
        }
        if (typeof s.enabled === 'boolean') {
            currentConfig.saturday.enabled = s.enabled;
        }
    }

    if (newConfig.sunday) {
        if (typeof newConfig.sunday.enabled === 'boolean') {
            currentConfig.sunday.enabled = newConfig.sunday.enabled;
        }
    }

    const saved = saveConfigToFile();
    return {
        success: saved,
        config: getConfig()
    };
}

// ===========================================
// FUNCIONES PARA PERSISTIR ESTADOS DE ACTIVACIÓN
// ===========================================

/**
 * Obtiene el estado persistido de la verificación de horario.
 * @returns {boolean}
 */
function getScheduleEnabled() {
    // ✅ Siempre releer del disco para reflejar cambios manuales al JSON
    loadConfig();
    return currentConfig.scheduleCheckEnabled === true;
}

/**
 * Persiste el estado de activación del horario en disco.
 * @param {boolean} enabled
 * @returns {{ success: boolean }}
 */
function setScheduleEnabled(enabled) {
    if (!currentConfig) loadConfig();
    currentConfig.scheduleCheckEnabled = enabled;
    const saved = saveConfigToFile();
    logger.info(`📅 Verificación de horario ${enabled ? 'ACTIVADA' : 'DESACTIVADA'} y guardada en disco`);
    return { success: saved };
}

/**
 * Obtiene el estado persistido de la verificación de festivos.
 * @returns {boolean}
 */
function getHolidayEnabled() {
    // ✅ Siempre releer del disco para reflejar cambios manuales al JSON
    loadConfig();
    // Si el campo no existe en el archivo aún, usar el default (true)
    return currentConfig.holidayCheckEnabled !== false;
}

/**
 * Persiste el estado de activación de festivos en disco.
 * @param {boolean} enabled
 * @returns {{ success: boolean }}
 */
function setHolidayEnabled(enabled) {
    if (!currentConfig) loadConfig();
    currentConfig.holidayCheckEnabled = enabled;
    const saved = saveConfigToFile();
    logger.info(`📅 Verificación de festivos ${enabled ? 'ACTIVADA' : 'DESACTIVADA'} y guardada en disco`);
    return { success: saved };
}

/**
 * Obtiene la configuración en formato legible para el usuario.
 * Usado para generar mensajes de "fuera de horario".
 * @returns {Object} { weekdaysLabel, saturdayLabel }
 */
function getFormattedSchedule() {
    const cfg = getConfig();
    const w = cfg.weekdays;
    const s = cfg.saturday;

    const formatTime = (hour, minute) => {
        const h = hour % 12 || 12;
        const m = minute.toString().padStart(2, '0');
        const ampm = hour < 12 ? 'AM' : 'PM';
        return `${h}:${m} ${ampm}`;
    };

    return {
        weekdaysLabel: `${formatTime(w.start, 0)} - ${formatTime(w.endHour, w.endMinute)}`,
        saturdayLabel: s.enabled
            ? `${formatTime(s.start, 0)} - ${formatTime(s.endHour, s.endMinute)}`
            : 'Cerrado',
        sundayLabel: cfg.sunday.enabled ? 'Abierto' : 'Cerrado'
    };
}

// Cargar al iniciar
loadConfig();

module.exports = {
    getConfig,
    updateConfig,
    getFormattedSchedule,
    getScheduleEnabled,
    setScheduleEnabled,
    getHolidayEnabled,
    setHolidayEnabled
};
