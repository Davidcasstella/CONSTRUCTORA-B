const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/google-calendar.service');
const { requireAuth } = require('../middlewares/auth.middleware');

// Todas las rutas requieren autenticación del dashboard
router.use(requireAuth);

/**
 * GET /api/calendar/config
 * Obtiene la configuración actual del calendario
 */
router.get('/config', (req, res) => {
  try {
    const config = googleCalendarService.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/calendar/config
 * Actualiza la configuración del calendario
 */
router.post('/config', async (req, res) => {
  try {
    const { calendarId } = req.body;
    if (!calendarId) {
      return res.status(400).json({ success: false, error: 'calendarId es requerido' });
    }
    
    const config = await googleCalendarService.updateConfig(calendarId);
    res.json({ success: true, config, message: 'Configuración actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/calendar/events
 * Obtiene los eventos en un rango de fechas
 */
router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start y end son requeridos' });
    }
    
    const events = await googleCalendarService.getEvents(start, end);
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/calendar/events/:id
 * Elimina un evento
 */
router.delete('/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    await googleCalendarService.deleteEvent(eventId);
    res.json({ success: true, message: 'Evento eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
