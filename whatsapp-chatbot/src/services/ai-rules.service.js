/**
 * ===========================================
 * AI RULES SERVICE
 * ===========================================
 *
 * Manages custom AI behavior rules that shape
 * HOW the AI delivers responses (tone, format,
 * restrictions, style). Rules do NOT replace
 * the knowledge base — the AI still answers
 * based on documents/fragments.
 *
 * Persistence: data/ai-rules.json
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const AI_RULES_FILE = path.join(process.cwd(), 'data', 'ai-rules.json');

// =============================================
// FILE I/O HELPERS
// =============================================

/**
 * Read all rules from disk.
 * @returns {Array} Array of rule objects
 */
function readRules() {
  try {
    if (!fs.existsSync(AI_RULES_FILE)) return [];
    const data = fs.readFileSync(AI_RULES_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (error) {
    logger.warn('Error reading ai-rules.json:', error.message);
    return [];
  }
}

/**
 * Write rules array to disk.
 * @param {Array} rules - Array of rule objects
 */
function writeRules(rules) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(AI_RULES_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(AI_RULES_FILE, JSON.stringify(rules, null, 2), 'utf8');
  } catch (error) {
    logger.error('Error writing ai-rules.json:', error.message);
    throw error;
  }
}

// =============================================
// CRUD OPERATIONS
// =============================================

/**
 * Get all rules (active and inactive).
 * @returns {Array}
 */
function getAllRules() {
  return readRules();
}

/**
 * Get only active rules.
 * @returns {Array}
 */
function getActiveRules() {
  return readRules().filter(r => r.active === true);
}

/**
 * Create a new rule.
 * @param {Object} data - { content, active? }
 * @returns {Object} The created rule
 */
function createRule(data) {
  if (!data.content || !data.content.trim()) {
    throw new Error('Rule content is required');
  }

  const rules = readRules();

  const newRule = {
    id: generateId(),
    content: data.content.trim(),
    active: data.active !== undefined ? data.active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  rules.push(newRule);
  writeRules(rules);

  logger.info(`🤖 AI Rule created: "${newRule.content.substring(0, 50)}..." (active: ${newRule.active})`);
  return newRule;
}

/**
 * Update an existing rule.
 * @param {string} id - Rule ID
 * @param {Object} data - { content?, active? }
 * @returns {Object} The updated rule
 */
function updateRule(id, data) {
  const rules = readRules();
  const index = rules.findIndex(r => r.id === id);

  if (index === -1) {
    throw new Error('Rule not found');
  }

  if (data.content !== undefined) {
    if (!data.content.trim()) {
      throw new Error('Rule content cannot be empty');
    }
    rules[index].content = data.content.trim();
  }

  if (data.active !== undefined) {
    rules[index].active = data.active;
  }

  rules[index].updated_at = new Date().toISOString();
  writeRules(rules);

  logger.info(`🤖 AI Rule updated: "${rules[index].content.substring(0, 50)}..." (active: ${rules[index].active})`);
  return rules[index];
}

/**
 * Toggle a rule's active state.
 * @param {string} id - Rule ID
 * @param {boolean} active - New active state
 * @returns {Object} The updated rule
 */
function toggleRule(id, active) {
  return updateRule(id, { active });
}

/**
 * Delete a rule by ID.
 * @param {string} id - Rule ID
 * @returns {boolean} true if deleted
 */
function deleteRule(id) {
  const rules = readRules();
  const index = rules.findIndex(r => r.id === id);

  if (index === -1) {
    throw new Error('Rule not found');
  }

  const deleted = rules.splice(index, 1)[0];
  writeRules(rules);

  logger.info(`🗑️ AI Rule deleted: "${deleted.content.substring(0, 50)}..."`);
  return true;
}

// =============================================
// PROMPT BUILDING
// =============================================

/**
 * Build the AI rules context block for injection
 * into the system prompt.
 *
 * This shapes HOW the AI communicates but does NOT
 * override the knowledge base content obligation.
 *
 * @returns {string|null} Rules context block, or null if no active rules
 */
function buildAIRulesContext() {
  const activeRules = getActiveRules();

  if (activeRules.length === 0) {
    return null;
  }

  const rulesText = activeRules
    .map((r, i) => `${i + 1}. ${r.content}`)
    .join('\n');

  return `
⚠️ REGLAS DE COMPORTAMIENTO OBLIGATORIAS (ACTUALIZADAS EN TIEMPO REAL):
Las siguientes reglas definen CÓMO debes comunicarte. Estas reglas se
actualizan en tiempo real por el administrador. IGNORA cualquier patrón
de tus respuestas anteriores en el historial si contradicen estas reglas.
Aplica SIEMPRE la versión actual de las reglas, NO repitas respuestas
anteriores que ya no coincidan con las reglas vigentes.

${rulesText}

INSTRUCCIÓN FINAL: Cumple TODAS las reglas listadas arriba. Tienen
prioridad ABSOLUTA sobre el estilo por defecto y sobre cualquier patrón
del historial de conversación.`;
}

// =============================================
// HELPERS
// =============================================

/**
 * Generate a simple unique ID.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// =============================================
// EXPORTS
// =============================================

module.exports = {
  getAllRules,
  getActiveRules,
  createRule,
  updateRule,
  toggleRule,
  deleteRule,
  buildAIRulesContext
};
