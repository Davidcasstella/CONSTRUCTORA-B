/**
 * ===========================================
 * CONTROLADOR DE WEBHOOK
 * ===========================================
 *
 * Responsabilidades:
 * - Recibir y validar peticiones del webhook
 * - Extraer datos relevantes del payload
 * - Delegar procesamiento a los services
 * - Responder rápidamente (200 OK) para evitar reintentos
 *
 * IMPORTANTE: Los webhooks de WhatsApp esperan respuesta
 * rápida (< 20 segundos). El procesamiento pesado se
 * hace de forma asíncrona después de responder.
 */

const logger = require('../utils/logger');
const messageService = require('../services/message.service');
const config = require('../config');

/**
 * Verificación del webhook (GET)
 * Requerido por Meta para validar el endpoint
 */
const verify = (req, res) => {
  // TODO: Implementar verificación según proveedor
  // Meta envía: hub.mode, hub.verify_token, hub.challenge

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verificar token
  if (mode === 'subscribe' && token === config.whatsapp.meta.webhookVerifyToken) {
    logger.info('Webhook verificado correctamente');
    return res.status(200).send(challenge);
  }

  logger.warn('Verificación de webhook fallida');
  return res.status(403).json({ error: 'Verificación fallida' });
};

/**
 * Manejo de mensajes entrantes (POST)
 * Procesa los mensajes recibidos de WhatsApp
 */
const handleIncoming = async (req, res) => {
  try {
    // IMPORTANTE: Responder inmediatamente para evitar reintentos
    // El procesamiento real se hace después
    res.status(200).json({ status: 'received' });

    // TODO: Extraer mensaje según el proveedor (Meta/Twilio)
    // TODO: Validar estructura del payload
    // TODO: Delegar a messageService para procesamiento

    const payload = req.body;

    // Procesar de forma asíncrona (no bloquear respuesta)
    setImmediate(async () => {
      try {
        await messageService.processIncoming(payload);
      } catch (error) {
        logger.error('Error procesando mensaje:', error);
      }
    });

  } catch (error) {
    logger.error('Error en webhook:', error);
    // Aún así responder 200 para evitar reintentos
    if (!res.headersSent) {
      res.status(200).json({ status: 'error logged' });
    }
  }
};

module.exports = {
  verify,
  handleIncoming
};
