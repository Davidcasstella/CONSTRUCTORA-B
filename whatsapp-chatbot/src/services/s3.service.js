/**
 * ===========================================
 * SERVICIO DE ALMACENAMIENTO S3
 * ===========================================
 *
 * Responsabilidades:
 * - Subir archivos multimedia a S3
 * - Descargar archivos desde S3
 * - Organizar por tipo: imagenes/, audios/, pdfs/, documentos/, videos/
 *
 * IMPORTANTE: Este servicio es complementario al almacenamiento local.
 * Los archivos se guardan primero en disco y luego se suben a S3.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');
const logger = require('../utils/logger');

// ===========================================
// CONFIGURACIÓN DEL CLIENTE S3
// ===========================================
const BUCKET = config.s3.bucket;
const REGION = config.s3.region;

let s3Client = null;

function getClient() {
    if (!s3Client) {
        s3Client = new S3Client({ region: REGION });
    }
    return s3Client;
}

/**
 * Determina la carpeta S3 según el tipo de media
 */
function getS3Folder(mimeType) {
    if (!mimeType) return 'otros';
    if (mimeType.startsWith('image/')) return 'imagenes';
    if (mimeType.startsWith('audio/')) return 'audios';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType === 'application/pdf') return 'pdfs';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'documentos';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'documentos';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'documentos';
    if (mimeType === 'text/plain') return 'documentos';
    return 'otros';
}

/**
 * Sube un archivo a S3
 *
 * @param {string} key - Ruta/nombre del archivo en S3
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Object} { s3Key, s3Url }
 */
async function uploadFile(key, buffer, mimeType) {
    if (!BUCKET) {
        logger.debug('[S3] S3 no configurado, saltando upload');
        return null;
    }

    try {
        const client = getClient();
        await client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        }));

        const s3Url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
        logger.info(`☁️ [S3] Archivo subido: ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);

        return { s3Key: key, s3Url };
    } catch (error) {
        logger.error(`❌ [S3] Error subiendo archivo: ${error.message}`);
        return null;
    }
}

/**
 * Descarga un archivo desde S3
 *
 * @param {string} key - Ruta/nombre del archivo en S3
 * @returns {Buffer|null}
 */
async function downloadFile(key) {
    logger.debug(`[DEBUG-S3] downloadFile called for key: ${key}. BUCKET=${BUCKET || 'MISSING'}`);
    if (!BUCKET) {
        return null;
    }

    try {
        const client = getClient();
        const response = await client.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        }));

        // Convertir stream a buffer
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        logger.info(`☁️ [S3] Archivo descargado: ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
        return buffer;
    } catch (error) {
        logger.error(`❌ [S3] Error descargando archivo: ${error.message}`);
        return null;
    }
}

/**
 * Genera la key S3 para un archivo multimedia
 *
 * @param {string} mimeType
 * @param {string} fileName - Nombre del archivo (con extensión)
 * @param {string} chatId - ID del chat
 * @returns {string} key para S3
 */
function generateS3Key(mimeType, fileName, chatId) {
    const folder = getS3Folder(mimeType);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${folder}/${chatId}/${safeName}`;
}

module.exports = {
    uploadFile,
    downloadFile,
    generateS3Key,
    getS3Folder,
};
