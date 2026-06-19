/**
 * ===========================================
 * MIDDLEWARE DE SUBIDA DE ARCHIVOS
 * ===========================================
 *
 * Responsabilidades:
 * - Configurar multer para recepción de archivos
 * - Validar tipos de archivo permitidos
 * - Limitar tamaño de archivos
 * - Definir destino de almacenamiento temporal
 *
 * NOTA: Los archivos de WhatsApp vienen como URLs,
 * no como uploads directos. Este middleware es para
 * rutas adicionales que requieran subida de archivos.
 */

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { AppError } = require('./error.middleware');

// ===========================================
// CONFIGURACIÓN DE ALMACENAMIENTO
// ===========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.media.uploadDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único para evitar colisiones
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// ===========================================
// FILTRO DE TIPOS DE ARCHIVO
// ===========================================
const fileFilter = (req, file, cb) => {
  const logger = require('../utils/logger');

  // Debug: Log información del archivo
  logger.info(`📁 archivo recibido: originalname="${file.originalname}", mimetype="${file.mimetype}"`);
  logger.info(`📋 Extensiones permitidas: ${config.media.allowedExtensions.join(', ')}`);

  let extension = path.extname(file.originalname).toLowerCase().slice(1);

  // ✅ CORRECCIÓN: Si no hay extensión en el nombre, inferirla del mimetype
  // Esto es necesario para Blobs de MediaRecorder que no tienen nombre con extensión
  if (!extension && file.mimetype) {
    const mimeToExt = {
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt'
    };

    extension = mimeToExt[file.mimetype] || '';
    logger.info(`🔍 Extensión inferida desde mimetype: "${extension}"`);

    // ✅ Actualizar originalname con la extensión inferida para filename en storage
    if (extension) {
      file.originalname = `recording.${extension}`;
    }
  }

  if (extension && config.media.allowedExtensions.includes(extension)) {
    logger.info(`✅ Archivo válido: ${extension}`);
    cb(null, true);
  } else {
    logger.error(`❌ Tipo de archivo no permitido: extension="${extension}", mimetype="${file.mimetype}"`);
    // ✅ Usar Error en lugar de AppError para mejor compatibilidad con multer
    const error = new Error(`Tipo de archivo no permitido: ${extension || 'sin extensión'} (mimetype: ${file.mimetype})`);
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// ===========================================
// CONFIGURACIÓN DE MULTER
// ===========================================
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.media.maxFileSizeMB * 1024 * 1024, // Convertir MB a bytes
    files: 5 // Máximo de archivos por petición
  }
});

// ===========================================
// MIDDLEWARES EXPORTADOS
// ===========================================

// Para un solo archivo
const single = (fieldName = 'file') => upload.single(fieldName);

// Para múltiples archivos del mismo campo
const multiple = (fieldName = 'files', maxCount = 5) =>
  upload.array(fieldName, maxCount);

// Para campos específicos
const fields = (fieldsConfig) => upload.fields(fieldsConfig);

module.exports = {
  single,
  multiple,
  fields,
  upload // Exportar instancia completa por si se necesita
};
