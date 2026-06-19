/**
 * ===========================================
 * RUTAS DE WEBHOOK
 * ===========================================
 *
 * Responsabilidades:
 * - Definir endpoints para webhooks de WhatsApp
 * - Aplicar middlewares específicos de autenticación
 * - Delegar procesamiento al controller
 *
 * ENDPOINTS:
 * - GET  /api/webhook  → Verificación del webhook (requerido por Meta)
 * - POST /api/webhook  → Recepción de mensajes entrantes
 */

const express = require('express');
const webhookController = require('../controllers/webhook.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// ===========================================
// VERIFICACIÓN DEL WEBHOOK (Meta Cloud API)
// ===========================================
// Meta envía un GET para verificar que el webhook es válido
// Debe responder con el hub.challenge si el token coincide

router.get(
  '/',
  webhookController.verify
);

// ===========================================
// RECEPCIÓN DE MENSAJES
// ===========================================
// Meta/Twilio envían POST con los mensajes entrantes
// Se aplica middleware de autenticación específico

router.post(
  '/',
  authMiddleware.verifyWebhookSignature,
  webhookController.handleIncoming
);

module.exports = router;
