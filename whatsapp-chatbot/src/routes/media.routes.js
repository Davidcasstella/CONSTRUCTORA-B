/**
 * ===========================================
 * RUTAS DE MEDIA (DESCARGA DE ARCHIVOS)
 * ===========================================
 *
 * Endpoint seguro para descargar archivos
 * multimedia almacenados por el sistema.
 *
 * GET /api/media/download/:messageId
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const mediaStorageService = require('../services/media-storage.service');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * GET /download/:messageId
 *
 * Descarga un archivo multimedia por su messageId.
 * Requiere autenticación.
 */
router.get('/download/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;

        if (!messageId) {
            return res.status(400).json({
                success: false,
                error: 'messageId es requerido'
            });
        }

        // Buscar archivo en el índice (ahora asíncrono con fallback a DB)
        const mediaInfo = await mediaStorageService.getMediaInfo(messageId);

        if (!mediaInfo) {
            logger.warn(`⚠️ [MEDIA-ROUTE] Archivo no encontrado para messageId: ${messageId}`);
            return res.status(404).json({
                success: false,
                error: 'Archivo no encontrado'
            });
        }

        // Obtener buffer del archivo (Local o S3)
        const fileBuffer = await mediaStorageService.getMediaBuffer(messageId);

        if (!fileBuffer) {
            return res.status(404).json({
                success: false,
                error: 'Archivo no encontrado (ni local ni en S3)'
            });
        }

        // Determinar nombre para descarga
        const downloadName = mediaInfo.fileName || `archivo_${messageId}.${mediaInfo.mimeType.split('/')[1]}`;

        // Configurar headers para descarga
        res.setHeader('Content-Type', mediaInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

        // Enviar buffer
        res.send(fileBuffer);

        logger.info(`📤 [MEDIA-ROUTE] Descargando ${mediaInfo.mediaType}: ${downloadName}`);

    } catch (error) {
        logger.error(`❌ [MEDIA-ROUTE] Error en descarga:`, error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

/**
 * GET /stream/:messageId
 *
 * Sirve un archivo multimedia para reproducción directa (audio/imagen).
 * No fuerza descarga, permite inline playback.
 * Requiere autenticación.
 */
router.get('/stream/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;
        const mediaInfo = await mediaStorageService.getMediaInfo(messageId);

        if (!mediaInfo) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado en índice' });
        }

        // Obtener buffer del archivo (Local o S3)
        const fileBuffer = await mediaStorageService.getMediaBuffer(messageId);

        if (!fileBuffer) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado (ni local ni en S3)' });
        }

        // Para streaming inline (audio player, image preview)
        res.setHeader('Content-Type', mediaInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(mediaInfo.fileName || 'file')}"`);
        // No-cache para evitar problemas de autenticación en caché
        res.setHeader('Cache-Control', 'private, no-cache');

        res.send(fileBuffer);

    } catch (error) {
        logger.error(`❌ [MEDIA-ROUTE] Error en stream:`, error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

/**
 * GET /stats
 *
 * Estadísticas del almacenamiento de media.
 */
router.get('/stats', requireAuth, (req, res) => {
    try {
        const stats = mediaStorageService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
