/**
 * ===========================================
 * WELCOME CONFIG SERVICE
 * ===========================================
 *
 * Manages the configuration for welcome messages,
 * consent messages, and closure messages.
 *
 * Persists data to data/welcome-config.json
 * following the same pattern as schedule-config.service.js
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_PATH = path.join(__dirname, '../../data/welcome-config.json');

// In-memory cache
let configCache = null;

// Default config (fallback if file doesn't exist)
const DEFAULT_CONFIG = {
  welcome: {
    enabled: true,
    messages: [
      {
        id: 'w1',
        order: 1,
        type: 'text',
        content: 'Hola, soy AntonIA Santos, su asesor en línea',
        delay: 2,
        mediaUrl: null,
        mediaType: null,
        useGreeting: true,
        includeUserName: true,
        enabled: true
      }
    ]
  },
  consent: {
    enabled: true,
    messages: [
      {
        id: 'cn1',
        order: 1,
        content: '👋 ¡Gracias por escribirnos!\n\n📄 Consulte nuestras políticas de manejo de datos:\n🔒 Política de Protección de Datos Personales:\nhttps://norboy.coop/proteccion-de-datos-personales/\n\n💬 Uso de WhatsApp:\nhttps://www.whatsapp.com/legal\nGracias por contactarnos.',
        delay: 2,
        enabled: true
      }
    ]
  },
  closure: {
    enabled: true,
    messages: [
      {
        id: 'c1',
        type: 'auto_close',
        label: 'Cierre automático',
        content: 'Gracias por contactarnos. Si necesita algo más, no dude en escribirnos.',
        delay: 0,
        enabled: true
      },
      {
        id: 'c2',
        type: 'transfer_human',
        label: 'Transferencia a asesor',
        content: 'El asesor de NORBOY 👩‍💼 encargado de este tema le atenderá en breve...',
        delay: 0,
        enabled: true
      },
      {
        id: 'c3',
        type: 'followup',
        label: 'Seguimiento',
        content: '¿Necesita algo más? Estamos para servirle.',
        delay: 0,
        enabled: true
      }
    ]
  },
  advanced: {
    sendOnlyOnce: true,
    respectSchedule: true,
    globalSpeedMultiplier: 1.0
  }
};

/**
 * Loads config from disk into cache
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      configCache = JSON.parse(raw);
      logger.info('✅ Welcome config loaded from disk');
    } else {
      configCache = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      saveConfigToDisk();
      logger.info('✅ Welcome config created with defaults');
    }
  } catch (error) {
    logger.error('❌ Error loading welcome config:', error.message);
    configCache = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  // ✅ Auto-migrate consent: single string → messages array
  if (configCache.consent && !Array.isArray(configCache.consent.messages)) {
    const oldMsg = configCache.consent.message || '';
    const oldDelay = configCache.consent.delay || 2;
    if (oldMsg) {
      configCache.consent.messages = [
        {
          id: 'cn_migrated',
          order: 1,
          content: oldMsg,
          delay: oldDelay,
          enabled: true
        }
      ];
      logger.info('🔄 Consent config migrated: single message → messages array');
      saveConfigToDisk();
    } else {
      configCache.consent.messages = [];
    }
  }

  return configCache;
}

/**
 * Saves current cache to disk
 */
function saveConfigToDisk() {
  try {
    // Ensure data directory exists
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configCache, null, 2), 'utf-8');
    logger.info('💾 Welcome config saved to disk');
    return true;
  } catch (error) {
    logger.error('❌ Error saving welcome config:', error.message);
    return false;
  }
}

/**
 * Gets the full config
 * @returns {Object} Full welcome configuration
 */
function getConfig() {
  if (!configCache) loadConfig();
  return configCache;
}

/**
 * Saves the full config
 * @param {Object} newConfig - The new configuration object
 * @returns {boolean} Success
 */
function saveConfig(newConfig) {
  if (!configCache) loadConfig();

  // Merge with existing to preserve any missing fields
  configCache = {
    ...configCache,
    ...newConfig,
    welcome: newConfig.welcome || configCache.welcome,
    consent: newConfig.consent || configCache.consent,
    closure: newConfig.closure || configCache.closure,
    advanced: { ...configCache.advanced, ...(newConfig.advanced || {}) }
  };

  return saveConfigToDisk();
}

// ===========================================
// WELCOME MESSAGES CRUD
// ===========================================

/**
 * Gets enabled welcome messages sorted by order
 * @returns {Array} Sorted welcome messages
 */
function getWelcomeMessages() {
  if (!configCache) loadConfig();
  const msgs = configCache.welcome?.messages || [];
  return msgs
    .filter(m => m.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Gets ALL welcome messages (including disabled)
 * @returns {Array} All welcome messages sorted by order
 */
function getAllWelcomeMessages() {
  if (!configCache) loadConfig();
  const msgs = configCache.welcome?.messages || [];
  return msgs.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Adds a new welcome message
 * @param {Object} msg - Message object
 * @returns {Object} The created message with generated id
 */
function addWelcomeMessage(msg) {
  if (!configCache) loadConfig();
  if (!configCache.welcome.messages) configCache.welcome.messages = [];

  const id = `w_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const maxOrder = configCache.welcome.messages.reduce((max, m) => Math.max(max, m.order || 0), 0);

  const newMsg = {
    id,
    order: maxOrder + 1,
    type: msg.type || 'text',
    content: msg.content || '',
    delay: msg.delay != null ? msg.delay : 2,
    mediaUrl: msg.mediaUrl || null,
    mediaType: msg.mediaType || null,
    useGreeting: msg.useGreeting || false,
    includeUserName: msg.includeUserName || false,
    enabled: msg.enabled !== false
  };

  configCache.welcome.messages.push(newMsg);
  saveConfigToDisk();

  logger.info(`✅ Welcome message added: ${id}`);
  return newMsg;
}

/**
 * Updates a welcome message by id
 * @param {string} msgId - Message ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated message or null
 */
function updateWelcomeMessage(msgId, updates) {
  if (!configCache) loadConfig();

  const msgs = configCache.welcome?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) {
    logger.warn(`⚠️ Welcome message not found: ${msgId}`);
    return null;
  }

  // Merge updates but preserve id
  const updated = { ...msgs[idx], ...updates, id: msgId };
  configCache.welcome.messages[idx] = updated;
  saveConfigToDisk();

  logger.info(`✅ Welcome message updated: ${msgId}`);
  return updated;
}

/**
 * Deletes a welcome message by id
 * @param {string} msgId - Message ID
 * @returns {boolean} Success
 */
function deleteWelcomeMessage(msgId) {
  if (!configCache) loadConfig();

  const msgs = configCache.welcome?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) {
    logger.warn(`⚠️ Welcome message not found for deletion: ${msgId}`);
    return false;
  }

  configCache.welcome.messages.splice(idx, 1);

  // Reorder remaining messages
  configCache.welcome.messages
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((m, i) => { m.order = i + 1; });

  saveConfigToDisk();

  logger.info(`🗑️ Welcome message deleted: ${msgId}`);
  return true;
}

/**
 * Reorders welcome messages
 * @param {Array<string>} orderedIds - Array of message IDs in desired order
 * @returns {boolean} Success
 */
function reorderWelcomeMessages(orderedIds) {
  if (!configCache) loadConfig();

  const msgs = configCache.welcome?.messages || [];

  orderedIds.forEach((id, index) => {
    const msg = msgs.find(m => m.id === id);
    if (msg) {
      msg.order = index + 1;
    }
  });

  // Sort the array to match
  configCache.welcome.messages.sort((a, b) => (a.order || 0) - (b.order || 0));
  saveConfigToDisk();

  logger.info(`🔄 Welcome messages reordered: ${orderedIds.length} items`);
  return true;
}

// ===========================================
// CONSENT CONFIG
// ===========================================

/**
 * Gets consent message config (legacy compatibility)
 * @returns {Object} Consent config
 */
function getConsentConfig() {
  if (!configCache) loadConfig();
  return configCache.consent || DEFAULT_CONFIG.consent;
}

/**
 * Updates consent config (legacy compatibility)
 * @param {Object} consentData - New consent config
 * @returns {boolean} Success
 */
function updateConsentConfig(consentData) {
  if (!configCache) loadConfig();
  configCache.consent = { ...configCache.consent, ...consentData };
  return saveConfigToDisk();
}

// ===========================================
// CONSENT MESSAGES CRUD
// ===========================================

/**
 * Gets enabled consent messages sorted by order
 * @returns {Array} Sorted consent messages
 */
function getConsentMessages() {
  if (!configCache) loadConfig();
  // ✅ FIX: Respect the global consent toggle
  if (configCache.consent?.enabled === false) return [];
  const msgs = configCache.consent?.messages || [];
  return msgs
    .filter(m => m.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Gets ALL consent messages (including disabled)
 * @returns {Array} All consent messages sorted by order
 */
function getAllConsentMessages() {
  if (!configCache) loadConfig();
  const msgs = configCache.consent?.messages || [];
  return msgs.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Adds a new consent message
 * @param {Object} msg - Message object
 * @returns {Object} The created message with generated id
 */
function addConsentMessage(msg) {
  if (!configCache) loadConfig();
  if (!configCache.consent) configCache.consent = { enabled: true, messages: [] };
  if (!Array.isArray(configCache.consent.messages)) configCache.consent.messages = [];

  const id = `cn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const maxOrder = configCache.consent.messages.reduce((max, m) => Math.max(max, m.order || 0), 0);

  const newMsg = {
    id,
    order: maxOrder + 1,
    content: msg.content || '',
    delay: msg.delay != null ? msg.delay : 2,
    enabled: msg.enabled !== false
  };

  configCache.consent.messages.push(newMsg);
  saveConfigToDisk();

  logger.info(`✅ Consent message added: ${id}`);
  return newMsg;
}

/**
 * Updates a consent message by id
 * @param {string} msgId - Message ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated message or null
 */
function updateConsentMessage(msgId, updates) {
  if (!configCache) loadConfig();

  const msgs = configCache.consent?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) {
    logger.warn(`⚠️ Consent message not found: ${msgId}`);
    return null;
  }

  const updated = { ...msgs[idx], ...updates, id: msgId };
  configCache.consent.messages[idx] = updated;
  saveConfigToDisk();

  logger.info(`✅ Consent message updated: ${msgId}`);
  return updated;
}

/**
 * Deletes a consent message by id
 * @param {string} msgId - Message ID
 * @returns {boolean} Success
 */
function deleteConsentMessage(msgId) {
  if (!configCache) loadConfig();

  const msgs = configCache.consent?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) {
    logger.warn(`⚠️ Consent message not found for deletion: ${msgId}`);
    return false;
  }

  configCache.consent.messages.splice(idx, 1);

  // Reorder remaining messages
  configCache.consent.messages
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((m, i) => { m.order = i + 1; });

  saveConfigToDisk();

  logger.info(`🗑️ Consent message deleted: ${msgId}`);
  return true;
}

// ===========================================
// CLOSURE MESSAGES CRUD
// ===========================================

/**
 * Gets closure messages
 * @returns {Array} Closure messages
 */
function getClosureMessages() {
  if (!configCache) loadConfig();
  return configCache.closure?.messages || [];
}

/**
 * Gets a specific closure message by type
 * @param {string} type - 'auto_close' | 'transfer_human' | 'followup'
 * @returns {Object|null} Closure message
 */
function getClosureMessageByType(type) {
  const messages = getClosureMessages();
  return messages.find(m => m.type === type && m.enabled !== false) || null;
}

/**
 * Gets ALL closure messages by type (for sequential sending)
 * @param {string} type - 'auto_close' | 'transfer_human' | 'followup'
 * @returns {Array} All enabled closure messages of this type, in order
 */
function getClosureMessagesByType(type) {
  const messages = getClosureMessages();
  return messages.filter(m => m.type === type && m.enabled !== false);
}

/**
 * Updates a closure message by id
 * @param {string} msgId - Message ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated message or null
 */
function updateClosureMessage(msgId, updates) {
  if (!configCache) loadConfig();

  const msgs = configCache.closure?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) return null;

  configCache.closure.messages[idx] = { ...msgs[idx], ...updates, id: msgId };
  saveConfigToDisk();

  logger.info(`✅ Closure message updated: ${msgId}`);
  return configCache.closure.messages[idx];
}

/**
 * Adds a closure message
 * @param {Object} msg - Message data
 * @returns {Object} Created message
 */
function addClosureMessage(msg) {
  if (!configCache) loadConfig();
  if (!configCache.closure.messages) configCache.closure.messages = [];

  const id = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const newMsg = {
    id,
    type: msg.type || 'auto_close',
    label: msg.label || 'Mensaje de cierre',
    content: msg.content || '',
    delay: msg.delay || 0,
    enabled: msg.enabled !== false
  };

  configCache.closure.messages.push(newMsg);
  saveConfigToDisk();

  logger.info(`✅ Closure message added: ${id}`);
  return newMsg;
}

/**
 * Deletes a closure message by id
 * @param {string} msgId - Message ID
 * @returns {boolean} Success
 */
function deleteClosureMessage(msgId) {
  if (!configCache) loadConfig();

  const msgs = configCache.closure?.messages || [];
  const idx = msgs.findIndex(m => m.id === msgId);

  if (idx === -1) return false;

  configCache.closure.messages.splice(idx, 1);
  saveConfigToDisk();

  logger.info(`🗑️ Closure message deleted: ${msgId}`);
  return true;
}

// ===========================================
// ADVANCED CONFIG
// ===========================================

/**
 * Gets advanced config
 * @returns {Object} Advanced config
 */
function getAdvancedConfig() {
  if (!configCache) loadConfig();
  return configCache.advanced || DEFAULT_CONFIG.advanced;
}

/**
 * Gets the global speed multiplier
 * @returns {number} Speed multiplier (1.0 = normal)
 */
function getSpeedMultiplier() {
  if (!configCache) loadConfig();
  return configCache.advanced?.globalSpeedMultiplier || 1.0;
}

/**
 * Checks if welcome is globally enabled
 * @returns {boolean}
 */
function isWelcomeEnabled() {
  if (!configCache) loadConfig();
  return configCache.welcome?.enabled !== false;
}

// ===========================================
// VARIANT ROTATION
// ===========================================

/**
 * Resolves the actual content to send for a welcome message.
 * If the message has a `variants` array with entries, picks one randomly.
 * Otherwise falls back to msg.content.
 * @param {Object} msg - Welcome message object
 * @returns {string} The resolved content string
 */
function resolveMessageContent(msg) {
  if (!msg) return '';
  const variants = msg.variants;
  if (Array.isArray(variants) && variants.length > 0) {
    // Filter only enabled variants
    const enabled = variants.filter(v => v.enabled !== false && v.content && v.content.trim());
    if (enabled.length > 0) {
      const pick = enabled[Math.floor(Math.random() * enabled.length)];
      logger.info(`🔄 Variant rotation: picked variant ${pick.id || '?'} from ${enabled.length} options`);
      return pick.content;
    }
  }
  // Fallback to main content
  return msg.content || '';
}

// Initialize on load
loadConfig();

module.exports = {
  getConfig,
  saveConfig,
  // Welcome CRUD
  getWelcomeMessages,
  getAllWelcomeMessages,
  addWelcomeMessage,
  updateWelcomeMessage,
  deleteWelcomeMessage,
  reorderWelcomeMessages,
  // Consent (legacy)
  getConsentConfig,
  updateConsentConfig,
  // Consent CRUD
  getConsentMessages,
  getAllConsentMessages,
  addConsentMessage,
  updateConsentMessage,
  deleteConsentMessage,
  // Closure CRUD
  getClosureMessages,
  getClosureMessageByType,
  getClosureMessagesByType,
  updateClosureMessage,
  addClosureMessage,
  deleteClosureMessage,
  // Advanced
  getAdvancedConfig,
  getSpeedMultiplier,
  isWelcomeEnabled,
  // Variant rotation
  resolveMessageContent,
  // Reload
  loadConfig
};
