/**
 * ===========================================
 * BULK MESSAGING ROUTES
 * ===========================================
 *
 * All endpoints under /api/bulk/
 * Protected with requireAuth middleware
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { bulkSendLimiter } = require('../middlewares/rate-limit.middleware');
const bulkService = require('../services/bulk.service');
const bulkRepository = require('../repositories/bulk.repository');
const conversationStateService = require('../services/conversation-state.service');
const logger = require('../utils/logger');

// Multer for Excel/CSV uploads (max 10MB)
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) y CSV (.csv)'));
    }
  }
});

// WhatsApp client getter (set from server.js)
let getWhatsAppClient = null;

function setWhatsAppClientGetter(getter) {
  getWhatsAppClient = getter;
}

// ===========================================
// FILE UPLOAD
// ===========================================

/**
 * POST /api/bulk/upload
 * Upload an Excel/CSV file and create a contact list
 */
router.post('/upload', requireAuth, bulkUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }

    const result = await bulkService.uploadFileAndCreateList(
      req.file,
      req.user.username
    );

    res.json({
      success: true,
      list: result.list,
      parsed: result.parsed
    });
  } catch (error) {
    logger.error('[BULK] Upload error:', error.message || error);
    if (error.stack) logger.error('[BULK] Stack:', error.stack);
    res.status(400).json({ success: false, error: error.message || 'Error procesando el archivo' });
  }
});

// ===========================================
// MANUAL NUMBERS
// ===========================================

/**
 * POST /api/bulk/manual
 * Create a list from manually entered numbers
 * Body: { numbers: string, name?: string }
 */
router.post('/manual', requireAuth, async (req, res) => {
  try {
    const { numbers, name } = req.body;

    if (!numbers || !numbers.trim()) {
      return res.status(400).json({ success: false, error: 'Debe proporcionar números' });
    }

    const result = await bulkService.createManualList(
      numbers,
      name,
      req.user.username
    );

    res.json({
      success: true,
      list: result.list,
      parsed: result.parsed
    });
  } catch (error) {
    logger.error('[BULK] Manual list error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===========================================
// CONTACT LISTS
// ===========================================

/**
 * GET /api/bulk/lists
 * Get all contact lists
 */
router.get('/lists', requireAuth, async (req, res) => {
  try {
    const lists = await bulkRepository.getAllLists();
    res.json({ success: true, lists });
  } catch (error) {
    logger.error('[BULK] Error getting lists:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bulk/lists/:id/contacts
 * Get contacts of a list
 */
router.get('/lists/:id/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await bulkRepository.getContactsByList(req.params.id);
    res.json({ success: true, contacts, count: contacts.length });
  } catch (error) {
    logger.error('[BULK] Error getting contacts:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bulk/lists/:id
 * Delete a contact list and all its contacts
 */
router.delete('/lists/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await bulkRepository.deleteList(req.params.id);
    res.json({ success: deleted, message: deleted ? 'Lista eliminada' : 'Error eliminando lista' });
  } catch (error) {
    logger.error('[BULK] Error deleting list:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// MESSAGE PREVIEW
// ===========================================

/**
 * POST /api/bulk/preview
 * Generate preview of the message with variables
 * Body: { messageTemplate: string, listIds?: string[], contacts?: array }
 */
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const { messageTemplate, listIds, contacts: directContacts } = req.body;

    if (!messageTemplate) {
      return res.status(400).json({ success: false, error: 'Debe proporcionar el mensaje' });
    }

    let contacts = [];
    if (directContacts && directContacts.length > 0) {
      contacts = directContacts;
    } else if (listIds && listIds.length > 0) {
      for (const listId of listIds) {
        const listContacts = await bulkRepository.getContactsByList(listId);
        contacts.push(...listContacts);
      }
    }

    const previews = bulkService.generatePreview(messageTemplate, contacts);
    res.json({ success: true, previews, totalContacts: contacts.length });
  } catch (error) {
    logger.error('[BULK] Preview error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===========================================
// SEND
// ===========================================

/**
 * POST /api/bulk/send
 * Start a bulk send campaign
 * Body: { name, messageTemplate, listIds?, contacts?, batchSize?, delayMs? }
 */
router.post('/send', requireAuth, (req, res, next) => {
  // Skip rate limiter for dry-run/simulation campaigns
  if (req.body && req.body.dryRun) return next();
  return bulkSendLimiter(req, res, next);
}, async (req, res) => {
  try {
    const { name, messageTemplate, listIds, contacts, batchSize, delayMs, dryRun } = req.body;

    if (!messageTemplate || !messageTemplate.trim()) {
      return res.status(400).json({ success: false, error: 'Debe proporcionar el mensaje' });
    }

    if ((!listIds || listIds.length === 0) && (!contacts || contacts.length === 0)) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar al menos una lista o proporcionar contactos' });
    }

    // In dry-run mode, WhatsApp client is not required
    if (!dryRun && !getWhatsAppClient) {
      return res.status(500).json({ success: false, error: 'WhatsApp client no está configurado' });
    }

    const campaign = await bulkService.startCampaign({
      name,
      messageTemplate,
      listIds,
      contacts,
      batchSize: batchSize || 50,
      delayMs: delayMs || 2000,
      createdBy: req.user.username,
      dryRun: !!dryRun
    }, getWhatsAppClient);

    res.json({ success: true, campaign });
  } catch (error) {
    logger.error('[BULK] Send error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===========================================
// CAMPAIGNS
// ===========================================

/**
 * GET /api/bulk/campaigns
 * Get all campaigns (history)
 */
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    const campaigns = await bulkRepository.getAllCampaigns();
    res.json({ success: true, campaigns });
  } catch (error) {
    logger.error('[BULK] Error getting campaigns:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bulk/campaigns/:id
 * Get campaign details with messages
 */
router.get('/campaigns/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await bulkRepository.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    const messages = await bulkRepository.getBulkMessagesByCampaign(req.params.id);
    res.json({ success: true, campaign, messages });
  } catch (error) {
    logger.error('[BULK] Error getting campaign details:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bulk/campaigns/:id/status
 * Get real-time status of a campaign
 */
router.get('/campaigns/:id/status', requireAuth, async (req, res) => {
  try {
    const campaign = await bulkRepository.getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    res.json({
      success: true,
      campaignId: campaign.campaignId,
      status: campaign.status,
      sent: campaign.sent,
      failed: campaign.failed,
      pending: campaign.pending,
      total: campaign.totalRecipients,
      percent: campaign.totalRecipients > 0
        ? Math.round(((campaign.sent + campaign.failed) / campaign.totalRecipients) * 100)
        : 0
    });
  } catch (error) {
    logger.error('[BULK] Error getting campaign status:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bulk/campaigns/:id/pause
 * Pause a running campaign
 */
router.post('/campaigns/:id/pause', requireAuth, (req, res) => {
  const paused = bulkService.pauseCampaign(req.params.id);
  res.json({ success: paused, message: paused ? 'Campaña pausada' : 'Campaña no encontrada o no está activa' });
});

/**
 * POST /api/bulk/campaigns/:id/resume
 * Resume a paused campaign
 */
router.post('/campaigns/:id/resume', requireAuth, (req, res) => {
  const resumed = bulkService.resumeCampaign(req.params.id);
  res.json({ success: resumed, message: resumed ? 'Campaña reanudada' : 'Campaña no encontrada o no está pausada' });
});

/**
 * POST /api/bulk/campaigns/:id/cancel
 * Cancel a running campaign
 */
router.post('/campaigns/:id/cancel', requireAuth, (req, res) => {
  const cancelled = bulkService.cancelCampaign(req.params.id);
  res.json({ success: cancelled, message: cancelled ? 'Campaña cancelada' : 'Campaña no encontrada o ya terminó' });
});

// ===========================================
// ALL CONTACTS (Unified view)
// ===========================================

/**
 * GET /api/bulk/contacts/all
 * Get contacts with server-side pagination and search.
 * Query params:
 *   page  = 1 (default)
 *   limit = 50 (default, max 100)
 *   search = '' (filters by name or phone)
 * Merges bulk-uploaded contacts with conversation contacts.
 */

// In-memory cache to avoid re-merging on every paginated request
let _contactsCache = null;
let _contactsCacheTime = 0;
const CONTACTS_CACHE_TTL = 30000; // 30 seconds

function _buildMergedContacts() {
  // Source 1: Conversations (people who chatted)
  const conversations = conversationStateService.getAllConversations();
  const conversationContacts = conversations
    .filter(c => c.phoneNumber && c.phoneNumber.length >= 7)
    .map(c => {
      const displayName = c.customName || c.whatsappName || '';
      const nameParts = displayName.split(' ');
      return {
        phone: c.phoneNumber,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        listName: 'Conversaciones',
        source: 'conversation',
        participantId: c.participantId || c.userId,
        lastInteraction: c.lastInteraction
      };
    });

  return conversationContacts;
}

async function _getMergedContacts() {
  const now = Date.now();
  if (_contactsCache && (now - _contactsCacheTime) < CONTACTS_CACHE_TTL) {
    return _contactsCache;
  }

  // Source 1: Conversations
  const conversationContacts = _buildMergedContacts();

  // Source 2: Bulk-uploaded contacts
  let bulkContacts = [];
  try {
    const lists = await bulkRepository.getAllLists();
    for (const list of lists) {
      const contacts = await bulkRepository.getContactsByList(list.listId);
      bulkContacts.push(...contacts.map(c => ({ ...c, listName: list.name, source: 'list' })));
    }
  } catch (err) {
    logger.warn('[BULK] Could not load bulk contacts:', err.message);
  }

  // Merge: Map keyed by phone
  const contactMap = new Map();

  for (const c of conversationContacts) {
    contactMap.set(c.phone, c);
  }

  for (const c of bulkContacts) {
    if (contactMap.has(c.phone)) {
      const existing = contactMap.get(c.phone);
      if (!existing.firstName && c.firstName) {
        existing.firstName = c.firstName;
        existing.lastName = c.lastName || existing.lastName;
      }
      if (c.listName && c.listName !== 'Conversaciones') {
        existing.listName = c.listName;
      }
    } else {
      contactMap.set(c.phone, c);
    }
  }

  _contactsCache = Array.from(contactMap.values());
  _contactsCacheTime = now;
  return _contactsCache;
}

/**
 * Helper to normalize string for search (diacritic and case insensitive)
 */
function _normalizeForSearch(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

router.get('/contacts/all', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();

    const allContacts = await _getMergedContacts();

    // Filter by search term (server-side)
    let filtered = allContacts;
    if (search) {
      const searchNorm = _normalizeForSearch(search);
      filtered = allContacts.filter(c => {
        const fullNameNorm = _normalizeForSearch(`${c.firstName || ''} ${c.lastName || ''}`);
        return fullNameNorm.includes(searchNorm) || c.phone.includes(searchNorm);
      });
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const pageContacts = filtered.slice(start, start + limit);

    res.json({
      success: true,
      contacts: pageContacts,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages
    });
  } catch (error) {
    logger.error('[BULK] Error getting all contacts:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bulk/contacts/add
 * Add a single contact manually
 * Body: { name, phone, listId? }
 */
router.post('/contacts/add', requireAuth, async (req, res) => {
  try {
    const { name, phone, listId } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Teléfono requerido' });

    const normalizedPhone = bulkService.normalizeColombianPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, error: 'Número de teléfono inválido' });
    }

    // Use provided list or find/create a default "Contactos Manuales" list
    let targetListId = listId;
    if (!targetListId) {
      const lists = await bulkRepository.getAllLists();
      let manualList = lists.find(l => l.name === 'Contactos Manuales' && l.type === 'manual');
      if (!manualList) {
        manualList = await bulkRepository.createList({
          name: 'Contactos Manuales',
          type: 'manual',
          contactCount: 0
        });
      }
      targetListId = manualList.listId;
    }

    const contacts = await bulkRepository.addContacts(targetListId, [{
      phone: normalizedPhone,
      firstName: name || '',
      lastName: ''
    }]);

    res.json({ success: true, contact: contacts[0] });
  } catch (error) {
    logger.error('[BULK] Error adding contact:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===========================================
// CAMPAIGN DRAFTS
// ===========================================

/**
 * POST /api/bulk/campaigns/draft
 * Save a campaign as draft
 * Body: { name, messageTemplate, contactPhones?, scheduledAt? }
 */
router.post('/campaigns/draft', requireAuth, async (req, res) => {
  try {
    const { name, messageTemplate, contactPhones, scheduledAt } = req.body;
    if (!name || !messageTemplate) {
      return res.status(400).json({ success: false, error: 'Nombre y mensaje son requeridos' });
    }
    const campaign = await bulkRepository.createCampaign({
      name,
      messageTemplate,
      totalRecipients: contactPhones?.length || 0,
      status: 'draft',
      scheduledAt: scheduledAt || null,
      createdBy: req.user?.username || 'admin'
    });
    res.json({ success: true, campaign });
  } catch (error) {
    logger.error('[BULK] Error creating draft:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===========================================
// RENAME LIST
// ===========================================

/**
 * PUT /api/bulk/lists/:id
 * Rename a contact list
 * Body: { name: string }
 */
router.put('/lists/:id', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nombre requerido' });
    }
    await bulkRepository.updateListName(req.params.id, name.trim());
    // Invalidate contacts cache
    _contactsCache = null;
    res.json({ success: true, message: 'Lista renombrada' });
  } catch (error) {
    logger.error('[BULK] Error renaming list:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// MESSAGE TEMPLATES
// ===========================================

/**
 * GET /api/bulk/templates
 * Get all message templates
 */
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const templates = await bulkRepository.getAllTemplates();
    res.json({ success: true, templates });
  } catch (error) {
    logger.error('[BULK] Error getting templates:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bulk/templates
 * Create a message template
 * Body: { name: string, messageTemplate: string }
 */
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const { name, messageTemplate } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nombre requerido' });
    }
    if (!messageTemplate || !messageTemplate.trim()) {
      return res.status(400).json({ success: false, error: 'Mensaje requerido' });
    }
    const template = await bulkRepository.createTemplate({
      name: name.trim(),
      messageTemplate: messageTemplate.trim(),
      createdBy: req.user?.username || 'admin'
    });
    res.json({ success: true, template });
  } catch (error) {
    logger.error('[BULK] Error creating template:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/bulk/templates/:id
 * Update a message template
 * Body: { name?: string, messageTemplate?: string }
 */
router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const { name, messageTemplate } = req.body;
    await bulkRepository.updateTemplate(req.params.id, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(messageTemplate !== undefined ? { messageTemplate: messageTemplate.trim() } : {})
    });
    res.json({ success: true, message: 'Plantilla actualizada' });
  } catch (error) {
    logger.error('[BULK] Error updating template:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bulk/templates/:id
 * Delete a message template
 */
router.delete('/templates/:id', requireAuth, async (req, res) => {
  try {
    await bulkRepository.deleteTemplate(req.params.id);
    res.json({ success: true, message: 'Plantilla eliminada' });
  } catch (error) {
    logger.error('[BULK] Error deleting template:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = {
  router,
  setWhatsAppClientGetter
};

