/**
 * ===========================================
 * ÍNDICE DE RUTAS
 * ===========================================
 *
 * Responsabilidades:
 * - Agregar todas las rutas de la aplicación
 * - Servir como punto de montaje único
 *
 * Las rutas se montan en /api (ver app.js)
 */

const express = require('express');
const multer = require('multer');
const webhookRoutes = require('./webhook.routes');
const authRoutes = require('./auth.routes');
const { router: conversationsRoutes, setSocketIO: setConversationsSocketIO } = require('./conversations.routes');
const holidaysRoutes = require('./holidays.routes');
const mediaRoutes = require('./media.routes');
const statisticsRoutes = require('./statistics.routes');
const calendarRoutes = require('./calendar.routes'); // ✅ NUEVO: Rutas del calendario
const { router: bulkRoutes, setWhatsAppClientGetter } = require('./bulk.routes');
const bulkService = require('../services/bulk.service');
const { requireAuth } = require('../middlewares/auth.middleware');
const { messageLimiter } = require('../middlewares/rate-limit.middleware');
const chatService = require('../services/chat.service');
const settingsService = require('../services/settings.service');
const knowledgeUploadService = require('../services/knowledge-upload.service');
const stagesService = require('../services/stages.service');
const metricsService = require('../services/metrics.service');
const statusesService = require('../services/statuses.service');
const sessionManager = require('../providers/whatsapp/session-manager');
// Getter for backward compat: returns session1 (the default Baileys instance)
const getBaileysProvider = () => sessionManager.getDefaultSession();
const logger = require('../utils/logger');

const router = express.Router();

// Configuración de Multer para subida de archivos (conocimiento: txt/pdf)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.pdf'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos TXT y PDF'));
    }
  }
});

// Multer for status image uploads (images only, max 8 MB)
const statusImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// Multer for status video uploads (video only, max 100 MB)
const statusVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten videos'));
    }
  }
});

// Schedule periodic status purge (every 30 minutes)
setInterval(() => {
  try { statusesService.runMaintenancePurge(); } catch (e) { /* ignore */ }
}, 30 * 60 * 1000);

// ===========================================
// MONTAJE DE RUTAS
// ===========================================

// Webhook de WhatsApp: /api/webhook
router.use('/webhook', webhookRoutes);

// Rutas de autenticación: /api/auth/*
router.use('/auth', authRoutes);

// ✅ Rate limiting estricto para envío de mensajes (20 req/min)
router.use('/conversations', messageLimiter);

// Rutas de conversaciones: /api/conversations/*
router.use('/conversations', conversationsRoutes);

// Rutas de días festivos: /api/holidays/*
router.use('/holidays', holidaysRoutes);

// Rutas de media: /api/media/*
router.use('/media', mediaRoutes);

// Statistics routes: /api/statistics/*
router.use('/statistics', statisticsRoutes);

// Bulk messaging routes: /api/bulk/*
router.use('/bulk', bulkRoutes);

// Calendar routes: /api/calendar/*
router.use('/calendar', calendarRoutes);

// ===========================================
// ✅ ENDPOINT DE MÉTRICAS
// ===========================================
router.get('/metrics', requireAuth, (req, res) => {
  try {
    const metrics = metricsService.getMetrics();
    const rateLimitStats = require('../middlewares/rate-limit.middleware').getStats();

    res.json({
      success: true,
      metrics,
      rateLimit: rateLimitStats
    });
  } catch (error) {
    logger.error('Error obteniendo métricas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ENDPOINT DE PRUEBA DEL CHAT
// ===========================================
router.post('/test-chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    logger.info(`Test chat: "${message}"`);

    // Generar respuesta
    const response = await chatService.generateTextResponse('test-user', message);

    res.json({ response });
  } catch (error) {
    logger.error('Error en test-chat:', error);
    res.status(500).json({
      error: 'Error generando respuesta',
      details: error.message
    });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE GESTIÓN DE API KEYS
// ===========================================

/**
 * GET /api/keys/status
 * Devuelve el estado de las API keys (si están configuradas o no)
 * NO devuelve las keys reales, solo si están configuradas y máscara segura
 */
router.get('/keys/status', requireAuth, (req, res) => {
  try {
    const status = settingsService.getKeysStatus();
    res.json({ success: true, keys: status });
  } catch (error) {
    logger.error('Error obteniendo estado de API keys:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/keys/:provider
 * Elimina la API key de un proveedor específico
 * Limpia: settings.json, .env y process.env
 *
 * @param provider - 'groq' o 'openai'
 */
router.delete('/keys/:provider', requireAuth, (req, res) => {
  try {
    const { provider } = req.params;

    // Validar proveedor
    if (!['groq', 'openai', 'aws'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Proveedor no válido. Use "groq", "openai" o "aws"'
      });
    }

    const success = settingsService.deleteApiKey(provider);

    if (success) {
      // Reinicializar proveedores de IA con las keys actualizadas
      try {
        const aiProvider = require('../providers/ai');
        aiProvider.reinitializeProviders();
      } catch (e) {
        logger.warn('Error reinicializando proveedores después de eliminar key:', e.message);
      }

      res.json({
        success: true,
        message: `API key de ${provider} eliminada de .env, settings.json y memoria`,
        keys: settingsService.getKeysStatus()
      });
    } else {
      res.status(500).json({ success: false, error: 'Error eliminando API key' });
    }
  } catch (error) {
    logger.error('Error eliminando API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ENDPOINTS DE CONFIGURACIÓN (PROTEGIDOS)
// ===========================================

// Obtener configuración actual
router.get('/settings', requireAuth, (req, res) => {
  try {
    const settings = settingsService.getSettings();
    res.json(settings);
  } catch (error) {
    logger.error('Error obteniendo settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Guardar configuración
router.post('/settings', requireAuth, (req, res) => {
  try {
    const { provider, groq, openai, aws } = req.body;

    const success = settingsService.saveSettings({ provider, groq, openai, aws });

    if (success) {
      // Recargar proveedores de IA con las nuevas keys
      reloadAIProviders();
      res.json({ success: true, message: 'Configuración guardada' });
    } else {
      res.status(500).json({ success: false, error: 'Error guardando configuración' });
    }
  } catch (error) {
    logger.error('Error guardando settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Probar conexión con proveedor
router.post('/test-connection', requireAuth, async (req, res) => {
  try {
    const { provider } = req.body;
    const keys = settingsService.getApiKeys();

    if (provider === 'groq') {
      if (!keys.groq.apiKey) {
        return res.json({ success: false, error: 'No hay API key de Groq configurada' });
      }

      // Probar conexión con Groq
      const OpenAI = require('openai');
      const client = new OpenAI({
        apiKey: keys.groq.apiKey,
        baseURL: 'https://api.groq.com/openai/v1'
      });

      const response = await client.chat.completions.create({
        model: keys.groq.model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Di "OK" si funciona' }],
        max_tokens: 10
      });

      if (response.choices[0]?.message?.content) {
        res.json({ success: true, message: 'Conexión exitosa con Groq' });
      } else {
        res.json({ success: false, error: 'Respuesta vacía de Groq' });
      }

    } else if (provider === 'openai') {
      if (!keys.openai.apiKey) {
        return res.json({ success: false, error: 'No hay API key de OpenAI configurada' });
      }

      // Probar conexión con OpenAI
      const OpenAI = require('openai');
      const client = new OpenAI({
        apiKey: keys.openai.apiKey
      });

      const response = await client.chat.completions.create({
        model: keys.openai.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Di "OK" si funciona' }],
        max_tokens: 10
      });

      if (response.choices[0]?.message?.content) {
        res.json({ success: true, message: 'Conexión exitosa con OpenAI' });
      } else {
        res.json({ success: false, error: 'Respuesta vacía de OpenAI' });
      }

    } else {
      res.json({ success: false, error: 'Proveedor no válido' });
    }

  } catch (error) {
    logger.error('Error probando conexión:', error);
    res.json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE CONFIGURACIÓN DE IA
// ===========================================

/**
 * GET /api/ai-settings
 * Obtiene la configuración actual de proveedores de IA
 */
router.get('/ai-settings', requireAuth, (req, res) => {
  try {
    const settings = settingsService.getSettings();

    res.json({
      success: true,
      settings: {
        chatgpt: {
          enabled: settings.openai.enabled,
          available: settings.openaiAvailable,
          model: settings.openai.model,
          apiKeyConfigured: !!settings.openai.apiKey
        },
        grok: {
          enabled: settings.groq.enabled,
          available: settings.groqAvailable,
          model: settings.groq.model,
          apiKeyConfigured: !!settings.groq.apiKey
        }
      },
      // Información de prioridad (solo informativo)
      priority: {
        primary: 'chatgpt',
        fallback: 'grok',
        note: 'ChatGPT es siempre el proveedor primario. Grok actúa como fallback.'
      }
    });
  } catch (error) {
    logger.error('Error obteniendo configuración de IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/ai-settings
 * Actualiza la configuración de proveedores de IA
 *
 * Body esperado:
 * {
 *   chatgpt: { enabled: true/false },
 *   grok: { enabled: true/false }
 * }
 *
 * NOTA: NO se permite cambiar la prioridad. Siempre es ChatGPT → Grok
 */
router.put('/ai-settings', requireAuth, (req, res) => {
  try {
    const { chatgpt, grok } = req.body;

    // Preparar objeto de configuración
    const newSettings = {};

    // Actualizar estado de ChatGPT (OpenAI)
    if (chatgpt && typeof chatgpt.enabled === 'boolean') {
      newSettings.openai = { enabled: chatgpt.enabled };
      logger.info(`🤖 ChatGPT ${chatgpt.enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    }

    // Actualizar estado de Grok
    if (grok && typeof grok.enabled === 'boolean') {
      newSettings.groq = { enabled: grok.enabled };
      logger.info(`🤖 Grok ${grok.enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    }

    // Verificar que al menos uno esté habilitado
    const currentSettings = settingsService.getApiKeys();
    const chatgptWillBeEnabled = newSettings.openai?.enabled ?? currentSettings.openai.enabled;
    const grokWillBeEnabled = newSettings.groq?.enabled ?? currentSettings.groq.enabled;

    if (!chatgptWillBeEnabled && !grokWillBeEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Debe mantener al menos un proveedor de IA activo',
        warning: 'No se puede desactivar ambos proveedores simultáneamente'
      });
    }

    // Guardar configuración
    const success = settingsService.saveSettings(newSettings);

    if (success) {
      // Reinicializar proveedores dinámicamente (SIN reiniciar servidor)
      const aiProvider = require('../providers/ai');
      aiProvider.reinitializeProviders();

      res.json({
        success: true,
        message: 'Configuración de IA actualizada',
        settings: {
          chatgpt: { enabled: chatgptWillBeEnabled },
          grok: { enabled: grokWillBeEnabled }
        }
      });
    } else {
      res.status(500).json({ success: false, error: 'Error guardando configuración' });
    }

  } catch (error) {
    logger.error('Error actualizando configuración de IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ENDPOINTS DE BASE DE CONOCIMIENTO
// ===========================================

// Subir archivo a la base de conocimiento
// ✅ CORREGIDO: stageId es OBLIGATORIO
router.post('/knowledge/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }

    // ✅ CORREGIDO: stageId es OBLIGATORIO - no permitir subida sin etapa
    const stageId = req.body.stageId || req.query.stageId || null;

    if (!stageId) {
      logger.warn('⚠️ Intento de subir archivo sin stageId');
      return res.status(400).json({
        success: false,
        error: 'Debe seleccionar una etapa antes de subir el documento'
      });
    }

    // Verificar que la etapa existe
    const stage = stagesService.getStageById(stageId);
    if (!stage) {
      logger.warn(`⚠️ Etapa no encontrada: ${stageId}`);
      return res.status(400).json({
        success: false,
        error: 'La etapa seleccionada no existe'
      });
    }

    logger.info(`📤 Subiendo archivo a etapa: ${stage.name} (${stageId})`);
    const result = await knowledgeUploadService.uploadFile(req.file, stageId);
    res.json({ success: true, file: result });

  } catch (error) {
    logger.error('Error subiendo archivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar archivos de conocimiento
router.get('/knowledge/files', requireAuth, (req, res) => {
  try {
    const files = knowledgeUploadService.getUploadedFiles();
    res.json({ success: true, files });
  } catch (error) {
    logger.error('Error listando archivos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar archivo de conocimiento
router.delete('/knowledge/files/:id', requireAuth, (req, res) => {
  try {
    knowledgeUploadService.deleteFile(req.params.id);
    res.json({ success: true, message: 'Archivo eliminado' });
  } catch (error) {
    logger.error('Error eliminando archivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ NUEVO: Descargar archivo de conocimiento
router.get('/knowledge/download/:id', requireAuth, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const fileId = req.params.id;
    const files = knowledgeUploadService.getUploadedFiles();
    const file = files.find(f => f.id === fileId);

    if (!file) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    }

    // ✅ MEJORADO: Usar ruta relativa si existe, sino buscar en ubicación principal
    let filePath;
    if (file.relativePath) {
      // Usar ruta relativa para mantener compatibilidad con carpetas
      filePath = path.join(process.cwd(), 'knowledge_files', file.relativePath);
    } else {
      // Compatibilidad con archivos antiguos (sin relativePath)
      filePath = path.join(process.cwd(), 'knowledge_files', file.fileName);

      // Si no existe en la ubicación principal, buscar en subcarpetas
      if (!fs.existsSync(filePath) && file.stageId) {
        const stagesService = require('../services/stages.service');
        const stageFolder = stagesService.getStageFolder(file.stageId);
        filePath = path.join(stageFolder, file.fileName);
      }
    }

    // Verificar que el archivo existe físicamente
    if (!fs.existsSync(filePath)) {
      logger.error(`Archivo no encontrado en disco: ${filePath}`);
      return res.status(404).json({ success: false, error: 'El archivo no existe en el servidor' });
    }

    // Enviar el archivo
    res.download(filePath, file.originalName, (err) => {
      if (err) {
        logger.error('Error descargando archivo:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error al descargar el archivo' });
        }
      }
    });

    logger.info(`📥 Archivo descargado: ${file.originalName} (${file.size} bytes)`);
  } catch (error) {
    logger.error('Error en descarga:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar en archivos de conocimiento
router.post('/knowledge/search', requireAuth, (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query requerida' });
    }

    const results = knowledgeUploadService.searchInFiles(query);
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Error buscando:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE ETAPAS (STAGES)
// ===========================================

// GET /api/stages - Obtener todas las etapas
router.get('/stages', requireAuth, (req, res) => {
  try {
    const stages = stagesService.getAllStages();
    res.json({ success: true, stages });
  } catch (error) {
    logger.error('Error obteniendo etapas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/stages - Crear nueva etapa
router.post('/stages', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    const stage = stagesService.createStage(name);
    res.json({ success: true, stage });
  } catch (error) {
    logger.error('Error creando etapa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/stages/:id - Actualizar nombre de etapa
router.put('/stages/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    }

    const stage = stagesService.updateStageName(id, name.trim());
    res.json({ success: true, stage });
  } catch (error) {
    logger.error('Error actualizando etapa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/stages/:id - Eliminar etapa
router.delete('/stages/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    stagesService.deleteStage(id);
    res.json({ success: true, message: 'Etapa eliminada correctamente' });
  } catch (error) {
    logger.error('Error eliminando etapa:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ✅ NUEVO: PATCH /api/stages/:id/toggle - Activar/desactivar etapa
router.patch('/stages/:id/toggle', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active debe ser booleano' });
    }

    const stage = stagesService.toggleStageActive(id, is_active);

    // ✅ FIX: Invalidar TODOS los caches para reflejar el cambio inmediatamente
    try {
      const embeddingsService = require('../services/embeddings.service');
      const ragOptimized = require('../services/rag-optimized.service');
      const knowledgeUploadService = require('../services/knowledge-upload.service');

      // 1. Recargar chunks de embeddings (filtra por etapas activas)
      if (embeddingsService.reloadChunks) {
        embeddingsService.reloadChunks();
      }

      // 2. Limpiar cache de queries RAG (evita servir respuestas stale por 5 min)
      if (ragOptimized.clearCache) {
        ragOptimized.clearCache();
      }

      // 3. Limpiar cache de datos de archivos (evita leer datos cacheados de etapas inactivas)
      if (knowledgeUploadService.clearFileDataCache) {
        knowledgeUploadService.clearFileDataCache();
      }

      logger.info(`✅ Todos los caches invalidados tras toggle de etapa ${id}`);
    } catch (e) {
      logger.warn('No se pudieron recargar caches:', e.message);
    }

    res.json({ success: true, stage });
  } catch (error) {
    logger.error('Error toggleando etapa:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ✅ NUEVO: PATCH /api/knowledge/files/:id/toggle - Activar/desactivar documento individual
router.patch('/knowledge/files/:id/toggle', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active debe ser booleano' });
    }

    const file = knowledgeUploadService.toggleDocumentActive(id, is_active);

    // ✅ Invalidar TODOS los caches para reflejar el cambio inmediatamente
    try {
      const embeddingsService = require('../services/embeddings.service');
      const ragOptimized = require('../services/rag-optimized.service');

      if (embeddingsService.reloadChunks) {
        embeddingsService.reloadChunks();
      }

      if (ragOptimized.clearCache) {
        ragOptimized.clearCache();
      }

      if (knowledgeUploadService.clearFileDataCache) {
        knowledgeUploadService.clearFileDataCache();
      }

      logger.info(`✅ Todos los caches invalidados tras toggle de documento ${id}`);
    } catch (e) {
      logger.warn('No se pudieron recargar caches:', e.message);
    }

    res.json({ success: true, file });
  } catch (error) {
    logger.error('Error toggleando documento:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ✅ NUEVO: Obtener archivos por etapa
router.get('/knowledge/files/stage/:stageId', requireAuth, (req, res) => {
  try {
    const { stageId } = req.params;
    const files = knowledgeUploadService.getFilesByStage(stageId);
    res.json({ success: true, files });
  } catch (error) {
    logger.error('Error obteniendo archivos de etapa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE DOCUMENTOS MANUALES
// ===========================================

/**
 * POST /api/knowledge/manual
 * Creates a new manual document from text content.
 * Body: { title, content, stageId }
 */
router.post('/knowledge/manual', requireAuth, async (req, res) => {
  try {
    const { title, content, stageId } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'El título es requerido' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'El contenido es requerido' });
    }
    if (!stageId) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar una etapa' });
    }

    // Verify stage exists
    const stage = stagesService.getStageById(stageId);
    if (!stage) {
      return res.status(400).json({ success: false, error: 'La etapa seleccionada no existe' });
    }

    logger.info(`✏️ Creating manual document: "${title}" in stage: ${stage.name}`);
    const result = await knowledgeUploadService.createManualDocument(title.trim(), content, stageId);
    res.json({ success: true, file: result });
  } catch (error) {
    logger.error('Error creating manual document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/knowledge/manual/:id
 * Updates the content of an existing document.
 * Body: { content }
 */
router.put('/knowledge/manual/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, title } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'El contenido es requerido' });
    }

    logger.info(`✏️ Updating document: ${id}${title ? ` (new title: "${title}")` : ''}`);
    const result = await knowledgeUploadService.updateManualDocument(id, content, title);
    res.json({ success: true, file: result });
  } catch (error) {
    logger.error('Error updating document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/knowledge/content/:id
 * Reads the raw text content of a document.
 */
router.get('/knowledge/content/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const result = knowledgeUploadService.getDocumentContent(id);
    res.json({ success: true, file: result });
  } catch (error) {
    logger.error('Error reading document content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /knowledge/reload
 * Reloads all knowledge base embeddings, clears caches, and refreshes RAG data.
 * Also regenerates _data.json for any documents missing their data files.
 * No server restart needed.
 */
router.post('/knowledge/reload', requireAuth, async (req, res) => {
  try {
    logger.info('🔄 [RELOAD] Recargando base de conocimiento...');

    const knowledgeUploadService = require('../services/knowledge-upload.service');
    const embeddingsService = require('../services/embeddings.service');
    const fs = require('fs');
    const path = require('path');

    // 1. Clear file data cache
    // Also ensure OPENAI_API_KEY is available in process.env (safety check)
    const settingsService = require('../services/settings.service');
    const currentKeys = settingsService.getApiKeys();
    if (currentKeys.openai && currentKeys.openai.apiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = currentKeys.openai.apiKey;
      logger.info('🔑 [RELOAD] OPENAI_API_KEY cargada desde settings');
    }
    if (typeof knowledgeUploadService.clearFileDataCache === 'function') {
      knowledgeUploadService.clearFileDataCache();
      logger.info('🧹 [RELOAD] Cache de archivos limpiado');
    }

    // 2. Check for files missing _data.json and regenerate them
    let regenerated = 0;
    const allFiles = knowledgeUploadService.getUploadedFiles();
    const KNOWLEDGE_DIR = path.join(__dirname, '../../knowledge_files');

    for (const file of allFiles) {
      try {
        // Determine the expected _data.json path
        let dataDir = KNOWLEDGE_DIR;
        if (file.relativePath) {
          dataDir = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath));
        }
        const dataPath = path.join(dataDir, `${file.id}_data.json`);

        if (!fs.existsSync(dataPath)) {
          // _data.json missing — regenerate from the original TXT file
          const filePath = file.relativePath
            ? path.join(KNOWLEDGE_DIR, file.relativePath)
            : path.join(dataDir, file.fileName);

          if (fs.existsSync(filePath) && file.type === 'txt') {
            logger.info(`🔧 [RELOAD] Regenerando _data.json para: ${file.originalName} (id: ${file.id})`);

            // Re-process the TXT file
            const processedData = await knowledgeUploadService.processTxtFile(filePath, file.originalName);

            // Generate embeddings
            try {
              const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(processedData.chunks);
              processedData.chunks = chunksWithEmbeddings;
              logger.info(`   🧠 Embeddings generados: ${chunksWithEmbeddings.length} chunks`);
            } catch (embError) {
              logger.warn(`   ⚠️ No se pudieron generar embeddings: ${embError.message}`);
            }

            // Save _data.json
            fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2));
            regenerated++;
            logger.info(`   ✅ _data.json creado: ${dataPath}`);
          } else {
            logger.warn(`   ⚠️ Archivo fuente no encontrado o no es TXT: ${filePath}`);
          }
        }
      } catch (fileErr) {
        logger.warn(`⚠️ [RELOAD] Error procesando ${file.originalName}: ${fileErr.message}`);
      }
    }

    if (regenerated > 0) {
      logger.info(`🔧 [RELOAD] ${regenerated} archivo(s) regenerados`);
    }

    // 3. Reload all chunks into memory (including newly regenerated ones)
    if (typeof embeddingsService.reloadChunks === 'function') {
      await embeddingsService.reloadChunks();
      logger.info('🔄 [RELOAD] Embeddings recargados en memoria');
    }

    // 4. Clear RAG query cache
    const ragOptimized = require('../services/rag-optimized.service');
    if (typeof ragOptimized.clearCache === 'function') {
      ragOptimized.clearCache();
      logger.info('🧹 [RELOAD] Cache de queries RAG limpiado');
    }

    // Get stats
    const stats = embeddingsService.getEmbeddingStats ? embeddingsService.getEmbeddingStats() : {};

    logger.info(`✅ [RELOAD] Base de conocimiento recargada. Chunks: ${stats.totalChunks || 'N/A'}, Regenerados: ${regenerated}`);

    res.json({
      success: true,
      message: `Base de conocimiento recargada. ${regenerated > 0 ? `${regenerated} documento(s) regenerado(s).` : ''}`,
      stats: {
        totalChunks: stats.totalChunks || 0,
        withEmbeddings: stats.withEmbeddings || 0,
        regenerated: regenerated,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`❌ [RELOAD] Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * Recarga los proveedores de IA con las nuevas configuraciones
 */
function reloadAIProviders() {
  try {
    // Limpiar cache del módulo para forzar recarga
    const aiProviderPath = require.resolve('../providers/ai');
    delete require.cache[aiProviderPath];

    const groqProviderPath = require.resolve('../providers/ai/groq.provider');
    delete require.cache[groqProviderPath];

    const openaiProviderPath = require.resolve('../providers/ai/openai.provider');
    delete require.cache[openaiProviderPath];

    logger.info('Proveedores de IA recargados');
  } catch (error) {
    logger.warn('Error recargando proveedores:', error.message);
  }
}

// ===========================================
// ✅ NUEVO: ENDPOINTS DE CONFIGURACIÓN DE HORARIO
// ===========================================
const scheduleConfig = require('../services/schedule-config.service');
const timeSimulation = require('../services/time-simulation.service');

/**
 * GET /api/settings/schedule
 * Devuelve la configuración completa de horario + estados de toggles
 */
router.get('/settings/schedule', requireAuth, (req, res) => {
  try {
    const config = scheduleConfig.getConfig();
    const formatted = scheduleConfig.getFormattedSchedule();
    const scheduleStatus = timeSimulation.getScheduleCheckStatus();

    res.json({
      success: true,
      schedule: {
        ...config,
        formatted,
        scheduleCheckEnabled: scheduleStatus.enabled,
        currentTime: scheduleStatus.currentTime,
        timezone: scheduleStatus.timezone
      }
    });
  } catch (error) {
    logger.error('Error obteniendo configuración de horario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/schedule
 * Actualiza la configuración de horario (horas inicio/fin, días)
 *
 * Body esperado (todos los campos son opcionales):
 * {
 *   weekdays: { start: 8, endHour: 16, endMinute: 30 },
 *   saturday: { start: 9, endHour: 12, endMinute: 0, enabled: true },
 *   sunday: { enabled: false }
 * }
 */
router.post('/settings/schedule', requireAuth, (req, res) => {
  try {
    const { weekdays, saturday, sunday } = req.body;

    if (!weekdays && !saturday && !sunday) {
      return res.status(400).json({
        success: false,
        error: 'Debe enviar al menos un campo para actualizar (weekdays, saturday, sunday)'
      });
    }

    const result = scheduleConfig.updateConfig({ weekdays, saturday, sunday });

    if (result.success) {
      logger.info('📅 Configuración de horario actualizada desde dashboard');
      const formatted = scheduleConfig.getFormattedSchedule();

      res.json({
        success: true,
        message: 'Horario actualizado correctamente',
        schedule: {
          ...result.config,
          formatted
        }
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Error actualizando configuración de horario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE REGLAS IA
// ===========================================

const aiRulesService = require('../services/ai-rules.service');

/**
 * GET /api/ai-rules
 * Returns all AI rules (active and inactive)
 */
router.get('/ai-rules', requireAuth, (req, res) => {
  try {
    const rules = aiRulesService.getAllRules();
    res.json({ success: true, rules });
  } catch (error) {
    logger.error('Error getting AI rules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-rules
 * Create a new AI rule
 * Body: { content: string, active?: boolean }
 */
router.post('/ai-rules', requireAuth, (req, res) => {
  try {
    const { content, active } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'El contenido de la regla es requerido' });
    }

    const rule = aiRulesService.createRule({ content, active });
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Error creating AI rule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/ai-rules/:id
 * Update an existing AI rule
 * Body: { content?: string, active?: boolean }
 */
router.put('/ai-rules/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { content, active } = req.body;
    const rule = aiRulesService.updateRule(id, { content, active });
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Error updating AI rule:', error);
    const status = error.message === 'Rule not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/ai-rules/:id
 * Delete an AI rule
 */
router.delete('/ai-rules/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    aiRulesService.deleteRule(id);
    res.json({ success: true, message: 'Regla eliminada correctamente' });
  } catch (error) {
    logger.error('Error deleting AI rule:', error);
    const status = error.message === 'Rule not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/ai-rules/:id/toggle
 * Toggle active state of an AI rule
 * Body: { active: boolean }
 */
router.patch('/ai-rules/:id/toggle', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'active debe ser booleano' });
    }

    const rule = aiRulesService.toggleRule(id, active);
    res.json({ success: true, rule });
  } catch (error) {
    logger.error('Error toggling AI rule:', error);
    const status = error.message === 'Rule not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE RESPUESTAS RÁPIDAS
// ===========================================

const fs = require('fs');
const path = require('path');
const quickRepliesFile = path.join(process.cwd(), 'data', 'quick-replies.json');



/** Helper: leer el archivo JSON de quick-replies */
function readQuickReplies() {
  try {
    if (!fs.existsSync(quickRepliesFile)) return [];
    return JSON.parse(fs.readFileSync(quickRepliesFile, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

/** Helper: guardar quick-replies en disco */
function writeQuickReplies(data) {
  fs.writeFileSync(quickRepliesFile, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * GET /api/quick-replies
 * Devuelve SOLO las respuestas rápidas activas (para el dropdown del chat)
 */
router.get('/quick-replies', requireAuth, (req, res) => {
  try {
    const all = readQuickReplies();
    const active = all.filter(r => r.active !== false);
    res.json({ success: true, quickReplies: active });
  } catch (error) {
    logger.error('Error obteniendo quick-replies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/quick-replies/all
 * Devuelve TODAS las respuestas (para la vista CRUD del dashboard)
 */
router.get('/quick-replies/all', requireAuth, (req, res) => {
  try {
    const all = readQuickReplies();
    res.json({ success: true, quickReplies: all });
  } catch (error) {
    logger.error('Error obteniendo todas las quick-replies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/quick-replies
 * Crea una nueva respuesta rápida
 * Body: { title, type, content, mediaUrl, active }
 * type: 'text' | 'image' | 'video' | 'audio' (default: 'text')
 * content: texto del mensaje (type=text) o caption opcional (multimedia)
 * mediaUrl: URL del archivo subido en S3/local (requerido para multimedia)
 */
const QUICK_REPLY_TYPES = ['text', 'image', 'video', 'audio'];

router.post('/quick-replies', requireAuth, (req, res) => {
  try {
    const { title, content, type, mediaUrl, active } = req.body;
    const replyType = QUICK_REPLY_TYPES.includes(type) ? type : 'text';

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'El título es requerido' });
    }
    if (replyType === 'text' && (!content || !content.trim())) {
      return res.status(400).json({ success: false, error: 'El contenido es requerido para respuestas de texto' });
    }
    if (replyType !== 'text' && (!mediaUrl || !mediaUrl.trim())) {
      return res.status(400).json({ success: false, error: 'La URL del archivo es requerida para respuestas multimedia' });
    }

    const all = readQuickReplies();
    const newReply = {
      id: require('crypto').randomUUID(),
      title: title.trim(),
      type: replyType,
      content: content ? content.trim() : '',
      mediaUrl: mediaUrl ? mediaUrl.trim() : '',
      active: active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    all.push(newReply);
    writeQuickReplies(all);

    logger.info(`✅ Quick reply creada: "${newReply.title}" (tipo: ${replyType})`);
    res.json({ success: true, quickReply: newReply });
  } catch (error) {
    logger.error('Error creando quick-reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/quick-replies/:id
 * Actualiza una respuesta rápida existente
 * Body: { title, type, content, mediaUrl, active }
 */
router.put('/quick-replies/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, mediaUrl, active } = req.body;

    const all = readQuickReplies();
    const idx = all.findIndex(r => r.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Respuesta rápida no encontrada' });
    }

    if (title !== undefined) all[idx].title = title.trim();
    if (content !== undefined) all[idx].content = content.trim();
    if (type !== undefined && QUICK_REPLY_TYPES.includes(type)) all[idx].type = type;
    if (mediaUrl !== undefined) all[idx].mediaUrl = mediaUrl ? mediaUrl.trim() : '';
    if (active !== undefined) all[idx].active = Boolean(active);
    all[idx].updated_at = new Date().toISOString();

    writeQuickReplies(all);

    logger.info(`✅ Quick reply actualizada: "${all[idx].title}" (tipo: ${all[idx].type || 'text'})`);
    res.json({ success: true, quickReply: all[idx] });
  } catch (error) {
    logger.error('Error actualizando quick-reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/quick-replies/:id
 * Elimina una respuesta rápida
 */
router.delete('/quick-replies/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const all = readQuickReplies();
    const idx = all.findIndex(r => r.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Respuesta rápida no encontrada' });
    }

    const removed = all.splice(idx, 1)[0];
    writeQuickReplies(all);

    logger.info(`🗑️ Quick reply eliminada: "${removed.title}"`);
    res.json({ success: true, message: 'Respuesta rápida eliminada' });
  } catch (error) {
    logger.error('Error eliminando quick-reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ WELCOME CONFIG ENDPOINTS
// ===========================================
const welcomeConfigService = require('../services/welcome-config.service');

/**
 * GET /api/welcome-config
 * Returns the full welcome configuration
 */
router.get('/welcome-config', requireAuth, (req, res) => {
  try {
    welcomeConfigService.loadConfig(); // Reload from disk to catch manual changes
    const config = welcomeConfigService.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    logger.error('Error getting welcome config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/welcome-config
 * Saves the full welcome configuration
 */
router.put('/welcome-config', requireAuth, (req, res) => {
  try {
    const success = welcomeConfigService.saveConfig(req.body);
    if (success) {
      res.json({ success: true, message: 'Welcome config saved', config: welcomeConfigService.getConfig() });
    } else {
      res.status(500).json({ success: false, error: 'Error saving config' });
    }
  } catch (error) {
    logger.error('Error saving welcome config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/welcome-config/messages
 * Adds a new welcome message
 */
router.post('/welcome-config/messages', requireAuth, (req, res) => {
  try {
    const newMsg = welcomeConfigService.addWelcomeMessage(req.body);
    res.json({ success: true, message: newMsg });
  } catch (error) {
    logger.error('Error adding welcome message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/welcome-config/messages/:id
 * Updates a welcome message
 */
router.put('/welcome-config/messages/:id', requireAuth, (req, res) => {
  try {
    const updated = welcomeConfigService.updateWelcomeMessage(req.params.id, req.body);
    if (updated) {
      res.json({ success: true, message: updated });
    } else {
      res.status(404).json({ success: false, error: 'Message not found' });
    }
  } catch (error) {
    logger.error('Error updating welcome message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/welcome-config/messages/:id
 * Deletes a welcome message
 */
router.delete('/welcome-config/messages/:id', requireAuth, (req, res) => {
  try {
    const success = welcomeConfigService.deleteWelcomeMessage(req.params.id);
    if (success) {
      res.json({ success: true, message: 'Message deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Message not found' });
    }
  } catch (error) {
    logger.error('Error deleting welcome message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/welcome-config/reorder
 * Reorders welcome messages
 * Body: { orderedIds: ['w1', 'w2', ...] }
 */
router.put('/welcome-config/reorder', requireAuth, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
    }
    welcomeConfigService.reorderWelcomeMessages(orderedIds);
    res.json({ success: true, messages: welcomeConfigService.getAllWelcomeMessages() });
  } catch (error) {
    logger.error('Error reordering welcome messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/welcome-config/consent
 * Updates consent configuration
 */
router.put('/welcome-config/consent', requireAuth, (req, res) => {
  try {
    welcomeConfigService.updateConsentConfig(req.body);
    res.json({ success: true, consent: welcomeConfigService.getConsentConfig() });
  } catch (error) {
    logger.error('Error updating consent config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/welcome-config/closure
 * Adds a closure message
 */
router.post('/welcome-config/closure', requireAuth, (req, res) => {
  try {
    const newMsg = welcomeConfigService.addClosureMessage(req.body);
    res.json({ success: true, message: newMsg });
  } catch (error) {
    logger.error('Error adding closure message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/welcome-config/closure/:id
 * Updates a closure message
 */
router.put('/welcome-config/closure/:id', requireAuth, (req, res) => {
  try {
    const updated = welcomeConfigService.updateClosureMessage(req.params.id, req.body);
    if (updated) {
      res.json({ success: true, message: updated });
    } else {
      res.status(404).json({ success: false, error: 'Closure message not found' });
    }
  } catch (error) {
    logger.error('Error updating closure message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/welcome-config/closure/:id
 * Deletes a closure message
 */
router.delete('/welcome-config/closure/:id', requireAuth, (req, res) => {
  try {
    const success = welcomeConfigService.deleteClosureMessage(req.params.id);
    if (success) {
      res.json({ success: true, message: 'Closure message deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Closure message not found' });
    }
  } catch (error) {
    logger.error('Error deleting closure message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ✅ NUEVO: ENDPOINTS DE ESTADOS (STORIES)
// ===========================================

/**
 * Internal helper: publishes a status to WhatsApp in the background.
 * Called automatically after every status creation (text/image/video).
 * Uses fire-and-forget so it never blocks the HTTP response.
 *
 * @param {object} status  - Status object returned by statusesService
 */
async function _autoPublishToWhatsApp(status) {
  const path = require('path');
  const fs   = require('fs');
  const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'statuses');

  try {
    // Wait briefly so the file is fully written to disk before reading
    await new Promise(r => setTimeout(r, 1500));

    // Verify WhatsApp is connected before attempting publish
    if (!getBaileysProvider() || !getBaileysProvider().isReady || !getBaileysProvider().sock) {
      logger.warn(`⚠️ [WA-STATUS AUTO] WhatsApp no está conectado — el estado ${status.id} se guardó en el dashboard pero NO se publicó en WhatsApp`);
      return;
    }

    let waPayload;

    if (status.type === 'text') {
      waPayload = {
        type:    'text',
        text:    status.content,
        bgColor: status.color || '#075E54',
      };
    } else if (status.type === 'image' || status.type === 'video') {
      const fileName = path.basename(status.content);
      const filePath = path.join(UPLOAD_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        logger.warn(`[WA-STATUS AUTO] Archivo no encontrado: ${filePath}`);
        return;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png',  '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',  '.webm': 'video/webm',
        '.mov': 'video/quicktime', '.ogv': 'video/ogg',
      };
      const mimetype = mimeMap[ext] || (status.type === 'video' ? 'video/mp4' : 'image/jpeg');

      waPayload = {
        type:      status.type,
        fileBuffer,
        mimetype,
        caption:   status.caption || '',
      };
    } else {
      logger.warn(`[WA-STATUS AUTO] Tipo no soportado: ${status.type}`);
      return;
    }

    logger.info(`📤 [WA-STATUS AUTO] Publicando estado ${status.id} (${status.type}) en WhatsApp...`);
    const result = await getBaileysProvider().postWhatsAppStatus(waPayload);
    logger.info(`✅ [WA-STATUS AUTO] Estado id=${status.id} publicado automáticamente en WhatsApp`);

    // Persist the WhatsApp message key so we can revoke it later when the user deletes the status
    if (result?.key?.id) {
      statusesService.saveWhatsAppKey(status.id, result.key);
    } else {
      logger.warn(`⚠️ [WA-STATUS AUTO] Estado publicado pero no se recibió key de WhatsApp — no se podrá revocar`);
    }

  } catch (err) {
    // Log but do NOT throw — the status is already saved internally
    logger.error(`❌ [WA-STATUS AUTO] Error publicando en WhatsApp (estado guardado igualmente): ${err.message}`);
  }
}

/**
 * GET /api/statuses
 * Returns all active (non-expired) statuses, newest first.
 */
router.get('/statuses', requireAuth, (req, res) => {
  try {
    const statuses = statusesService.getAllActiveStatuses();
    res.json({ success: true, statuses });
  } catch (error) {
    logger.error('Error obteniendo estados:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/statuses/text
 * Creates a text status and auto-publishes it to WhatsApp.
 * Body: { content, color, textColor }
 */
router.post('/statuses/text', requireAuth, (req, res) => {
  try {
    const { content, color, textColor } = req.body;
    const userId   = req.user?.username || req.user?.id || 'admin';
    const userName = req.user?.username || 'Admin';

    const status = statusesService.createTextStatus({ userId, userName, content, color, textColor });

    // Auto-publish to WhatsApp in background (fire-and-forget)
    _autoPublishToWhatsApp(status).catch(() => {});

    res.json({ success: true, status });
  } catch (error) {
    logger.error('Error creando estado de texto:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/statuses/image
 * Creates an image status and auto-publishes it to WhatsApp.
 * Field: 'image' (file), 'caption' (optional text)
 */
router.post('/statuses/image', requireAuth, statusImageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });
    }
    const userId   = req.user?.username || req.user?.id || 'admin';
    const userName = req.user?.username || 'Admin';
    const caption  = req.body.caption || '';

    const status = statusesService.createImageStatus({
      userId,
      userName,
      fileBuffer:   req.file.buffer,
      mimetype:     req.file.mimetype,
      originalName: req.file.originalname,
      caption,
    });

    // Auto-publish to WhatsApp in background (fire-and-forget)
    _autoPublishToWhatsApp(status).catch(() => {});

    res.json({ success: true, status });
  } catch (error) {
    logger.error('Error creando estado de imagen:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/statuses/:id
 * Deletes a status (owner only) and revokes it from WhatsApp in background.
 */
router.delete('/statuses/:id', requireAuth, (req, res) => {
  try {
    const userId = req.user?.username || req.user?.id || 'admin';

    // deleteStatus now returns the full status record (including waMessageKey if present)
    const deleted = statusesService.deleteStatus(req.params.id, userId);

    // If this status was published to WhatsApp, revoke it there too (fire-and-forget)
    if (deleted?.waMessageKey?.id) {
      getBaileysProvider().deleteWhatsAppStatus(deleted.waMessageKey).catch(err => {
        logger.warn(`⚠️ [WA-STATUS] No se pudo revocar en WhatsApp (se borró del dashboard igualmente): ${err.message}`);
      });
    } else {
      logger.info(`[WA-STATUS] Estado ${req.params.id} eliminado del dashboard sin clave WA (no fue publicado en WA o clave no guardada)`);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error eliminando estado:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/statuses/video
 * Creates a video status and auto-publishes it to WhatsApp.
 * Field: 'video' (file), 'caption' (optional text)
 */
router.post('/statuses/video', requireAuth, statusVideoUpload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún video' });
    }
    const userId   = req.user?.username || req.user?.id || 'admin';
    const userName = req.user?.username || 'Admin';
    const caption  = req.body.caption || '';

    const status = statusesService.createVideoStatus({
      userId,
      userName,
      fileBuffer:   req.file.buffer,
      mimetype:     req.file.mimetype,
      originalName: req.file.originalname,
      caption,
    });

    // Auto-publish to WhatsApp in background (fire-and-forget)
    _autoPublishToWhatsApp(status).catch(() => {});

    res.json({ success: true, status });
  } catch (error) {
    logger.error('Error creando estado de video:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/statuses/publish-to-whatsapp
 * Publishes an existing status (by ID) to WhatsApp status@broadcast.
 * The status must already exist in the dashboard (created via /api/statuses/text|image|video).
 * Body (JSON): { id } — the status ID to publish
 */
router.post('/statuses/publish-to-whatsapp', requireAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Se requiere el campo "id"' });
    }

    // Retrieve the status from the internal store
    const all = statusesService.getAllActiveStatuses();
    const status = all.find(s => s.id === id);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Estado no encontrado o expirado' });
    }

    const path = require('path');
    const fs   = require('fs');
    const UPLOAD_DIR = require('path').join(process.cwd(), 'uploads', 'statuses');

    let waPayload;

    if (status.type === 'text') {
      waPayload = {
        type:    'text',
        text:    status.content,
        bgColor: status.color || '#075E54',
      };
    } else if (status.type === 'image' || status.type === 'video') {
      const fileName = path.basename(status.content);
      const filePath = path.join(UPLOAD_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Archivo de media no encontrado en el servidor' });
      }

      const fileBuffer = fs.readFileSync(filePath);

      // Detect mimetype from extension
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png',  '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',  '.webm': 'video/webm',
        '.mov': 'video/quicktime', '.ogv': 'video/ogg',
      };
      const mimetype = mimeMap[ext] || (status.type === 'video' ? 'video/mp4' : 'image/jpeg');

      waPayload = {
        type:       status.type,
        fileBuffer,
        mimetype,
        caption:    status.caption || '',
      };
    } else {
      return res.status(400).json({ success: false, error: `Tipo de estado no soportado: ${status.type}` });
    }

    const result = await getBaileysProvider().postWhatsAppStatus(waPayload);

    // Save the WhatsApp message key so we can revoke the status when it's deleted from the dashboard
    if (result?.key?.id) {
      statusesService.saveWhatsAppKey(id, result.key);
    }

    logger.info(`[WA-STATUS] Estado id=${id} publicado en WhatsApp por ${req.user?.username}`);
    res.json({ success: true, message: 'Estado publicado en WhatsApp exitosamente' });

  } catch (error) {
    logger.error('Error publicando estado en WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = {
  router,
  setSocketIO: (io) => {
    setConversationsSocketIO(io);
    // Inject Socket.IO into bulk service for real-time progress
    bulkService.setSocketIO(io);
  },
  setWhatsAppClientGetter
};
