/**
 * ===========================================
 * CONTROLADOR DE AUTENTICACIÓN
 * ===========================================
 *
 * Responsabilidades:
 * - Manejar login de usuarios
 * - Generar tokens JWT
 * - Validar credenciales
 */

const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.config');
const logger = require('../utils/logger');

/**
 * Endpoint POST /api/auth/login
 *
 * Cuerpo esperado:
 * {
 *   "username": "admin",
 *   "password": "admin123"
 * }
 *
 * Respuesta exitosa (200):
 * {
 *   "success": true,
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "user": {
 *     "username": "admin"
 *   },
 *   "expiresIn": "24h"
 * }
 *
 * Respuesta de error (401):
 * {
 *   "error": "Credenciales inválidas",
 *   "code": "INVALID_CREDENTIALS"
 * }
 */
const login = (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate that credentials were provided
    if (!username || !password) {
      return res.status(400).json({
        error: 'Se requieren usuario y contraseña',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Look up user in the multi-user table
    const userEntry = authConfig.getUser(username);
    const isValidPassword = authConfig.validatePassword(password);

    if (!userEntry || !isValidPassword) {
      logger.warn(`Intento de login fallido: ${username}`);

      return res.status(401).json({
        error: 'Credenciales inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT with username AND role
    const token = jwt.sign(
      {
        username: userEntry.username,
        role: userEntry.role
      },
      authConfig.jwtSecret,
      {
        expiresIn: authConfig.jwtExpiresIn
      }
    );

    logger.info(`Login exitoso: ${username} (role: ${userEntry.role})`);

    // Successful response
    res.json({
      success: true,
      token,
      user: {
        username: userEntry.username,
        role: userEntry.role
      },
      expiresIn: authConfig.jwtExpiresIn
    });

  } catch (error) {
    logger.error('Error en login:', error);

    res.status(500).json({
      error: 'Error en el servidor',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Endpoint GET /api/auth/me
 *
 * Retorna información del usuario autenticado
 * Requiere token JWT válido
 *
 * Header: Authorization: Bearer <token>
 *
 * Respuesta (200):
 * {
 *   "success": true,
 *   "user": {
 *     "username": "admin"
 *   }
 * }
 */
const me = (req, res) => {
  // Este endpoint requiere el middleware requireAuth
  // req.user es agregado por el middleware

  res.json({
    success: true,
    user: {
      username: req.user.username,
      role: req.user.role || 'admin'
    }
  });
};

// ===========================================
// AGENT CONFIG — Personalization (display_name, color)
// ===========================================

const fs = require('fs');
const path = require('path');

const AGENTS_CONFIG_PATH = path.join(process.cwd(), 'data', 'agents_config.json');

function readAgentsConfig() {
  try {
    if (fs.existsSync(AGENTS_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(AGENTS_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    logger.warn('Error reading agents_config.json:', err.message);
  }
  return {};
}

function writeAgentsConfig(config) {
  try {
    const dir = path.dirname(AGENTS_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AGENTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error writing agents_config.json:', err.message);
    throw err;
  }
}

/**
 * GET /api/auth/agent-config
 * Returns the personalization config for the authenticated agent
 */
const getAgentConfig = (req, res) => {
  try {
    const username = req.user.username;
    const allConfigs = readAgentsConfig();
    const config = allConfigs[username] || null;

    res.json({
      success: true,
      config: config ? { username, ...config } : { username, display_name: null, color: null }
    });
  } catch (error) {
    logger.error('Error in getAgentConfig:', error);
    res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
  }
};

/**
 * PUT /api/auth/agent-config
 * Update display_name and/or color for the authenticated agent
 * Body: { display_name?: string, color?: string }
 */
const updateAgentConfig = (req, res) => {
  try {
    const username = req.user.username;
    const { display_name, color } = req.body;

    const allConfigs = readAgentsConfig();
    const existing = allConfigs[username] || {};

    // Only update provided fields
    if (display_name !== undefined) existing.display_name = display_name || null;
    if (color !== undefined) existing.color = color || null;

    allConfigs[username] = existing;
    writeAgentsConfig(allConfigs);

    logger.info(`Agent config updated for ${username}: display_name="${existing.display_name}", color="${existing.color}"`);

    res.json({
      success: true,
      config: { username, ...existing }
    });
  } catch (error) {
    logger.error('Error in updateAgentConfig:', error);
    res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
  }
};

/**
 * DELETE /api/auth/agent-config
 * Reset personalization for the authenticated agent
 */
const deleteAgentConfig = (req, res) => {
  try {
    const username = req.user.username;
    const allConfigs = readAgentsConfig();

    delete allConfigs[username];
    writeAgentsConfig(allConfigs);

    logger.info(`Agent config reset for ${username}`);

    res.json({
      success: true,
      config: { username, display_name: null, color: null }
    });
  } catch (error) {
    logger.error('Error in deleteAgentConfig:', error);
    res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
  }
};

/**
 * GET /api/auth/all-agent-configs
 * Returns all agent configs (for rendering other advisors' display names/colors)
 */
const getAllAgentConfigs = (req, res) => {
  try {
    const allConfigs = readAgentsConfig();
    res.json({ success: true, configs: allConfigs });
  } catch (error) {
    logger.error('Error in getAllAgentConfigs:', error);
    res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
  }
};

module.exports = {
  login,
  me,
  getAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  getAllAgentConfigs,
  readAgentsConfig,
};
