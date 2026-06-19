/**
 * ===========================================
 * RUTAS DE AUTENTICACIÓN
 * ===========================================
 *
 * Endpoints:
 * - POST /api/auth/login - Iniciar sesión
 * - GET /api/auth/me - Obtener usuario actual
 */

const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * POST /api/auth/login
 *
 * Inicia sesión y devuelve un token JWT
 *
 * Body:
 * {
 *   "username": "admin",
 *   "password": "admin123"
 * }
 */
router.post('/login', authController.login);

/**
 * GET /api/auth/me
 *
 * Retorna información del usuario autenticado
 * Requiere token JWT en header: Authorization: Bearer <token>
 */
router.get('/me', requireAuth, authController.me);

// Agent personalization config
router.get('/agent-config', requireAuth, authController.getAgentConfig);
router.put('/agent-config', requireAuth, authController.updateAgentConfig);
router.delete('/agent-config', requireAuth, authController.deleteAgentConfig);
router.get('/all-agent-configs', requireAuth, authController.getAllAgentConfigs);

module.exports = router;
