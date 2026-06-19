/**
 * ===========================================
 * RUTAS DE DÍAS FESTIVOS (HOLIDAYS)
 * ===========================================
 *
 * Endpoints para gestionar días festivos
 * en los que el bot no responde
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const holidaysService = require('../services/holidays.service');
const { requireAuth } = require('../middlewares/auth.middleware');

// ===========================================
// GET /api/holidays - Obtener todos los festivos
// ===========================================
router.get('/', requireAuth, async (req, res) => {
  try {
    const holidays = await holidaysService.getAllHolidays();

    res.json({
      success: true,
      holidays: holidays.map(h => h.toObject()),
      count: holidays.length
    });
  } catch (error) {
    logger.error('Error obteniendo festivos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/holidays/calendar - Obtener festivos para calendario
// ===========================================
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren año y mes'
      });
    }

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    const holidays = await holidaysService.getHolidaysForCalendar(yearNum, monthNum);

    res.json({
      success: true,
      holidays,
      year: yearNum,
      month: monthNum
    });
  } catch (error) {
    logger.error('Error obteniendo festivos para calendario:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/holidays/check - Verificar si hoy es festivo
// ===========================================
router.get('/check', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const checkDate = date ? new Date(date) : new Date();

    const isHoliday = await holidaysService.isHoliday(checkDate);
    const holidayName = isHoliday ? await holidaysService.getHolidayName(checkDate) : null;

    res.json({
      success: true,
      isHoliday,
      holidayName,
      date: holidaysService.formatDate(checkDate)
    });
  } catch (error) {
    logger.error('Error verificando festivo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/holidays/next - Obtener próximo festivo
// ===========================================
router.get('/next', requireAuth, async (req, res) => {
  try {
    const nextHoliday = await holidaysService.getNextHoliday();

    res.json({
      success: true,
      nextHoliday: nextHoliday ? nextHoliday.toObject() : null
    });
  } catch (error) {
    logger.error('Error obteniendo próximo festivo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/holidays/by-month/:year/:month - Festivos de un mes
// ===========================================
router.get('/by-month/:year/:month', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    const holidays = await holidaysService.getHolidaysByMonth(yearNum, monthNum);

    res.json({
      success: true,
      holidays: holidays.map(h => h.toObject()),
      count: holidays.length,
      year: yearNum,
      month: monthNum
    });
  } catch (error) {
    logger.error('Error obteniendo festivos del mes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/holidays/by-year/:year - Festivos de un año
// ===========================================
router.get('/by-year/:year', requireAuth, async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year, 10);

    const holidays = await holidaysService.getHolidaysByYear(yearNum);

    res.json({
      success: true,
      holidays: holidays.map(h => h.toObject()),
      count: holidays.length,
      year: yearNum
    });
  } catch (error) {
    logger.error('Error obteniendo festivos del año:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// POST /api/holidays - Crear nuevo festivo
// ===========================================
router.post('/', requireAuth, async (req, res) => {
  try {
    const { date, name, description, recurring } = req.body;

    if (!date || !name) {
      return res.status(400).json({
        success: false,
        error: 'Fecha y nombre son obligatorios'
      });
    }

    const holiday = await holidaysService.createHoliday({
      date,
      name,
      description: description || null,
      recurring: recurring !== undefined ? recurring : true
    });

    // Emitir evento via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('holiday:created', holiday.toObject());
    }

    res.status(201).json({
      success: true,
      holiday: holiday.toObject()
    });
  } catch (error) {
    logger.error('Error creando festivo:', error);
    res.status(error.message.includes('ya existe') ? 409 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// PUT /api/holidays/:id - Actualizar festivo
// ===========================================
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, name, description, recurring, active } = req.body;

    const updates = {};
    if (date !== undefined) updates.date = date;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (recurring !== undefined) updates.recurring = recurring;
    if (active !== undefined) updates.active = active;

    const holiday = await holidaysService.updateHoliday(id, updates);

    // Emitir evento via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('holiday:updated', holiday.toObject());
    }

    res.json({
      success: true,
      holiday: holiday.toObject()
    });
  } catch (error) {
    logger.error(`Error actualizando festivo ${req.params.id}:`, error);
    res.status(error.message.includes('no encontrado') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// DELETE /api/holidays/:id - Eliminar festivo
// ===========================================
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await holidaysService.deleteHoliday(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Festivo no encontrado'
      });
    }

    // Emitir evento via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('holiday:deleted', { id });
    }

    res.json({
      success: true,
      message: 'Festivo eliminado correctamente'
    });
  } catch (error) {
    logger.error(`Error eliminando festivo ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// PATCH /api/holidays/:id/toggle - Activar/desactivar festivo
// ===========================================
router.patch('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (active === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el estado "active"'
      });
    }

    const holiday = await holidaysService.toggleHoliday(id, active);

    // Emitir evento via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('holiday:toggled', holiday.toObject());
    }

    res.json({
      success: true,
      holiday: holiday.toObject()
    });
  } catch (error) {
    logger.error(`Error cambiando estado de festivo ${req.params.id}:`, error);
    res.status(error.message.includes('no encontrado') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// POST /api/holidays/initialize - Inicializar festivos predeterminados
// ===========================================
router.post('/initialize', requireAuth, async (req, res) => {
  try {
    await holidaysService.initializeDefaultHolidays();

    res.json({
      success: true,
      message: 'Festivos predeterminados inicializados correctamente'
    });
  } catch (error) {
    logger.error('Error inicializando festivos predeterminados:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
