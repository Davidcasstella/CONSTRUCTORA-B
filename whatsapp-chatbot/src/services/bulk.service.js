/**
 * ===========================================
 * BULK MESSAGING SERVICE
 * ===========================================
 *
 * Business logic for:
 * - Parsing Excel/CSV files
 * - Normalizing Colombian phone numbers
 * - Managing contact lists and groups
 * - Executing bulk sends with rate limiting
 * - Campaign progress tracking via Socket.IO
 */

const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const bulkRepository = require('../repositories/bulk.repository');
const conversationRepository = require('../repositories/conversation.repository');
const conversationStateService = require('./conversation-state.service');
const { Message } = require('../models/message.model');

// Maximum contacts per campaign
const MAX_CONTACTS_PER_CAMPAIGN = 1000;

// Maximum concurrent campaigns (prevent spam/ban risk)
const MAX_CONCURRENT_CAMPAIGNS = 1;

// Minimum delay between messages (ms)
const MIN_DELAY_MS = 2000;

// Column name mappings for fuzzy detection
const COLUMN_MAPPINGS = {
  phone: ['telefono', 'teléfono', 'numero', 'número', 'celular', 'cel', 'phone', 'mobile', 'whatsapp', 'tel', 'movil', 'móvil', 'contacto', 'nro', 'num'],
  firstName: ['nombre', 'nombre1', 'nombre2', 'first_name', 'firstname', 'name', 'nombres', 'primer_nombre'],
  lastName: ['apellido', 'apellido1', 'apellido2', 'last_name', 'lastname', 'surname', 'apellidos', 'primer_apellido']
};

// Active campaigns (in-memory for pause/resume control)
const activeCampaigns = new Map();

// Socket.IO reference (set from server.js)
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

// ===========================================
// FILE PARSING
// ===========================================

/**
 * Parse an Excel or CSV file buffer and extract contacts
 * Supports files WITH and WITHOUT headers
 * @param {Buffer} buffer - File content
 * @param {string} originalName - Original file name
 * @returns {Object} { contacts, columns, totalRows, warnings }
 */
function parseFile(buffer, originalName) {
  const ext = originalName.toLowerCase().split('.').pop();

  let workbook;
  if (ext === 'csv') {
    const csvText = buffer.toString('utf-8');
    workbook = XLSX.read(csvText, { type: 'string' });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // First, read as array of arrays (no header assumption)
  const rawArrays = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawArrays || rawArrays.length === 0) {
    throw new Error('El archivo está vacío o no tiene datos válidos');
  }

  // Determine if first row is a header or data
  const firstRow = rawArrays[0];
  const hasHeaders = detectIfFirstRowIsHeader(firstRow);

  let columnMap;
  let dataRows;
  const warnings = [];

  if (hasHeaders) {
    // Standard case: first row is headers
    const headers = firstRow.map(h => String(h).trim());
    columnMap = detectColumns(headers);
    dataRows = rawArrays.slice(1);

    if (!columnMap.phone) {
      throw new Error('No se encontró una columna de teléfono/número. Columnas: ' + headers.join(', '));
    }

    logger.info(`[BULK] File parsed with headers: phone=${columnMap.phone}, name=${columnMap.firstName}, surname=${columnMap.lastName}`);
  } else {
    // No headers: auto-detect columns by analyzing data content
    columnMap = autoDetectColumnsByContent(rawArrays);
    dataRows = rawArrays; // All rows are data

    if (columnMap.phone === null) {
      throw new Error('No se pudo detectar la columna de teléfono automáticamente');
    }

    warnings.push('Archivo sin encabezados — columnas detectadas automáticamente');
    logger.info(`[BULK] File parsed WITHOUT headers: phoneCol=${columnMap.phone}, nameCol=${columnMap.firstName}, surnameCol=${columnMap.lastName}`);
  }

  // Extract contacts
  const contacts = [];
  const seenPhones = new Set();
  let duplicates = 0;
  let invalidNumbers = 0;

  for (const row of dataRows) {
    // Skip completely empty rows
    if (!row || row.every(cell => !cell && cell !== 0)) continue;

    let rawPhone, rawFirstName, rawLastName;

    if (hasHeaders) {
      // Column map contains header names
      const headers = rawArrays[0].map(h => String(h).trim());
      const phoneIdx = headers.indexOf(columnMap.phone);
      const firstNameIdx = columnMap.firstName ? headers.indexOf(columnMap.firstName) : -1;
      const lastNameIdx = columnMap.lastName ? headers.indexOf(columnMap.lastName) : -1;
      rawPhone = String(row[phoneIdx] || '').trim();
      rawFirstName = firstNameIdx >= 0 ? String(row[firstNameIdx] || '').trim() : null;
      rawLastName = lastNameIdx >= 0 ? String(row[lastNameIdx] || '').trim() : null;
    } else {
      // Column map contains column indices
      rawPhone = String(row[columnMap.phone] || '').trim();
      rawFirstName = columnMap.firstName !== null ? String(row[columnMap.firstName] || '').trim() : null;
      rawLastName = columnMap.lastName !== null ? String(row[columnMap.lastName] || '').trim() : null;
    }

    const phone = normalizeColombianPhone(rawPhone);

    if (!phone) {
      invalidNumbers++;
      continue;
    }

    if (seenPhones.has(phone)) {
      duplicates++;
      continue;
    }
    seenPhones.add(phone);

    contacts.push({
      phone,
      firstName: rawFirstName || null,
      lastName: rawLastName || null
    });
  }

  if (duplicates > 0) {
    warnings.push(`${duplicates} número(s) duplicado(s) removido(s)`);
  }
  if (invalidNumbers > 0) {
    warnings.push(`${invalidNumbers} número(s) inválido(s) omitido(s)`);
  }
  if (contacts.length > MAX_CONTACTS_PER_CAMPAIGN) {
    warnings.push(`Solo se cargarán los primeros ${MAX_CONTACTS_PER_CAMPAIGN} contactos (de ${contacts.length} encontrados)`);
    contacts.splice(MAX_CONTACTS_PER_CAMPAIGN);
  }

  return {
    contacts,
    columns: {
      phone: hasHeaders ? columnMap.phone : `Columna ${columnMap.phone + 1}`,
      firstName: hasHeaders ? columnMap.firstName : (columnMap.firstName !== null ? `Columna ${columnMap.firstName + 1}` : null),
      lastName: hasHeaders ? columnMap.lastName : (columnMap.lastName !== null ? `Columna ${columnMap.lastName + 1}` : null),
      detected: hasHeaders ? rawArrays[0].map(h => String(h).trim()) : [`Col A`, `Col B`, `Col C`],
      autoDetected: !hasHeaders
    },
    totalRows: dataRows.length,
    validContacts: contacts.length,
    warnings
  };
}

/**
 * Helper to match a cell value with a column header alias.
 * Prevents false positives with substrings (e.g., "Castellanos" containing "tel").
 * @param {any} cellVal - The raw cell value
 * @param {string} alias - The alias string to compare
 * @returns {boolean} True if matches
 */
function matchAlias(cellVal, alias) {
  if (!cellVal) return false;
  const val = String(cellVal).toLowerCase().trim().replace(/[_\s-]+/g, ' ');
  const normalizedAlias = alias.toLowerCase().replace(/[_\s-]+/g, ' ');

  // Exact match
  if (val === normalizedAlias) return true;

  // Split by non-alphanumeric to check full word matching
  const words = val.split(/[^a-z0-9]+/);
  const aliasWords = normalizedAlias.split(/[^a-z0-9]+/);

  if (aliasWords.length === 1) {
    const singleAlias = aliasWords[0];
    // For short aliases (like "tel", "cel", "num", "nro"), enforce exact word match to avoid substring false positives
    if (singleAlias.length < 4) {
      return words.includes(singleAlias);
    } else {
      // For longer aliases, allow if any word starts with or includes the alias
      return words.some(w => w.includes(singleAlias) || singleAlias.includes(w));
    }
  } else {
    // Multi-word alias: check substring match in the space-normalized value
    return val.includes(normalizedAlias);
  }
}

/**
 * Check if the first row looks like a header row
 * Headers are typically text labels, not phone numbers or proper names
 */
function detectIfFirstRowIsHeader(row) {
  if (!row || row.length === 0) return false;

  // 1. FIRST check: If any cell looks like a phone number (7+ digits), it's highly likely data, not a header
  for (const cell of row) {
    const digits = String(cell).replace(/\D/g, '');
    if (digits.length >= 7) {
      return false;
    }
  }

  // 2. SECOND check: If any cell in the first row matches a known header name, it's a header
  for (const cell of row) {
    const allAliases = [
      ...COLUMN_MAPPINGS.phone,
      ...COLUMN_MAPPINGS.firstName,
      ...COLUMN_MAPPINGS.lastName
    ];
    for (const alias of allAliases) {
      if (matchAlias(cell, alias)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Auto-detect column roles by analyzing cell content
 * Looks for which column contains phone numbers, and assigns others as name/surname
 */
function autoDetectColumnsByContent(rows) {
  const result = { phone: null, firstName: null, lastName: null };
  const sampleSize = Math.min(rows.length, 10);
  const numCols = Math.max(...rows.slice(0, sampleSize).map(r => r.length));

  if (numCols === 0) return result;

  // Score each column: how many values look like phone numbers?
  const phoneScores = [];
  for (let col = 0; col < numCols; col++) {
    let score = 0;
    for (let row = 0; row < sampleSize; row++) {
      const val = String(rows[row]?.[col] || '').trim();
      const digits = val.replace(/\D/g, '');
      // Colombian mobile: 10 digits starting with 3, or with 57 prefix
      if (digits.length === 10 && digits.startsWith('3')) score += 2;
      else if (digits.length >= 7 && digits.length <= 12) score += 1;
    }
    phoneScores.push(score);
  }

  // Column with highest phone score = phone column
  const maxScore = Math.max(...phoneScores);
  if (maxScore > 0) {
    result.phone = phoneScores.indexOf(maxScore);
  }

  // Assign remaining columns as firstName and lastName (left to right)
  const remaining = [];
  for (let col = 0; col < numCols; col++) {
    if (col !== result.phone) remaining.push(col);
  }

  if (remaining.length >= 1) result.firstName = remaining[0];
  if (remaining.length >= 2) result.lastName = remaining[1];

  return result;
}

/**
 * Detect which columns map to phone, firstName, lastName (for files WITH headers)
 */
function detectColumns(headers) {
  const result = { phone: null, firstName: null, lastName: null };

  for (const header of headers) {
    for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      if (!result[field]) {
        for (const alias of aliases) {
          if (matchAlias(header, alias)) {
            result[field] = header;
            break;
          }
        }
      }
    }
  }

  return result;
}

// ===========================================
// PHONE NUMBER NORMALIZATION (COLOMBIA)
// ===========================================

/**
 * Normalize a Colombian phone number to the format used by WhatsApp (57XXXXXXXXXX@s.whatsapp.net)
 * @param {string} raw - Raw phone number
 * @returns {string|null} Normalized 10-digit Colombian number or null if invalid
 */
function normalizeColombianPhone(raw) {
  if (!raw) return null;

  // Remove all non-digit characters
  let digits = raw.replace(/\D/g, '');

  if (!digits || digits.length < 7) return null;

  // Handle country code prefix
  if (digits.startsWith('57') && digits.length >= 12) {
    digits = digits.substring(2);
  }

  // Colombian mobile numbers are 10 digits starting with 3
  if (digits.length === 10 && digits.startsWith('3')) {
    return digits;
  }

  // Try removing leading zeros
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
    if (digits.length === 10 && digits.startsWith('3')) {
      return digits;
    }
  }

  // If 10 digits but doesn't start with 3, still accept (landline)
  if (digits.length === 10) {
    return digits;
  }

  return null;
}

/**
 * Convert a 10-digit Colombian number to WhatsApp JID
 */
function phoneToJid(phone) {
  const clean = phone.replace(/\D/g, '');
  // Add country code if not present
  if (clean.length === 10) {
    return `57${clean}@s.whatsapp.net`;
  }
  return `${clean}@s.whatsapp.net`;
}

// ===========================================
// MANUAL NUMBERS PARSING
// ===========================================

/**
 * Parse manually entered numbers (comma, newline, or space separated)
 * @param {string} text - Raw input text
 * @returns {Object} { contacts, warnings }
 */
function parseManualNumbers(text) {
  if (!text || !text.trim()) {
    throw new Error('No se proporcionaron números');
  }

  // Split by comma, newline, or multiple spaces
  const rawNumbers = text.split(/[,\n\r]+|\s{2,}/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  const contacts = [];
  const seenPhones = new Set();
  let duplicates = 0;
  let invalid = 0;
  const warnings = [];

  for (const raw of rawNumbers) {
    const phone = normalizeColombianPhone(raw);
    if (!phone) {
      invalid++;
      continue;
    }
    if (seenPhones.has(phone)) {
      duplicates++;
      continue;
    }
    seenPhones.add(phone);
    contacts.push({ phone, firstName: null, lastName: null });
  }

  if (duplicates > 0) warnings.push(`${duplicates} número(s) duplicado(s) removido(s)`);
  if (invalid > 0) warnings.push(`${invalid} número(s) inválido(s) omitido(s)`);
  if (contacts.length > MAX_CONTACTS_PER_CAMPAIGN) {
    warnings.push(`Solo se cargarán los primeros ${MAX_CONTACTS_PER_CAMPAIGN} contactos`);
    contacts.splice(MAX_CONTACTS_PER_CAMPAIGN);
  }

  return { contacts, warnings };
}

// ===========================================
// CONTACT LIST MANAGEMENT
// ===========================================

/**
 * Upload a file and create a contact list
 */
async function uploadFileAndCreateList(file, createdBy) {
  const parsed = parseFile(file.buffer, file.originalname);

  if (parsed.contacts.length === 0) {
    throw new Error('No se encontraron contactos válidos en el archivo');
  }

  // Create list
  const list = await bulkRepository.createList({
    name: file.originalname.replace(/\.(xlsx|csv)$/i, ''),
    originalFileName: file.originalname,
    contactCount: parsed.contacts.length,
    type: 'file',
    createdBy
  });

  // Add contacts
  await bulkRepository.addContacts(list.listId, parsed.contacts);

  // Proactively update existing conversation names from the imported Excel data
  // so that names appear immediately in the dashboard, not just when sending
  let namesUpdated = 0;
  for (const contact of parsed.contacts) {
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
    if (!fullName) continue;

    const jid = phoneToJid(contact.phone);
    try {
      const conversation = conversationStateService.getConversation(jid);
      if (conversation && (!conversation.customName || conversation.customName === 'Sin nombre')) {
        conversationStateService.updateCustomName(jid, fullName);
        namesUpdated++;
      }
    } catch (e) {
      // Ignore - conversation may not exist yet
    }
  }

  if (namesUpdated > 0) {
    logger.info(`✅ [BULK] Updated ${namesUpdated} conversation names from imported Excel`);
  }

  return {
    list,
    parsed: {
      totalRows: parsed.totalRows,
      validContacts: parsed.validContacts,
      columns: parsed.columns,
      warnings: parsed.warnings
    }
  };
}

/**
 * Create a list from manually entered numbers
 */
async function createManualList(numbers, name, createdBy) {
  const parsed = parseManualNumbers(numbers);

  if (parsed.contacts.length === 0) {
    throw new Error('No se encontraron números válidos');
  }

  const list = await bulkRepository.createList({
    name: name || `Manual ${new Date().toLocaleDateString('es-CO')}`,
    originalFileName: null,
    contactCount: parsed.contacts.length,
    type: 'manual',
    createdBy
  });

  await bulkRepository.addContacts(list.listId, parsed.contacts);

  return {
    list,
    parsed: {
      validContacts: parsed.contacts.length,
      warnings: parsed.warnings
    }
  };
}

// ===========================================
// MESSAGE PREVIEW
// ===========================================

/**
 * Generate preview of the message with variables substituted
 */
function generatePreview(template, contacts) {
  const previews = contacts.slice(0, 5).map(c => ({
    phone: c.phone,
    name: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Sin nombre',
    message: bulkRepository._resolveTemplate(template, c)
  }));

  return previews;
}

// ===========================================
// BULK SEND EXECUTION
// ===========================================

/**
 * Resolve names for contact objects (especially phone-only ones) by querying conversation history and saved lists.
 */
async function resolveContactNames(contactsList) {
  if (!contactsList || contactsList.length === 0) return [];

  const phoneMap = new Map();
  contactsList.forEach(c => {
    phoneMap.set(c.phone, { ...c });
  });

  // 1. Try resolving names from active conversations in memory
  const conversations = conversationStateService.getAllConversations();
  for (const conv of conversations) {
    if (conv.phoneNumber && phoneMap.has(conv.phoneNumber)) {
      const target = phoneMap.get(conv.phoneNumber);
      const hasTargetName = (target.firstName && target.firstName.trim()) || (target.lastName && target.lastName.trim());
      const convName = conv.customName || conv.whatsappName;
      if (!hasTargetName && convName && convName !== 'Sin nombre') {
        const parts = convName.split(' ');
        target.firstName = parts[0] || '';
        target.lastName = parts.slice(1).join(' ') || '';
      }
    }
  }

  // 2. Try resolving names from saved contact lists in DynamoDB
  const namelessPhones = Array.from(phoneMap.values())
    .filter(c => !((c.firstName && c.firstName.trim()) || (c.lastName && c.lastName.trim())))
    .map(c => c.phone);

  if (namelessPhones.length > 0) {
    try {
      const lists = await bulkRepository.getAllLists();
      for (const list of lists) {
        const listContacts = await bulkRepository.getContactsByList(list.listId);
        for (const lc of listContacts) {
          if (phoneMap.has(lc.phone)) {
            const target = phoneMap.get(lc.phone);
            const hasTargetName = (target.firstName && target.firstName.trim()) || (target.lastName && target.lastName.trim());
            const hasListName = (lc.firstName && lc.firstName.trim()) || (lc.lastName && lc.lastName.trim());
            if (!hasTargetName && hasListName) {
              target.firstName = lc.firstName;
              target.lastName = lc.lastName;
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`⚠️ [BULK] Could not search saved lists to resolve names: ${err.message}`);
    }
  }

  return Array.from(phoneMap.values());
}

/**
 * Start a bulk send campaign
 * @param {Object} params - Campaign parameters
 * @param {Function} getWhatsAppClient - Function to get the Baileys client
 */
async function startCampaign(params, getWhatsAppClient) {
  // Check concurrent campaign limit
  const activeSending = [...activeCampaigns.values()].filter(c => !c.paused && !c.cancelled);
  if (activeSending.length >= MAX_CONCURRENT_CAMPAIGNS) {
    throw new Error(`Ya hay ${activeSending.length} campaña(s) activa(s). Espere a que termine antes de iniciar otra.`);
  }

  const { name, messageTemplate, listIds, contacts: directContacts, batchSize = 50, delayMs = 2000, createdBy, dryRun = false } = params;

  // Gather all contacts
  let allContacts = [];

  // 1. Resolve contacts from selected lists (which contain full names)
  if (listIds && listIds.length > 0) {
    for (const listId of listIds) {
      const listContacts = await bulkRepository.getContactsByList(listId);
      allContacts.push(...listContacts);
    }
  }

  // 2. Map contacts by phone to easily merge/lookup
  const contactsMap = new Map();
  allContacts.forEach(c => {
    contactsMap.set(c.phone, c);
  });

  // 3. Merge direct contacts (manual selections)
  if (directContacts && directContacts.length > 0) {
    for (const dc of directContacts) {
      if (contactsMap.has(dc.phone)) {
        const existing = contactsMap.get(dc.phone);
        const hasDirectName = (dc.firstName && dc.firstName.trim()) || (dc.lastName && dc.lastName.trim());
        const hasExistingName = (existing.firstName && existing.firstName.trim()) || (existing.lastName && existing.lastName.trim());
        if (hasDirectName && !hasExistingName) {
          existing.firstName = dc.firstName;
          existing.lastName = dc.lastName;
        }
      } else {
        // New contact not in the lists
        contactsMap.set(dc.phone, dc);
      }
    }
  }

  // Convert map back to array and proactively resolve any remaining missing names
  const mergedContacts = Array.from(contactsMap.values());
  allContacts = await resolveContactNames(mergedContacts);

  // Deduplicate by phone
  const seen = new Set();
  allContacts = allContacts.filter(c => {
    if (seen.has(c.phone)) return false;
    seen.add(c.phone);
    return true;
  });

  if (allContacts.length === 0) {
    throw new Error('No hay contactos para enviar');
  }

  if (allContacts.length > MAX_CONTACTS_PER_CAMPAIGN) {
    allContacts = allContacts.slice(0, MAX_CONTACTS_PER_CAMPAIGN);
  }

  // Enforce minimum delay
  const safeDelay = Math.max(delayMs, MIN_DELAY_MS);

  // Create campaign
  const campaign = await bulkRepository.createCampaign({
    name: dryRun ? `[SIMULACIÓN] ${name}` : name,
    messageTemplate,
    listIds: listIds || [],
    totalRecipients: allContacts.length,
    batchSize,
    delayMs: safeDelay,
    createdBy
  });

  // Create individual message records
  const bulkMessages = await bulkRepository.createBulkMessages(
    campaign.campaignId,
    allContacts,
    messageTemplate
  );

  // Set campaign to sending
  await bulkRepository.updateCampaignProgress(campaign.campaignId, { status: 'sending' });

  // Store control reference for pause/resume
  activeCampaigns.set(campaign.campaignId, { paused: false, cancelled: false });

  // Execute send in background (non-blocking)
  // In dry-run mode, use a faster delay for quicker testing
  const executeDelay = dryRun ? Math.min(safeDelay, 500) : safeDelay;
  executeSend(campaign.campaignId, bulkMessages, executeDelay, batchSize, getWhatsAppClient, dryRun)
    .catch(err => {
      logger.error(`❌ [BULK] Campaign ${campaign.campaignId} failed:`, err.message);
    });

  return campaign;
}

/**
 * Execute the actual sending (runs in background)
 */
async function executeSend(campaignId, messages, delayMs, batchSize, getWhatsAppClient, dryRun = false) {
  let sent = 0;
  let failed = 0;
  const total = messages.length;

  logger.info(`📤 [BULK] Starting campaign ${campaignId}${dryRun ? ' (DRY RUN)' : ''}: ${total} messages, delay=${delayMs}ms, batch=${batchSize}`);

  for (let i = 0; i < messages.length; i++) {
    // Check for pause/cancel
    const control = activeCampaigns.get(campaignId);
    if (control && control.cancelled) {
      logger.info(`🚫 [BULK] Campaign ${campaignId} cancelled`);
      break;
    }
    if (control && control.paused) {
      logger.info(`⏸️ [BULK] Campaign ${campaignId} paused at message ${i + 1}/${total}`);
      await bulkRepository.updateCampaignProgress(campaignId, {
        sent, failed, pending: total - sent - failed, status: 'paused'
      });

      if (io) {
        io.emit('bulk-progress', {
          campaignId,
          sent,
          failed,
          pending: total - sent - failed,
          total,
          percent: Math.round(((sent + failed) / total) * 100),
          status: 'paused'
        });
      }

      // Wait until resumed
      while (control.paused && !control.cancelled) {
        await sleep(1000);
      }
      if (control.cancelled) break;
      logger.info(`▶️ [BULK] Campaign ${campaignId} resumed`);
      await bulkRepository.updateCampaignProgress(campaignId, { status: 'sending' });

      if (io) {
        io.emit('bulk-progress', {
          campaignId,
          sent,
          failed,
          pending: total - sent - failed,
          total,
          percent: Math.round(((sent + failed) / total) * 100),
          status: 'sending'
        });
      }
    }

    const msg = messages[i];
    try {
      if (dryRun) {
        // Simulation mode: skip actual WhatsApp send
        logger.debug(`🧪 [DRY RUN] ${i + 1}/${total} simulated send to ${msg.phone}`);
      } else {
        const client = getWhatsAppClient();
        if (!client) {
          throw new Error('WhatsApp client not available');
        }

        const jid = phoneToJid(msg.phone);
        await client.sendMessage(jid, { text: msg.resolvedMessage });
      }

      await bulkRepository.updateBulkMessageStatus(msg.bulkMessageId, dryRun ? 'simulated' : 'sent');
      sent++;

      if (!dryRun) {
        // Save in conversation history so it appears in chat (only for real sends)
        try {
          const convOptions = {};
          if (msg.contactName) {
            convOptions.whatsappName = msg.contactName;
          }
          const conversation = conversationStateService.getOrCreateConversation(phoneToJid(msg.phone), convOptions);
          
          // If contact has a name in the Excel list, register it as customName
          if (msg.contactName && msg.contactName.trim() && (!conversation.customName || conversation.customName === 'Sin nombre')) {
            conversationStateService.updateCustomName(phoneToJid(msg.phone), msg.contactName);
          }

          const messageObj = Message.createText('bot', phoneToJid(msg.phone), msg.resolvedMessage);
          messageObj.participantId = phoneToJid(msg.phone);
          messageObj.conversationId = phoneToJid(msg.phone);
          messageObj.status = 'sent';
          messageObj.metadata = { source: 'bulk', campaignId };
          await conversationRepository.saveMessage(messageObj);
          conversationStateService.updateLastMessage(phoneToJid(msg.phone), msg.resolvedMessage);
          // Emit to frontend via socket so chat updates live
          if (io) {
            io.emit('new-message', {
              participantId: phoneToJid(msg.phone),
              message: messageObj.toObject()
            });
          }
        } catch (historyErr) {
          logger.warn(`⚠️ [BULK] Couldn't save to history for ${msg.phone}: ${historyErr.message}`);
        }
      }

      logger.debug(`✅ [BULK] ${sent}/${total} ${dryRun ? 'simulated' : 'sent'} to ${msg.phone}`);
    } catch (err) {
      await bulkRepository.updateBulkMessageStatus(msg.bulkMessageId, 'failed', err.message);
      failed++;
      logger.warn(`❌ [BULK] Failed to send to ${msg.phone}: ${err.message}`);
    }

    // Emit progress via Socket.IO
    if (io) {
      io.emit('bulk-progress', {
        campaignId,
        sent,
        failed,
        pending: total - sent - failed,
        total,
        percent: Math.round(((sent + failed) / total) * 100),
        currentPhone: msg.phone,
        status: 'sending'
      });
    }

    // Update DB progress every 10 messages or at the end
    if ((sent + failed) % 10 === 0 || i === messages.length - 1) {
      await bulkRepository.updateCampaignProgress(campaignId, {
        sent, failed, pending: total - sent - failed
      });
    }

    // Delay between messages
    if (i < messages.length - 1) {
      await sleep(delayMs);
    }
  }

  // Determine final status (cancelled vs completed)
  const finalControl = activeCampaigns.get(campaignId);
  const finalStatus = (finalControl && finalControl.cancelled) ? 'cancelled' : 'completed';

  // Mark campaign with correct final status
  await bulkRepository.updateCampaignProgress(campaignId, {
    sent, failed, pending: total - sent - failed,
    status: finalStatus,
    completedAt: new Date().toISOString()
  });

  activeCampaigns.delete(campaignId);

  logger.info(`✅ [BULK] Campaign ${campaignId} ${finalStatus}: ${sent} sent, ${failed} failed`);

  // Emit completion
  if (io) {
    io.emit('bulk-complete', {
      campaignId, sent, failed, total,
      percent: 100,
      status: finalStatus
    });
  }
}

/**
 * Pause a running campaign
 */
function pauseCampaign(campaignId) {
  const control = activeCampaigns.get(campaignId);
  if (control) {
    control.paused = true;
    return true;
  }
  return false;
}

/**
 * Resume a paused campaign
 */
function resumeCampaign(campaignId) {
  const control = activeCampaigns.get(campaignId);
  if (control) {
    control.paused = false;
    return true;
  }
  return false;
}

/**
 * Cancel a running campaign (stops sending immediately)
 */
function cancelCampaign(campaignId) {
  const control = activeCampaigns.get(campaignId);
  if (control) {
    control.cancelled = true;
    control.paused = false; // Unpause so the loop can exit
    logger.info(`🚫 [BULK] Campaign ${campaignId} cancel requested`);
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  setSocketIO,
  parseFile,
  parseManualNumbers,
  normalizeColombianPhone,
  phoneToJid,
  uploadFileAndCreateList,
  createManualList,
  generatePreview,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  MAX_CONTACTS_PER_CAMPAIGN,
  MIN_DELAY_MS
};
