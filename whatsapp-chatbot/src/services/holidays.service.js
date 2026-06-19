/**
 * ===========================================
 * SERVICIO DE DÍAS FESTIVOS
 * ===========================================
 *
 * Responsabilidades:
 * - Lógica de negocio para gestión de festivos
 * - Verificar si hoy es festivo
 * - Coordinar entre repositorio y aplicación
 * - Caché de festivos para optimización
 * - Control de activación/desactivación de verificación de festivos
 */

const logger = require('../utils/logger');
const holidayRepository = require('../repositories/holiday.repository');
const { Holiday } = require('../models/holiday.model');
const scheduleConfig = require('./schedule-config.service');

// ✅ PERSISTENCIA: holidayCheckEnabled ahora se lee/escribe desde schedule-config.service.js
// (guardado en data/schedule-config.json, no en memoria volátil)

/**
 * Servicio de Holidays
 * Maneja la lógica de negocio de días festivos
 */
class HolidaysService {
  constructor() {
    // Caché de festivos (se recarga cada hora)
    this.cache = {
      holidays: [],
      lastLoad: null,
      cacheDuration: 60 * 60 * 1000 // 1 hora
    };
  }

  // ===========================================
  // CONTROL DE VERIFICACIÓN DE FESTIVOS
  // ===========================================

  /**
   * Activa o desactiva la verificación de días festivos
   * @param {boolean} enabled - true para activar, false para desactivar
   * @returns {Object} Resultado
   */
  static setHolidayCheck(enabled) {
    const previousState = scheduleConfig.getHolidayEnabled();
    scheduleConfig.setHolidayEnabled(enabled);

    if (enabled) {
      logger.info(`✅ Verificación de días festivos ACTIVADA (persistida en disco)`);
      logger.info(`   El bot verificará si hoy es festivo antes de responder`);
    } else {
      logger.warn(`⚠️ Verificación de días festivos DESACTIVADA (persistida en disco)`);
      logger.warn(`   El bot responderá SIN verificar si es festivo`);
    }

    return {
      success: true,
      holidayCheckEnabled: enabled,
      previousState: previousState,
      message: enabled
        ? 'Verificación de días festivos activada'
        : 'Verificación de días festivos desactivada'
    };
  }

  /**
   * Verifica si la verificación de festivos está activada
   * ✅ Lee desde disco (persiste entre reinicios)
   * @returns {boolean} true si está activada
   */
  static isHolidayCheckEnabled() {
    return scheduleConfig.getHolidayEnabled();
  }

  /**
   * Obtiene el estado actual del control de festivos
   * @returns {Object} Estado
   */
  static getHolidayCheckStatus() {
    return {
      enabled: scheduleConfig.getHolidayEnabled()
    };
  }

  // ===========================================
  // GESTIÓN DE FESTIVOS
  // ===========================================

  /**
   * Obtiene todos los festivos activos
   * @returns {Promise<Array<Holiday>>}
   */
  async getAllHolidays() {
    try {
      const holidays = await holidayRepository.findAllActive();

      // Actualizar caché
      this.cache.holidays = holidays;
      this.cache.lastLoad = Date.now();

      logger.debug(`📅 Cargados ${holidays.length} festivos activos`);
      return holidays;
    } catch (error) {
      logger.error('Error obteniendo festivos:', error);
      return [];
    }
  }

  /**
   * Obtiene festivos desde caché o recarga si es necesario
   * @returns {Promise<Array<Holiday>>}
   */
  async getHolidays() {
    const now = Date.now();
    const cacheAge = this.cache.lastLoad ? now - this.cache.lastLoad : Infinity;

    // Si el caché expiró, recargar
    if (cacheAge > this.cache.cacheDuration || this.cache.holidays.length === 0) {
      return await this.getAllHolidays();
    }

    return this.cache.holidays;
  }

  /**
   * Obtiene festivos de un mes específico
   * @param {number} year - Año
   * @param {number} month - Mes (1-12)
   * @returns {Promise<Array<Holiday>>}
   */
  async getHolidaysByMonth(year, month) {
    try {
      return await holidayRepository.findByMonth(year, month);
    } catch (error) {
      logger.error(`Error obteniendo festivos del mes ${month}:`, error);
      return [];
    }
  }

  /**
   * Obtiene festivos de un año específico
   * @param {number} year - Año
   * @returns {Promise<Array<Holiday>>}
   */
  async getHolidaysByYear(year) {
    try {
      return await holidayRepository.findByYear(year);
    } catch (error) {
      logger.error(`Error obteniendo festivos del año ${year}:`, error);
      return [];
    }
  }

  /**
   * Crea un nuevo día festivo
   * @param {object} data - Datos del festivo
   * @returns {Promise<Holiday>}
   */
  async createHoliday(data) {
    try {
      const { date, name, description, recurring } = data;

      if (!date || !name) {
        throw new Error('Fecha y nombre son obligatorios');
      }

      // Verificar si ya existe un festivo en esa fecha
      const existing = await holidayRepository.findByDate(date);
      if (existing.length > 0) {
        throw new Error('Ya existe un festivo para esta fecha');
      }

      const holiday = Holiday.create(date, name, description, recurring);
      await holidayRepository.save(holiday);

      // Invalidar caché
      this.invalidateCache();

      logger.info(`✅ Festivo creado: ${date} - ${name}`);
      return holiday;
    } catch (error) {
      logger.error('Error creando festivo:', error);
      throw error;
    }
  }

  /**
   * Actualiza un festivo existente
   * @param {string} id - ID del festivo
   * @param {object} data - Datos a actualizar
   * @returns {Promise<Holiday>}
   */
  async updateHoliday(id, data) {
    try {
      const holiday = await holidayRepository.update(id, data);

      // Invalidar caché
      this.invalidateCache();

      logger.info(`✅ Festivo actualizado: ${id}`);
      return holiday;
    } catch (error) {
      logger.error(`Error actualizando festivo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un festivo
   * @param {string} id - ID del festivo
   * @returns {Promise<boolean>}
   */
  async deleteHoliday(id) {
    try {
      const result = await holidayRepository.delete(id);

      if (result) {
        // Invalidar caché
        this.invalidateCache();
        logger.info(`✅ Festivo eliminado: ${id}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error eliminando festivo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Activa o desactiva un festivo
   * @param {string} id - ID del festivo
   * @param {boolean} active - Estado deseado
   * @returns {Promise<Holiday>}
   */
  async toggleHoliday(id, active) {
    try {
      const holiday = await holidayRepository.setActive(id, active);

      // Invalidar caché
      this.invalidateCache();

      logger.info(`✅ Festivo ${active ? 'activado' : 'desactivado'}: ${id}`);
      return holiday;
    } catch (error) {
      logger.error(`Error cambiando estado de festivo ${id}:`, error);
      throw error;
    }
  }

  // ===========================================
  // VERIFICACIÓN DE FESTIVOS
  // ===========================================

  /**
   * Verifica si una fecha específica es festivo
   * @param {Date|string} date - Fecha a verificar
   * @returns {Promise<boolean>}
   */
  async isHoliday(date) {
    try {
      const holidays = await this.getHolidays();
      return holidays.some(h => h.matchesDate(date) && h.isActive());
    } catch (error) {
      logger.error('Error verificando si es festivo:', error);
      return false;
    }
  }

  /**
   * Verifica si hoy es festivo
   * ✅ Respeta el control de holidayCheckEnabled
   * @returns {Promise<boolean>}
   */
  async isTodayHoliday() {
    try {
      // Verificar si la verificación de festivos está desactivada
      if (!scheduleConfig.getHolidayEnabled()) {
        logger.debug(`📅 Verificación de días festivos DESACTIVADA. No se verifica festivo.`);
        return false;
      }

      const isHoliday = await this.isHoliday(new Date());

      if (isHoliday) {
        const holidays = await this.getHolidays();
        const todayHoliday = holidays.find(h => h.matchesDate(new Date()));

        if (todayHoliday) {
          logger.info(`🎉 Hoy es festivo: ${todayHoliday.name} (${todayHoliday.date})`);
        }
      }

      return isHoliday;
    } catch (error) {
      logger.error('Error verificando si hoy es festivo:', error);
      return false;
    }
  }

  /**
   * Obtiene el nombre del festivo de una fecha
   * @param {Date|string} date - Fecha a verificar
   * @returns {Promise<string|null>}
   */
  async getHolidayName(date) {
    try {
      const holidays = await this.getHolidays();
      const holiday = holidays.find(h => h.matchesDate(date) && h.isActive());
      return holiday ? holiday.name : null;
    } catch (error) {
      logger.error('Error obteniendo nombre del festivo:', error);
      return null;
    }
  }

  /**
   * Obtiene el próximo festivo
   * @returns {Promise<Holiday|null>}
   */
  async getNextHoliday() {
    try {
      return await holidayRepository.getNextHoliday();
    } catch (error) {
      logger.error('Error obteniendo próximo festivo:', error);
      return null;
    }
  }

  /**
   * Obtiene los festivos de un rango de fechas para el calendario
   * @param {number} year - Año
   * @param {number} month - Mes (1-12)
   * @returns {Promise<Array>} - Array de objetos { date: 'YYYY-MM-DD', name: 'Nombre' }
   */
  async getHolidaysForCalendar(year, month) {
    try {
      const holidays = await this.getHolidaysByMonth(year, month);

      return holidays.map(h => ({
        id: h.id,
        date: h.date,
        name: h.name,
        recurring: h.recurring,
        active: h.active
      }));
    } catch (error) {
      logger.error(`Error obteniendo festivos para calendario:`, error);
      return [];
    }
  }

  // ===========================================
  // UTILIDADES
  // ===========================================

  /**
   * Invalida el caché de festivos
   */
  invalidateCache() {
    this.cache.holidays = [];
    this.cache.lastLoad = null;
    logger.debug('🔄 Caché de festivos invalidado');
  }

  /**
   * Formatea una fecha al formato YYYY-MM-DD
   * @param {Date} date - Fecha a formatear
   * @returns {string}
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Inicializa festivos predeterminados para Colombia
   * (solo si no hay ninguno configurado)
   */
  async initializeDefaultHolidays() {
    try {
      const existing = await holidayRepository.findAll();

      if (existing.length > 0) {
        logger.info(`📅 Ya existen ${existing.length} festivos configurados. No se inicializarán los predeterminados.`);
        return;
      }

      // Festivos de Colombia (ejemplo)
      const defaultHolidays = [
        { date: '2024-01-01', name: 'Año Nuevo', recurring: true },
        { date: '2024-01-06', name: 'Día de los Reyes Magos', recurring: true },
        { date: '2024-03-25', name: 'Día de San José', recurring: true },
        { date: '2024-03-28', name: 'Jueves Santo', recurring: true },
        { date: '2024-03-29', name: 'Viernes Santo', recurring: true },
        { date: '2024-05-01', name: 'Día del Trabajo', recurring: true },
        { date: '2024-05-13', name: 'Día de la Ascensión', recurring: true },
        { date: '2024-06-03', name: 'Corpus Christi', recurring: true },
        { date: '2024-06-24', name: 'Sagrado Corazón', recurring: true },
        { date: '2024-07-01', name: 'San Pedro y San Pablo', recurring: true },
        { date: '2024-07-20', name: 'Día de la Independencia', recurring: true },
        { date: '2024-08-07', name: 'Batalla de Boyacá', recurring: true },
        { date: '2024-08-19', name: 'La Asunción de la Virgen', recurring: true },
        { date: '2024-10-14', name: 'Día de la Raza', recurring: true },
        { date: '2024-11-04', name: 'Día de todos los Santos', recurring: true },
        { date: '2024-11-11', name: 'Independencia de Cartagena', recurring: true },
        { date: '2024-12-08', name: 'Inmaculada Concepción', recurring: true },
        { date: '2024-12-25', name: 'Navidad', recurring: true }
      ];

      for (const h of defaultHolidays) {
        const holiday = Holiday.create(h.date, h.name, null, h.recurring);
        await holidayRepository.save(holiday);
      }

      logger.info(`✅ Se inicializaron ${defaultHolidays.length} festivos predeterminados de Colombia`);
    } catch (error) {
      logger.error('Error inicializando festivos predeterminados:', error);
    }
  }
}

// Singleton
const holidaysService = new HolidaysService();

// Exportar el singleton y las funciones estáticas
module.exports = Object.assign(holidaysService, {
  // Funciones estáticas para control de verificación de festivos
  setHolidayCheck: HolidaysService.setHolidayCheck,
  isHolidayCheckEnabled: HolidaysService.isHolidayCheckEnabled,
  getHolidayCheckStatus: HolidaysService.getHolidayCheckStatus
});
