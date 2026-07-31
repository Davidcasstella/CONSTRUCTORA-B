/**
 * ===========================================
 * SERVICIO DE GESTIÓN DE ETIQUETAS (LABELS)
 * ===========================================
 *
 * Catálogo de etiquetas para organizar conversaciones.
 * Persistence: AWS DynamoDB (constructora-labels)
 * Sincronización con caché en memoria + fallback local.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { docClient, TABLES } = require('../providers/dynamodb.provider');
const { ScanCommand, PutCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Default color palette for new labels (rotated)
const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

// =============================================
// CACHING LOGIC
// =============================================
let labelsCache = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

const LABELS_FILE = path.join(process.cwd(), 'data', 'labels.json');

function readLocalFallback() {
  try {
    if (!fs.existsSync(LABELS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function writeLocalFallback(labels) {
  try {
    const dir = path.dirname(LABELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LABELS_FILE, JSON.stringify(labels, null, 2), 'utf8');
  } catch (e) {
    logger.warn(`[LABELS] No se pudo escribir fallback local: ${e.message}`);
  }
}

async function fetchLabels() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS && labelsCache.length > 0) {
    return labelsCache;
  }

  if (!docClient || !TABLES.LABELS) {
    logger.warn('[LABELS] DynamoDB no configurado. Usando fallback local.');
    return readLocalFallback();
  }

  try {
    const data = await docClient.send(new ScanCommand({ TableName: TABLES.LABELS }));
    labelsCache = data.Items || [];
    labelsCache.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    lastFetchTime = now;
    return labelsCache;
  } catch (error) {
    logger.error('[LABELS] Error fetching from DynamoDB:', error.message);
    return labelsCache.length > 0 ? labelsCache : readLocalFallback();
  }
}

function invalidateCache() {
  lastFetchTime = 0;
}

// =============================================
// CRUD OPERATIONS
// =============================================

async function getAllLabels() {
  const labels = await fetchLabels();
  return [...labels].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

async function getLabelById(labelId) {
  const labels = await fetchLabels();
  return labels.find(l => l.id === labelId) || null;
}

async function createLabel(name, color) {
  const labels = await fetchLabels();
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('El nombre de la etiqueta es requerido');

  const assignedColor = color || DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length];

  const newLabel = {
    id: `label_${Date.now()}`,
    name: trimmedName,
    color: assignedColor,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (docClient && TABLES.LABELS) {
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.LABELS,
        Item: newLabel
      }));
      invalidateCache();
    } catch (e) {
      logger.error('[LABELS] Error creating label:', e.message);
      throw e;
    }
  } else {
    const updated = [...labels, newLabel];
    writeLocalFallback(updated);
    labelsCache = updated;
  }

  logger.info(`[LABELS] Nueva etiqueta creada: ${newLabel.name} (${newLabel.color})`);
  return newLabel;
}

async function updateLabel(labelId, { name, color }) {
  const label = await getLabelById(labelId);
  if (!label) throw new Error('Etiqueta no encontrada');

  const newName = name !== undefined ? (name || '').trim() : label.name;
  const newColor = color !== undefined ? color : label.color;
  if (!newName) throw new Error('El nombre de la etiqueta es requerido');

  if (docClient && TABLES.LABELS) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.LABELS,
        Key: { id: labelId },
        UpdateExpression: 'SET #name = :name, #color = :color, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#name': 'name', '#color': 'color' },
        ExpressionAttributeValues: {
          ':name': newName,
          ':color': newColor,
          ':updatedAt': Date.now()
        }
      }));
      invalidateCache();
    } catch (e) {
      logger.error('[LABELS] Error updating label:', e.message);
      throw e;
    }
  } else {
    const labels = await fetchLabels();
    const updated = labels.map(l => l.id === labelId ? { ...l, name: newName, color: newColor, updatedAt: Date.now() } : l);
    writeLocalFallback(updated);
    labelsCache = updated;
  }

  logger.info(`[LABELS] Etiqueta actualizada: "${label.name}" -> "${newName}"`);
  return { ...label, name: newName, color: newColor };
}

async function deleteLabel(labelId) {
  const label = await getLabelById(labelId);
  if (!label) throw new Error('Etiqueta no encontrada');

  if (docClient && TABLES.LABELS) {
    try {
      await docClient.send(new DeleteCommand({ TableName: TABLES.LABELS, Key: { id: labelId } }));
      invalidateCache();
    } catch (e) {
      logger.error('[LABELS] Error deleting label:', e.message);
      throw e;
    }
  } else {
    const labels = await fetchLabels();
    const updated = labels.filter(l => l.id !== labelId);
    writeLocalFallback(updated);
    labelsCache = updated;
  }

  // Remove label from all conversations that had it assigned
  try {
    const conversationState = require('./conversation-state.service');
    if (typeof conversationState.removeLabelFromAll === 'function') {
      const affected = conversationState.removeLabelFromAll(labelId);
      logger.info(`[LABELS] Etiqueta ${labelId} removida de ${affected} conversacion(es)`);
    }
  } catch (err) {
    logger.warn(`[LABELS] No se pudo limpiar referencias en conversaciones: ${err.message}`);
  }

  logger.info(`[LABELS] Etiqueta eliminada: ${label.name}`);
  return { success: true };
}

module.exports = {
  getAllLabels,
  getLabelById,
  createLabel,
  updateLabel,
  deleteLabel,
  invalidateCache
};
