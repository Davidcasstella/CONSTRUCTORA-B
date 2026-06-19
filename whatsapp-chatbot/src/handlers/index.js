/**
 * ===========================================
 * ÍNDICE DE HANDLERS
 * ===========================================
 *
 * Responsabilidades:
 * - Registrar todos los handlers disponibles
 * - Proveer factory para obtener handler por tipo
 * - Centralizar la gestión de handlers
 *
 * USO:
 * const handlers = require('./handlers');
 * const handler = handlers.getHandler('text');
 * await handler.process(message);
 */

const TextHandler = require('./text.handler');
const ImageHandler = require('./image.handler');
const AudioHandler = require('./audio.handler');
const VideoHandler = require('./video.handler');
const DocumentHandler = require('./document.handler');
const logger = require('../utils/logger');

// ===========================================
// REGISTRO DE HANDLERS
// ===========================================
// Mapeo de tipo de mensaje a su handler correspondiente

const handlerRegistry = {
  text: new TextHandler(),
  image: new ImageHandler(),
  audio: new AudioHandler(),
  video: new VideoHandler(),
  document: new DocumentHandler(),
  // Tipos adicionales pueden usar handler por defecto
  location: null,
  contact: null,
  sticker: null
};

/**
 * Obtiene el handler correspondiente a un tipo de mensaje
 * @param {string} messageType - Tipo de mensaje
 * @returns {Object|null} Instancia del handler o null
 */
const getHandler = (messageType) => {
  const handler = handlerRegistry[messageType];

  if (!handler) {
    logger.warn(`No hay handler registrado para tipo: ${messageType}`);
    return null;
  }

  return handler;
};

/**
 * Registra un nuevo handler personalizado
 * @param {string} type - Tipo de mensaje
 * @param {Object} handler - Instancia del handler
 */
const registerHandler = (type, handler) => {
  if (!handler.process || typeof handler.process !== 'function') {
    throw new Error('Handler debe implementar método process()');
  }

  handlerRegistry[type] = handler;
  logger.info(`Handler registrado para tipo: ${type}`);
};

/**
 * Lista todos los tipos de mensaje soportados
 * @returns {Array<string>} Lista de tipos soportados
 */
const getSupportedTypes = () => {
  return Object.keys(handlerRegistry).filter(type => handlerRegistry[type] !== null);
};

module.exports = {
  getHandler,
  registerHandler,
  getSupportedTypes,
  // Exportar handlers individuales por si se necesitan directamente
  TextHandler,
  ImageHandler,
  AudioHandler,
  VideoHandler,
  DocumentHandler
};
