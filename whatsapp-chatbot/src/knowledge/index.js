/**
 * ===========================================
 * BASE DE CONOCIMIENTO - NORBOY
 * ===========================================
 *
 * Base de conocimiento específica para el chatbot de NORBOY.
 * Carga las preguntas y respuestas del proceso electoral
 * "Elegimos Juntos 2026-2029".
 */

const path = require('path');
const logger = require('../utils/logger');
const qaLoader = require('./qa.loader');

// ===========================================
// ALMACENAMIENTO DE Q&A
// ===========================================

let qaItems = [];
let isLoaded = false;

/**
 * Inicializa la base de conocimiento cargando el archivo Q&A
 * @param {string} filePath - Ruta al archivo (opcional, usa .env por defecto)
 */
const initialize = (filePath = null) => {
  const qaFilePath = filePath || process.env.KNOWLEDGE_FILE || './PreguntasRespuestas.txt';

  try {
    qaItems = qaLoader.parseQAFile(qaFilePath);
    isLoaded = true;
    logger.info(`Base de conocimiento inicializada: ${qaItems.length} Q&As cargadas`);
  } catch (error) {
    logger.error('Error inicializando base de conocimiento:', error);
    qaItems = [];
    isLoaded = false;
  }
};

/**
 * Busca la mejor respuesta para una pregunta del usuario
 * @param {string} question - Pregunta del usuario
 * @returns {Object|null} { question, answer, category, confidence }
 */
const findAnswer = (question) => {
  if (!isLoaded || qaItems.length === 0) {
    initialize();
  }

  const match = qaLoader.findBestMatch(question, qaItems);

  if (!match) {
    return null;
  }

  return {
    question: match.question,
    answer: match.answer,
    category: match.category,
    confidence: match.score >= 5 ? 'alta' : match.score >= 3 ? 'media' : 'baja'
  };
};

/**
 * Obtiene contexto relevante formateado para incluir en el prompt de OpenAI
 * @param {string} question - Pregunta del usuario
 * @param {number} maxItems - Máximo de items a incluir
 * @returns {string} Contexto formateado
 */
const getContext = (question, maxItems = 3) => {
  if (!isLoaded || qaItems.length === 0) {
    initialize();
  }

  return qaLoader.getContextForPrompt(question, qaItems, maxItems);
};

/**
 * Obtiene todas las preguntas de una categoría
 * @param {string} category - Nombre de la categoría
 * @returns {Array} Q&As de esa categoría
 */
const getByCategory = (category) => {
  return qaItems.filter(qa =>
    qa.category.toLowerCase().includes(category.toLowerCase())
  );
};

/**
 * Lista todas las categorías disponibles
 * @returns {Array<string>} Lista de categorías
 */
const getCategories = () => {
  const categories = new Set(qaItems.map(qa => qa.category));
  return Array.from(categories);
};

/**
 * Obtiene estadísticas de la base de conocimiento
 */
const getStats = () => {
  const categoryCount = {};

  qaItems.forEach(qa => {
    categoryCount[qa.category] = (categoryCount[qa.category] || 0) + 1;
  });

  return {
    totalQuestions: qaItems.length,
    categories: categoryCount,
    isLoaded
  };
};

/**
 * Recarga la base de conocimiento
 */
const reload = (filePath = null) => {
  isLoaded = false;
  qaItems = [];
  initialize(filePath);
};

/**
 * Obtiene todos los Q&A items (para debugging)
 */
const getAllItems = () => {
  return [...qaItems];
};

// Inicializar automáticamente cuando se requiere el módulo
// (comentado para control manual - descomentar para auto-init)
// initialize();

module.exports = {
  initialize,
  findAnswer,
  getContext,
  getByCategory,
  getCategories,
  getStats,
  reload,
  getAllItems
};
