/**
 * ===========================================
 * RUTAS DE ETIQUETAS (LABELS)
 * ===========================================
 *
 * CRUD del catalogo de etiquetas para organizar conversaciones.
 *
 * Endpoints:
 *  - GET    /api/labels        Lista todas las etiquetas
 *  - POST   /api/labels        Crea una etiqueta { name, color }
 *  - PUT    /api/labels/:id    Actualiza una etiqueta { name?, color? }
 *  - DELETE /api/labels/:id    Elimina una etiqueta
 */

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const labelService = require('../services/label.service');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/labels
router.get('/', requireAuth, async (req, res) => {
  try {
    const labels = await labelService.getAllLabels();
    res.json({ success: true, labels });
  } catch (error) {
    logger.error('Error listando etiquetas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/labels
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;
    const label = await labelService.createLabel(name, color);
    res.json({ success: true, label });
  } catch (error) {
    logger.error('Error creando etiqueta:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/labels/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const label = await labelService.updateLabel(id, { name, color });
    res.json({ success: true, label });
  } catch (error) {
    logger.error(`Error actualizando etiqueta ${req.params.id}:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/labels/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await labelService.deleteLabel(id);
    res.json({ success: true, message: 'Etiqueta eliminada correctamente' });
  } catch (error) {
    logger.error(`Error eliminando etiqueta ${req.params.id}:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
