/**
 * ===========================================
 * LOADER DE PREGUNTAS Y RESPUESTAS
 * ===========================================
 *
 * Carga el archivo PreguntasRespuestas.txt y lo parsea
 * para usarlo como base de conocimiento del chatbot.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Parsea el archivo de preguntas y respuestas
 * Formato esperado:
 * - Secciones con emoji verde: 🟢 Título de sección
 * - Preguntas numeradas: 1. Pregunta?
 * - Respuestas en la siguiente línea
 *
 * @param {string} filePath - Ruta al archivo
 * @returns {Array} Array de objetos { question, answer, category }
 */
const parseQAFile = (filePath) => {
  try {
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');

    const qaItems = [];
    let currentCategory = 'General';
    let currentQuestion = null;
    let currentAnswer = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detectar categoría (líneas con 🟢)
      if (line.includes('🟢')) {
        currentCategory = line.replace('🟢', '').trim();
        continue;
      }

      // Detectar pregunta (empieza con número y punto)
      const questionMatch = line.match(/^(\d+)\.\s*(.+)$/);
      if (questionMatch) {
        // Si hay una pregunta pendiente, guardarla
        if (currentQuestion && currentAnswer) {
          qaItems.push({
            id: qaItems.length + 1,
            question: normalizeQuestion(currentQuestion),
            answer: currentAnswer,
            category: currentCategory,
            keywords: extractKeywords(currentQuestion)
          });
        }

        currentQuestion = questionMatch[2];
        currentAnswer = null;
        continue;
      }

      // Si hay una pregunta activa y la línea tiene contenido, es la respuesta
      if (currentQuestion && line && !currentAnswer) {
        currentAnswer = line;
      }
    }

    // Guardar última pregunta
    if (currentQuestion && currentAnswer) {
      qaItems.push({
        id: qaItems.length + 1,
        question: normalizeQuestion(currentQuestion),
        answer: currentAnswer,
        category: currentCategory,
        keywords: extractKeywords(currentQuestion)
      });
    }

    logger.info(`Cargadas ${qaItems.length} preguntas desde ${filePath}`);
    return qaItems;

  } catch (error) {
    logger.error('Error cargando archivo de Q&A:', error);
    return [];
  }
};

/**
 * Normaliza una pregunta (solo ? al final, sin ¿ al inicio)
 */
const normalizeQuestion = (question) => {
  // Quitar ¿ al inicio si existe
  let normalized = question.replace(/^¿\s*/, '');

  // Asegurar que termine con ?
  if (!normalized.endsWith('?')) {
    normalized = normalized + '?';
  }

  return normalized;
};

/**
 * Extrae palabras clave de una pregunta para búsqueda
 */
const extractKeywords = (question) => {
  // Palabras a ignorar (stop words en español)
  const stopWords = [
    'qué', 'que', 'cuál', 'cual', 'cómo', 'como', 'por', 'qué', 'quién', 'quien',
    'cuándo', 'cuando', 'dónde', 'donde', 'para', 'con', 'sin', 'sobre', 'entre',
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
    'es', 'son', 'está', 'están', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
    'en', 'a', 'y', 'o', 'pero', 'si', 'no', 'se', 'su', 'sus', 'le', 'les'
  ];

  return question
    .toLowerCase()
    .replace(/[¿?.,;:!]/g, '') // Quitar puntuación
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
};

/**
 * Busca la mejor respuesta para una pregunta del usuario
 * @param {string} userQuestion - Pregunta del usuario
 * @param {Array} qaItems - Array de Q&A cargados
 * @returns {Object|null} Mejor coincidencia o null
 */
const findBestMatch = (userQuestion, qaItems) => {
  if (!userQuestion || !qaItems || qaItems.length === 0) {
    return null;
  }

  const userKeywords = extractKeywords(userQuestion);

  if (userKeywords.length === 0) {
    return null;
  }

  // Calcular score de coincidencia para cada Q&A
  const scored = qaItems.map(qa => {
    let score = 0;

    // Coincidencia de keywords
    const matchedKeywords = userKeywords.filter(kw =>
      qa.keywords.some(qkw => qkw.includes(kw) || kw.includes(qkw))
    );
    score += matchedKeywords.length * 2;

    // Coincidencia directa en la pregunta
    const userLower = userQuestion.toLowerCase();
    const qaLower = qa.question.toLowerCase();

    if (qaLower.includes(userLower) || userLower.includes(qaLower)) {
      score += 5;
    }

    // Palabras clave importantes
    const importantWords = ['delegados', 'asamblea', 'norboy', 'elección', 'proceso',
                           'órganos', 'consejo', 'junta', 'vigilancia', 'asociados',
                           'participar', 'democrático', 'elegir', 'representar'];

    importantWords.forEach(word => {
      if (userLower.includes(word) && qaLower.includes(word)) {
        score += 3;
      }
    });

    return { ...qa, score };
  });

  // Ordenar por score y obtener el mejor
  const sorted = scored.sort((a, b) => b.score - a.score);

  // Solo devolver si hay un score mínimo razonable
  if (sorted[0].score >= 2) {
    return sorted[0];
  }

  return null;
};

/**
 * Obtiene contexto relevante formateado para el prompt
 */
const getContextForPrompt = (userQuestion, qaItems, maxItems = 3) => {
  const userKeywords = extractKeywords(userQuestion);

  if (userKeywords.length === 0) {
    return '';
  }

  // Encontrar Q&As relevantes
  const scored = qaItems.map(qa => {
    let score = 0;
    userKeywords.forEach(kw => {
      if (qa.keywords.some(qkw => qkw.includes(kw) || kw.includes(qkw))) {
        score++;
      }
      if (qa.question.toLowerCase().includes(kw)) {
        score += 2;
      }
      if (qa.answer.toLowerCase().includes(kw)) {
        score++;
      }
    });
    return { ...qa, score };
  });

  const relevant = scored
    .filter(qa => qa.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  if (relevant.length === 0) {
    return '';
  }

  // Formatear como contexto
  return relevant
    .map(qa => `Pregunta: ${qa.question}\nRespuesta: ${qa.answer}`)
    .join('\n\n');
};

module.exports = {
  parseQAFile,
  normalizeQuestion,
  extractKeywords,
  findBestMatch,
  getContextForPrompt
};
