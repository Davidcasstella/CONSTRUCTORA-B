/**
 * ===========================================
 * SERVICIO DE MEDIA (ARCHIVOS MULTIMEDIA)
 * ===========================================
 *
 * Responsabilidades:
 * - Descargar archivos multimedia de WhatsApp
 * - Almacenar archivos temporalmente
 * - Limpiar archivos después de procesarlos
 * - Convertir formatos si es necesario
 *
 * IMPORTANTE: Los archivos de WhatsApp vienen como
 * referencias (IDs o URLs). Este servicio se encarga
 * de obtener el archivo real.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config');
const whatsappProvider = require('../providers/whatsapp');

/**
 * Descarga un archivo multimedia de WhatsApp
 * @param {string} mediaId - ID del archivo en WhatsApp
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<string>} Path al archivo descargado
 */
const downloadMedia = async (mediaId, mimeType) => {
  try {
    logger.debug(`Descargando media: ${mediaId}`);

    // 1. Obtener URL de descarga del proveedor
    const mediaUrl = await whatsappProvider.getMediaUrl(mediaId);

    // 2. Descargar el archivo
    const buffer = await whatsappProvider.downloadMedia(mediaUrl);

    // 3. Determinar extensión según mime type
    const extension = getExtensionFromMime(mimeType);

    // 4. Guardar archivo temporal
    const filename = `${uuidv4()}${extension}`;
    const filepath = path.join(config.media.uploadDir, filename);

    await fs.writeFile(filepath, buffer);

    logger.info(`Media descargada: ${filepath}`);
    return filepath;

  } catch (error) {
    logger.error('Error descargando media:', error);
    throw error;
  }
};

/**
 * Elimina un archivo temporal
 * @param {string} filepath - Path al archivo
 */
const deleteMedia = async (filepath) => {
  try {
    await fs.unlink(filepath);
    logger.debug(`Archivo eliminado: ${filepath}`);
  } catch (error) {
    // No lanzar error si el archivo no existe
    if (error.code !== 'ENOENT') {
      logger.warn('Error eliminando archivo:', error);
    }
  }
};

/**
 * Limpia archivos antiguos del directorio de uploads
 * @param {number} maxAgeMinutes - Edad máxima en minutos
 */
const cleanupOldFiles = async (maxAgeMinutes = 60) => {
  try {
    const uploadDir = config.media.uploadDir;
    const files = await fs.readdir(uploadDir);
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    let deletedCount = 0;

    for (const file of files) {
      // Ignorar .gitkeep y otros archivos del sistema
      if (file.startsWith('.')) continue;

      const filepath = path.join(uploadDir, file);
      const stats = await fs.stat(filepath);

      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filepath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Limpieza: ${deletedCount} archivos eliminados`);
    }

  } catch (error) {
    logger.error('Error en limpieza de archivos:', error);
  }
};

/**
 * Obtiene la extensión de archivo según el MIME type
 */
const getExtensionFromMime = (mimeType) => {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/webm': '.webm',  // ✅ Agregado para audio del navegador
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/3gpp': '.3gp',
    'video/quicktime': '.mov',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt'
  };

  return mimeMap[mimeType] || '.bin';
};

/**
 * Verifica si el tipo de archivo está permitido
 */
const isAllowedFileType = (mimeType) => {
  const extension = getExtensionFromMime(mimeType).slice(1); // Quitar el punto
  return config.media.allowedExtensions.includes(extension);
};

/**
 * Obtiene información de un archivo
 */
const getFileInfo = async (filepath) => {
  try {
    const stats = await fs.stat(filepath);
    return {
      path: filepath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    return null;
  }
};

/**
 * Formatea bytes a formato legible
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * ===========================================
 * ✅ NUEVAS FUNCIONES PARA CARGA DE ARCHIVOS
 * ===========================================
 * Para enviar archivos desde el dashboard
 */

/**
 * Tipos de archivo permitidos para carga desde dashboard
 */
const ALLOWED_UPLOAD_TYPES = {
  audio: ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/webm'],  // ✅ Agregado webm
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/3gpp', 'video/quicktime'],  // ✅ Agregado video
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]  // ✅ PDF, Word, Excel, PowerPoint, TXT
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Guarda un archivo subido desde el dashboard
 * @param {Object} file - Archivo desde multer o buffer
 * @param {string} type - Tipo de archivo ('audio', 'image', 'document')
 * @returns {Promise<Object>} Información del archivo guardado
 */
const saveUploadedFile = async (file, type) => {
  try {
    // Validar tamaño
    const fileSize = file.size || (file.buffer ? file.buffer.length : 0);
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`Archivo demasiado grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validar tipo MIME
    const mimeType = file.mimetype;
    const allowedTypes = ALLOWED_UPLOAD_TYPES[type];
    if (!allowedTypes || !allowedTypes.includes(mimeType)) {
      throw new Error(`Tipo de archivo no permitido para ${type}: ${mimeType}`);
    }

    // Generar nombre único
    const extension = getExtensionFromMime(mimeType);
    const filename = `${Date.now()}_${uuidv4()}${extension}`;

    // ✅ NUEVO: Convertir a ruta absoluta
    const baseUploadDir = path.resolve(config.media.uploadDir);
    const uploadDir = path.join(baseUploadDir, type);

    // Crear directorio si no existe
    await fs.mkdir(uploadDir, { recursive: true });

    // Guardar archivo
    const filepath = path.join(uploadDir, filename);

    // Obtener buffer para guardado y posible subida a S3
    let fileBuffer = null;
    if (file.buffer) {
      // Archivo desde memoria (multer memoryStorage)
      fileBuffer = file.buffer;
      await fs.writeFile(filepath, fileBuffer);
    } else if (file.path) {
      // Archivo temporal (multer diskStorage)
      await fs.copyFile(file.path, filepath);
      // Leer buffer para S3
      fileBuffer = await fs.readFile(filepath);
    }

    logger.info(`Archivo guardado: ${filepath} (${type})`);

    // ✅ FIX: Subir a S3 en segundo plano (fire & forget)
    let s3Url = null;
    if (config.s3 && config.s3.enabled && fileBuffer) {
      try {
        const s3Service = require('./s3.service');
        const s3Key = s3Service.generateS3Key(mimeType, filename, 'dashboard_uploads');
        s3Service.uploadFile(s3Key, fileBuffer, mimeType)
          .then(result => {
            if (result) {
              logger.info(`☁️ [S3] Archivo de dashboard sincronizado: ${result.s3Key}`);
            }
          })
          .catch(err => logger.error(`❌ [S3] Error sincronizando archivo de dashboard: ${err.message}`));
      } catch (s3Error) {
        logger.warn(`⚠️ [S3] No se pudo iniciar sync: ${s3Error.message}`);
      }
    }

    return {
      filename,
      filepath,  // ✅ Ruta absoluta al archivo
      originalname: file.originalname || 'archivo',
      mimetype: mimeType,
      size: fileSize,
      type,
      // ✅ URL completa para frontend - incluir /api/conversations
      url: `/api/conversations/uploads/${type}/${filename}`
    };
  } catch (error) {
    logger.error('Error guardando archivo subido:', error);
    throw error;
  }
};

/**
 * Obtiene un archivo por su URL relativa
 * @param {string} url - URL relativa del archivo
 * @returns {Promise<Object>} Información del archivo
 */
const getFileByUrl = async (url) => {
  try {
    // Extraer tipo y nombre de la URL: /uploads/audio/file.mp3
    const match = url.match(/\/uploads\/(\w+)\/(.+)/);
    if (!match) {
      throw new Error('URL inválida');
    }

    const [, type, filename] = match;
    const filepath = path.join(config.media.uploadDir, type, filename);

    const stats = await fs.stat(filepath);
    const fileBuffer = await fs.readFile(filepath);

    return {
      filepath,
      buffer: fileBuffer,
      mimetype: getMimeTypeFromFilename(filename),
      size: stats.size
    };
  } catch (error) {
    logger.error('Error obteniendo archivo por URL:', error);
    throw error;
  }
};

/**
 * Obtiene el buffer de un archivo subido desde el dashboard (con fallback a S3).
 * @param {string} type - Tipo (image, audio, video, document)
 * @param {string} filename - Nombre del archivo
 * @returns {Promise<Buffer|null>}
 */
const getDashboardMediaBuffer = async (type, filename) => {
  try {
    const baseUploadDir = path.resolve(config.media.uploadDir);
    const localPath = path.join(baseUploadDir, type, filename);

    logger.debug(`🔍 [MEDIA-SERVICE] getDashboardMediaBuffer: searching for ${type}/${filename}`);
    logger.debug(`[DEBUG-S3] Config Status: enabled=${config.s3?.enabled}, bucket=${config.s3?.bucket}`);

    // 1. Intentar local
    if (fsSync.existsSync(localPath)) {
      logger.debug(`📄 Serving dashboard upload from local storage: ${filename}`);
      return await fs.readFile(localPath);
    }

    // 2. Fallback a S3
    if (config.s3 && config.s3.enabled) {
      const s3Service = require('./s3.service');
      const mimeType = getMimeTypeFromFilename(filename);
      // Los uploads del dashboard usan 'dashboard_uploads' como chatId para la estructura de carpetas S3
      const s3Key = s3Service.generateS3Key(mimeType, filename, 'dashboard_uploads');

      logger.info(`☁️ [MEDIA-SERVICE] Local file not found, attempting S3 fallback: ${s3Key}`);
      const buffer = await s3Service.downloadFile(s3Key);

      if (buffer) {
        // Guardar en caché local para futuros accesos
        try {
          await fs.mkdir(path.dirname(localPath), { recursive: true });
          await fs.writeFile(localPath, buffer);
          logger.info(`✅ [MEDIA-SERVICE] Recovered and cached from S3: ${filename}`);
        } catch (cacheErr) {
          logger.warn(`⚠️ [MEDIA-SERVICE] Failed to cache file locally: ${cacheErr.message}`);
        }
        return buffer;
      }
    }

    return null;
  } catch (error) {
    logger.error(`❌ [MEDIA-SERVICE] Error in getDashboardMediaBuffer: ${error.message}`);
    return null;
  }
};

/**
 * Obtiene el MIME type según el nombre de archivo
 */
const getMimeTypeFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.3gp': 'video/3gpp',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain'
  };

  return mimeMap[ext] || 'application/octet-stream';
};

/**
 * Valida un archivo antes de subirlo
 * @param {Object} file - Archivo a validar
 * @param {string} type - Tipo esperado
 * @returns {Object}} Resultado de validación
 */
const validateUploadedFile = (file, type) => {
  const errors = [];

  // Validar tamaño
  const fileSize = file.size || (file.buffer ? file.buffer.length : 0);
  if (fileSize > MAX_FILE_SIZE) {
    errors.push(`Archivo excede los ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Validar tipo MIME
  const mimeType = file.mimetype;
  const allowedTypes = ALLOWED_UPLOAD_TYPES[type];
  if (!allowedTypes) {
    errors.push(`Tipo de archivo no válido: ${type}`);
  } else if (!allowedTypes.includes(mimeType)) {
    errors.push(`Tipo MIME no permitido: ${mimeType}. Permitidos: ${allowedTypes.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  downloadMedia,
  deleteMedia,
  cleanupOldFiles,
  getExtensionFromMime,
  isAllowedFileType,
  getFileInfo,
  // ✅ Nuevas funciones
  saveUploadedFile,
  getFileByUrl,
  getMimeTypeFromFilename,
  getDashboardMediaBuffer,
  validateUploadedFile,
  // Constantes
  ALLOWED_UPLOAD_TYPES,
  MAX_FILE_SIZE
};
