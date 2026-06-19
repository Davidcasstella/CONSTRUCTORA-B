/**
 * ===========================================
 * SERVICIO DE CARGA DE CONOCIMIENTO
 * ===========================================
 *
 * Permite subir archivos (PDF, TXT) para alimentar
 * la base de conocimiento del chatbot.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const stagesService = require('./stages.service');

// Directorio donde se guardan los archivos de conocimiento
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge_files');
const KNOWLEDGE_INDEX = path.join(KNOWLEDGE_DIR, 'index.json');

// Crear directorio si no existe
if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

// Índice de archivos cargados
let knowledgeIndex = loadIndex();

// ✅ OPTIMIZADO: Cache en memoria de datos de archivos procesados
// Evita leer y parsear JSON del disco en cada búsqueda
// Estructura: { fileId: { data, timestamp } }
const fileDataCache = new Map();

/**
 * Carga el índice de archivos
 */
function loadIndex() {
  try {
    if (fs.existsSync(KNOWLEDGE_INDEX)) {
      const index = JSON.parse(fs.readFileSync(KNOWLEDGE_INDEX, 'utf8'));

      // ✅ MIGRACIÓN: Agregar is_active a documentos que no lo tengan
      let migrated = false;
      if (index.files) {
        index.files.forEach(file => {
          if (typeof file.is_active === 'undefined') {
            file.is_active = true;
            migrated = true;
          }
        });
      }
      if (migrated) {
        index.lastUpdate = new Date().toISOString();
        fs.writeFileSync(KNOWLEDGE_INDEX, JSON.stringify(index, null, 2));
        logger.info('✅ Documentos migrados: campo is_active agregado');
      }

      return index;
    }
  } catch (error) {
    logger.warn('Error cargando índice de conocimiento:', error.message);
  }
  return { files: [], lastUpdate: null };
}

/**
 * Guarda el índice de archivos
 */
function saveIndex() {
  try {
    knowledgeIndex.lastUpdate = new Date().toISOString();
    fs.writeFileSync(KNOWLEDGE_INDEX, JSON.stringify(knowledgeIndex, null, 2));
  } catch (error) {
    logger.error('Error guardando índice:', error.message);
  }
}

/**
 * Procesa un archivo TXT
 *
 * ✅ OPTIMIZADO: No se guarda el campo 'content' completo
 * porque es redundante con los chunks y aumenta el tamaño del JSON innecesariamente.
 * El contenido original siempre puede reconstruirse desde el archivo TXT original.
 */
async function processTxtFile(filePath, originalName) {
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    type: 'txt',
    name: originalName,
    // content: content,  // ❌ ELIMINADO: Redundante con chunks
    chunks: extractChunks(content),
    uploadDate: new Date().toISOString()
  };
}

/**
 * Procesa un archivo PDF
 *
 * ✅ OPTIMIZADO: No se guarda el campo 'content' completo
 * porque es redundante con los chunks y aumenta el tamaño del JSON innecesariamente.
 */
async function processPdfFile(filePath, originalName) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return {
      type: 'pdf',
      name: originalName,
      // content: data.text,  // ❌ ELIMINADO: Redundante con chunks
      pages: data.numpages,
      chunks: extractChunks(data.text),
      uploadDate: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error procesando PDF:', error.message);
    throw new Error('No se pudo procesar el archivo PDF');
  }
}

/**
 * ✅ NUEVO: Detecta si el texto tiene formato Q&A con emojis (1️⃣, 2️⃣, etc.)
 */
function hasEmojiQAFormat(text) {
  // Buscar patrones como: 1️⃣ ¿Pregunta? o 1. ¿Pregunta?
  return /[\d]+️⃣\s*[¿\?]/.test(text) || /[\d]+\.\s*[¿\?]/.test(text);
}

/**
 * ✅ NUEVO: Parsea formato Q&A con emojis
 * Formato: 1️⃣ ¿Pregunta?\n\nRespuesta:\n\nTexto
 */
function parseEmojiQAFormat(text) {
  const chunks = [];

  // Normalizar line endings (Windows \r\n → \n)
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Normalizar múltiples espacios a un solo espacio
  const cleaned = normalized.replace(/[ \t]+/g, ' ').trim();

  // Extraer preguntas usando un approach línea por línea
  const lines = cleaned.split('\n');
  let currentQuestion = null;
  let currentAnswer = null;
  let qaCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detectar línea de pregunta (empieza con número + ¿)
    const questionMatch = line.match(/^\d+[^\w\s]*\s*[¿\?](.+)$/);
    if (questionMatch) {
      // Guardar Q&A anterior si existe
      if (currentQuestion && currentAnswer) {
        const cleanedAnswer = currentAnswer
          .replace(/\s*Estamos para servirle\.\s*$/gi, '')
          .trim();

        if (cleanedAnswer) {
          chunks.push({
            text: `Pregunta: ${currentQuestion}\nRespuesta: ${cleanedAnswer}`,
            keywords: extractKeywords(currentQuestion + ' ' + cleanedAnswer),
            isQA: true,
            question: currentQuestion,
            answer: cleanedAnswer
          });
          qaCount++;
        }
      }

      currentQuestion = questionMatch[1].trim();
      currentAnswer = null;
      continue;
    }

    // Detectar línea "Respuesta:"
    if (line.toLowerCase() === 'respuesta:') {
      continue; // Solo es un marcador, la respuesta viene después
    }

    // Si ya hay pregunta y la línea tiene contenido, es parte de la respuesta
    if (currentQuestion && line && !line.match(/^\d+[^\w\s]*\s*[¿\?]/)) {
      if (currentAnswer) {
        currentAnswer += ' ' + line;
      } else {
        currentAnswer = line;
      }
    }
  }

  // Guardar último Q&A
  if (currentQuestion && currentAnswer) {
    const cleanedAnswer = currentAnswer
      .replace(/\s*Estamos para servirle\.\s*$/gi, '')
      .trim();

    if (cleanedAnswer) {
      chunks.push({
        text: `Pregunta: ${currentQuestion}\nRespuesta: ${cleanedAnswer}`,
        keywords: extractKeywords(currentQuestion + ' ' + cleanedAnswer),
        isQA: true,
        question: currentQuestion,
        answer: cleanedAnswer
      });
      qaCount++;
    }
  }

  logger.info(`✅ Parseados ${qaCount} pares Q&A con formato emoji`);
  return chunks;
}

/**
 * Extrae chunks de texto para búsqueda
 *
 * ✅ MEJORADO: Limpieza mejor de caracteres especiales y formato
 * ✅ NUEVO: Soporte para formato Q&A con emojis
 */
function extractChunks(text) {
  // ✅ CRÍTICO: Normalizar line endings ANTES de cualquier procesamiento
  const normalizedLineEndings = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Limpiar caracteres problemáticos del PDF antes de procesar
  const cleanedText = cleanPdfText(normalizedLineEndings);

  // ✅ NUEVO: Detectar y procesar formato Q&A con emojis
  if (hasEmojiQAFormat(cleanedText)) {
    logger.info('🎯 Detectado formato Q&A con emojis, usando parser especializado');
    const qaChunks = parseEmojiQAFormat(cleanedText);

    if (qaChunks.length > 0) {
      logger.info(`📄 Extraídos ${qaChunks.length} chunks Q&A del texto`);
      return qaChunks;
    }
  }

  // Si no es formato Q&A con emojis, usar el método anterior
  const chunks = [];

  // Dividir por párrafos o secciones (ahora con \n normalizado)
  const paragraphs = cleanedText.split(/\n\n+/).filter(p => p.trim().length > 50);

  // Configuracion de chunking
  const CHUNK_SIZE = 800;
  const CHUNK_OVERLAP = 100;

  for (const para of paragraphs) {
    // Limpiar el texto (normalizar espacios)
    const normalized = para.trim().replace(/\s+/g, ' ');

    if (normalized.length > 0) {
      // ✅ NUEVO: Si el párrafo es muy largo, dividirlo en chunks con solapamiento
      if (normalized.length > CHUNK_SIZE) {
        const subChunks = splitIntoChunks(normalized, CHUNK_SIZE, CHUNK_OVERLAP);
        logger.info(`🔄 Párrafo largo (${normalized.length} chars) dividido en ${subChunks.length} sub-chunks`);

        subChunks.forEach(subText => {
          chunks.push({
            text: subText,
            keywords: extractKeywords(subText)
          });
        });
      } else {
        chunks.push({
          text: normalized,
          keywords: extractKeywords(normalized)
        });
      }
    }
  }

  // También buscar patrones de pregunta-respuesta (formato antiguo)
  const qaPattern = /(?:pregunta|p)[:\s]*(.+?)(?:respuesta|r)[:\s]*(.+?)(?=(?:pregunta|p)[:\s]|$)/gis;
  let match;

  while ((match = qaPattern.exec(cleanedText)) !== null) {
    const qaText = `Pregunta: ${match[1].trim()}\nRespuesta: ${match[2].trim()}`;
    const qaKeywords = extractKeywords(match[1] + ' ' + match[2]);

    if (qaText.length > CHUNK_SIZE) {
      // Si el Q&A es muy largo, dividirlo también
      const subChunks = splitIntoChunks(qaText, CHUNK_SIZE, CHUNK_OVERLAP);
      logger.info(`📏 Q&A largo (${qaText.length} chars) dividido en ${subChunks.length} sub-chunks`);

      subChunks.forEach(subChunk => {
        chunks.push({
          text: subChunk,
          keywords: qaKeywords, // Reutilizar keywords del padre
          isQA: true
        });
      });
    } else {
      chunks.push({
        text: qaText,
        keywords: qaKeywords,
        isQA: true
      });
    }
  }

  logger.info(`📄 Extraídos ${chunks.length} chunks del texto`);
  return chunks;
}

/**
 * ✅ NUEVO: Limpia caracteres problemáticos de PDFs
 *
 * Los PDFs extraídos con pdf-parse a veces tienen caracteres
 * codificados incorrectamente. Esta función los normaliza.
 *
 * ⚠️ IMPORTANTE: NO eliminar saltos de línea, son necesarios
 * para detectar la estructura Q&A.
 */
function cleanPdfText(text) {
  // Reemplazos comunes de caracteres mal codificados
  const replacements = [
    // Caracteres acentuados comunes mal codificados
    [/ǭ/g, 'ó'],
    [/ǧ/g, 'í'],
    [/ǯ/g, 'ú'],
    [/ń/g, 'ñ'],
    [/š/g, 'á'],
    [/ě/g, 'é'],
    [/č/g, 'í'],

    // Caracteres de reemplazo
    [/'/g, 'ó'],
    [/%/g, 'ó'],
    [/‚/g, ''],
    [/'/g, ''],
    [/"/g, '"'],
    [/"/g, '"'],
    [/–/g, '-'],
    [/—/g, '-']
  ];

  let cleaned = text;

  for (const [pattern, replacement] of replacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // ✅ CORREGIDO: Solo normalizar espacios en línea, NO saltos de línea
  // Dividir por líneas, limpiar cada línea, y volver a unir
  const lines = cleaned.split('\n');
  const cleanedLines = lines.map(line => {
    // Normalizar espacios y tabs DENTRO de cada línea
    return line.replace(/[ \t]+/g, ' ').trim();
  });

  cleaned = cleanedLines.join('\n').trim();

  logger.debug(`🧹 Texto limpio: ${text.substring(0, 50)}... → ${cleaned.substring(0, 50)}...`);

  return cleaned;
}

/**
 * Extrae palabras clave de un texto
 */
function extractKeywords(text) {
  const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'que', 'es', 'son', 'para', 'por', 'con', 'se', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'fue', 'han', 'muy', 'sin', 'sobre', 'este', 'entre', 'cuando', 'ser', 'hay', 'todo', 'esta', 'desde', 'nos', 'durante', 'uno', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ella', 'dos', 'tan', 'poco', 'estos', 'parte'];

  const words = text.toLowerCase()
    .replace(/[^\wáéíóúüñ\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w));

  // Eliminar duplicados y retornar
  return [...new Set(words)];
}

/**
 * Sube y procesa un archivo
 * ✅ MEJORADO: Ahora acepta stageId para asociar a una etapa y guarda en carpetas
 */
async function uploadFile(file, stageId = null) {
  const ext = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}_${file.originalname}`;

  // ✅ NUEVO: Determinar directorio de destino
  let targetDir = KNOWLEDGE_DIR;

  // ✅ CORREGIDO: Si hay stageId, usar la carpeta de la etapa
  // ⚠️ IMPORTANTE: NO asignar etapa por defecto - el documento debe asociarse
  // ÚNICAMENTE a la etapa que el usuario seleccionó en el frontend
  if (stageId) {
    try {
      const stagesService = require('./stages.service');
      targetDir = stagesService.getStageFolder(stageId);
      logger.info(`📁 Usando carpeta de etapa: ${targetDir} (stageId: ${stageId})`);
    } catch (e) {
      logger.warn('No se pudo obtener carpeta de etapa, usando directorio general:', e.message);
      targetDir = KNOWLEDGE_DIR;
    }
  } else {
    // ⚠️ CORREGIDO: Si no se proporciona stageId, NO asignar etapa por defecto
    // Guardar en la carpeta raíz sin asociación a etapa específica
    logger.warn('⚠️ No se proporcionó stageId - el documento se guardará sin asociación a etapa');
    logger.warn('   El frontend debe enviar siempre el stageId de la etapa activa');
  }

  const filePath = path.join(targetDir, fileName);

  // Guardar archivo
  fs.writeFileSync(filePath, file.buffer);

  let processedData;

  if (ext === '.txt') {
    processedData = await processTxtFile(filePath, file.originalname);
  } else if (ext === '.pdf') {
    processedData = await processPdfFile(filePath, file.originalname);
  } else {
    fs.unlinkSync(filePath);
    throw new Error('Tipo de archivo no soportado. Use PDF o TXT.');
  }

  // ✅ NUEVO: Guardar ruta relativa desde knowledge_files
  const relativePath = path.relative(KNOWLEDGE_DIR, filePath).replace(/\\/g, '/');

  // Agregar al índice
  const fileEntry = {
    id: Date.now().toString(),
    fileName: fileName,
    originalName: file.originalname,
    type: ext.replace('.', ''),
    size: file.size,
    chunksCount: processedData.chunks.length,
    uploadDate: processedData.uploadDate,
    // ✅ NUEVO: Asociación con etapa y ruta relativa
    stageId: stageId || null,
    relativePath: relativePath // Ruta relativa desde knowledge_files
  };

  knowledgeIndex.files.push(fileEntry);
  saveIndex();

  // ✅ NUEVO: Generar embeddings para los chunks (si no tienen)
  try {
    const embeddingsService = require('./embeddings.service');
    const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(processedData.chunks);

    // Actualizar datos procesados con embeddings
    processedData.chunks = chunksWithEmbeddings;

    logger.info(`🧠 Embeddings generados para ${chunksWithEmbeddings.length} chunks`);
  } catch (error) {
    logger.warn(`⚠️ No se pudieron generar embeddings: ${error.message}`);
    logger.warn(`   El archivo se guardará sin embeddings (se generarán en la primera búsqueda)`);
  }

  // Guardar datos procesados en la misma carpeta
  const dataPath = path.join(targetDir, `${fileEntry.id}_data.json`);
  fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2));

  logger.info(`Archivo cargado: ${file.originalname} (${processedData.chunks.length} chunks) [Etapa: ${stageId || 'Sin asignar'}] [Ruta: ${relativePath}]`);

  // ✅ NUEVO: Invalidar caché de embeddings para que se recargue
  try {
    const embeddingsService = require('./embeddings.service');
    embeddingsService.reloadChunks();
  } catch (e) {
    // Ignorar error si el servicio no está inicializado
  }

  // ✅ OPTIMIZADO: Invalidar cache de datos de archivo
  fileDataCache.delete(fileEntry.id);

  return fileEntry;
}

/**
 * Obtiene la lista de archivos cargados
 */
function getUploadedFiles() {
  return knowledgeIndex.files;
}

/**
 * ✅ FIX: Obtiene solo archivos de etapas activas (o sin etapa)
 * Usado por chat.service.js para decidir si activar RAG
 */
function getActiveUploadedFiles() {
  const activeStages = stagesService.getActiveStages();
  const activeStageIds = activeStages.map(s => s.id);
  return knowledgeIndex.files.filter(f =>
    f.is_active !== false &&
    (!f.stageId || activeStageIds.includes(f.stageId))
  );
}

/**
 * ✅ HELPER: Divide texto largo en chunks con solapamiento
 */
function splitIntoChunks(text, maxSize, overlap) {
  if (text.length <= maxSize) return [text];

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxSize;

    // Si no estamos al final, intentar cortar en un espacio o punto para no cortar palabras
    if (endIndex < text.length) {
      // Buscar el último punto o espacio dentro del rango de seguridad (últimos 100 chars del chunk)
      const lookBackLimit = Math.max(startIndex, endIndex - 100);
      let breakPoint = -1;

      // Intentar encontrar un punto seguido de espacio
      const lastPeriod = text.lastIndexOf('. ', endIndex);
      if (lastPeriod >= lookBackLimit) {
        breakPoint = lastPeriod + 1; // Incluir el punto
      }
      // Si no, buscar el último espacio
      else {
        const lastSpace = text.lastIndexOf(' ', endIndex);
        if (lastSpace >= lookBackLimit) {
          breakPoint = lastSpace;
        }
      }

      // Si encontramos un buen punto de corte, usarlo
      if (breakPoint !== -1) {
        endIndex = breakPoint;
      }
    }

    const chunk = text.substring(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Avanzar, restando el overlap si no hemos terminado
    if (endIndex >= text.length) {
      break;
    }

    startIndex = endIndex - overlap;
    // Asegurar que avanzamos
    if (startIndex <= startIndex + overlap - maxSize) { // Evitar bucles infinitos si algo falla
      startIndex = endIndex;
    }
  }

  return chunks;
}

/**
 * ✅ NUEVO: Obtiene archivos filtrados por etapa
 */
function getFilesByStage(stageId) {
  if (!stageId) {
    return knowledgeIndex.files;
  }
  return knowledgeIndex.files.filter(f => f.stageId === stageId);
}

/**
 * ✅ FIX: Limpia la cache de datos de archivos
 * Llamado cuando se toggle una etapa para forzar re-lectura de disco
 */
function clearFileDataCache() {
  fileDataCache.clear();
  logger.info('🧹 Cache de datos de archivos limpiado');
}

/**
 * Elimina un archivo
 * ✅ MEJORADO: Soporta archivos en subcarpetas de etapas
 */
function deleteFile(fileId) {
  const fileIndex = knowledgeIndex.files.findIndex(f => f.id === fileId);

  if (fileIndex === -1) {
    throw new Error('Archivo no encontrado');
  }

  const file = knowledgeIndex.files[fileIndex];

  // ✅ MEJORADO: Determinar rutas de los archivos físicos
  let filePath, dataPath;

  if (file.relativePath) {
    // Usar ruta relativa
    filePath = path.join(KNOWLEDGE_DIR, file.relativePath);
    dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
  } else {
    // Compatibilidad con archivos antiguos
    filePath = path.join(KNOWLEDGE_DIR, file.fileName);

    // Si no existe y tiene stageId, buscar en carpeta de etapa
    if (!fs.existsSync(filePath) && file.stageId) {
      const stagesService = require('./stages.service');
      const stageFolder = stagesService.getStageFolder(file.stageId);
      filePath = path.join(stageFolder, file.fileName);
      dataPath = path.join(stageFolder, `${file.id}_data.json`);
    } else {
      dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
    }
  }

  // Eliminar archivos físicos
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

  // Eliminar del índice
  knowledgeIndex.files.splice(fileIndex, 1);
  saveIndex();

  // ✅ OPTIMIZADO: Invalidar cache de datos de archivo
  fileDataCache.delete(file.id);

  logger.info(`Archivo eliminado: ${file.originalName}`);
  return true;
}

/**
 * ✅ OPTIMIZADO: Obtiene datos de archivo desde cache o disco
 * @param {string} fileId - ID del archivo
 * @param {string} dataPath - Ruta al archivo JSON en disco
 * @returns {Object|null} Datos parseados
 */
function getCachedFileData(fileId, dataPath) {
  // Verificar cache
  const cached = fileDataCache.get(fileId);
  if (cached) {
    return cached.data;
  }

  // Leer del disco y cachear
  if (!fs.existsSync(dataPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    fileDataCache.set(fileId, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    logger.warn(`Error leyendo datos de archivo ${fileId}:`, error.message);
    return null;
  }
}


/**
 * Busca en todos los archivos cargados
 *
 * ✅ OPTIMIZADO: Usa cache en memoria para evitar I/O de disco
 * ✅ MEJORADO: Respeta activation de stages
 */
function searchInFiles(query) {
  const results = [];

  // Normalizar query de múltiples formas para ser más flexible
  const queryLower = query.toLowerCase();
  const queryUpper = query.toUpperCase();
  const queryCapitalized = query.charAt(0).toUpperCase() + query.slice(1).toLowerCase();

  // Remover espacios extras y normalizar
  const queryNormalized = query.trim().replace(/\s+/g, ' ');

  // Remover acentos para búsqueda más flexible
  const queryNoAccents = removeAccents(queryLower);

  // Extraer palabras clave
  const queryKeywords = extractKeywords(query);

  logger.debug(`🔍 Buscando: "${query}" (normalizado: "${queryNormalized}", sin acentos: "${queryNoAccents}")`);

  // ✅ FIX: Obtener stages activos
  const activeStages = stagesService.getActiveStages();
  const activeStageIds = activeStages.map(s => s.id);

  // ✅ FIX: Filtrar archivos activos (sin stage o en stage activo)
  const activeFiles = knowledgeIndex.files.filter(f =>
    f.is_active !== false &&
    (!f.stageId || activeStageIds.includes(f.stageId))
  );

  for (const file of activeFiles) {

    // ✅ MEJORADO: Determinar ruta del archivo de datos
    let dataPath;

    if (file.relativePath) {
      // Usar ruta relativa
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
    } else {
      // Compatibilidad con archivos antiguos
      dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);

      // Si no existe y tiene stageId, buscar en carpeta de etapa
      if (!fs.existsSync(dataPath) && file.stageId) {
        const stagesService = require('./stages.service');
        const stageFolder = stagesService.getStageFolder(file.stageId);
        dataPath = path.join(stageFolder, `${file.id}_data.json`);
      }
    }

    // ✅ OPTIMIZADO: Usar cache en memoria
    const data = getCachedFileData(file.id, dataPath);
    if (!data) continue;

    try {
      for (const chunk of data.chunks) {
        // Calcular relevancia
        let score = 0;

        // Coincidencia directa exacta - probar múltiples variaciones
        const chunkText = chunk.text;
        const chunkTextLower = chunkText.toLowerCase();
        const chunkTextNoAccents = removeAccents(chunkTextLower);

        // Búsqueda exacta (case-sensitive) - mayor peso
        if (chunkText.includes(query)) {
          score += 30;
        }

        // Búsqueda con diferentes variaciones de mayúsculas
        if (chunkTextLower.includes(queryLower)) {
          score += 20;
        }
        if (chunkText.includes(queryUpper)) {
          score += 15;
        }
        if (chunkText.includes(queryCapitalized)) {
          score += 15;
        }

        // ✅ NUEVO: Búsqueda sin acentos (más flexible)
        if (chunkTextNoAccents.includes(queryNoAccents)) {
          score += 12;
        }

        // Coincidencia de palabras clave - aumentar peso
        for (const keyword of queryKeywords) {
          const keywordLower = keyword.toLowerCase();
          const keywordNoAccents = removeAccents(keywordLower);

          // Buscar en palabras clave del chunk
          if (chunk.keywords.includes(keyword)) {
            score += 8;
          }
          if (chunk.keywords.includes(keywordNoAccents)) {
            score += 5;
          }
          // Buscar en texto del chunk
          if (chunkTextLower.includes(keywordLower)) {
            score += 4;
          }
          if (chunkTextNoAccents.includes(keywordNoAccents)) {
            score += 3;
          }
        }

        logger.debug(`  Chunk score: ${score} (buscando "${query}")`);

        if (score > 0) {
          results.push({
            text: chunk.text,
            score: score,
            source: file.originalName,
            isQA: chunk.isQA || false
          });
        }
      }
    } catch (error) {
      logger.warn(`Error leyendo datos de ${file.originalName}:`, error.message);
    }
  }

  logger.debug(`🎯 Resultados encontrados: ${results.length}`);

  // ✅ NUEVO: Si no hay resultados exactos pero hay palabras clave, intentar búsqueda más laxa
  if (results.length === 0 && queryKeywords.length > 0) {
    logger.info(`🔄 Sin resultados exactos, intentando búsqueda laxa por palabras clave...`);

    // ✅ FIX: Usar activeFiles también para la búsqueda laxa
    for (const file of activeFiles) {
      // ✅ CORREGIDO: Usar la misma lógica que la búsqueda principal
      // para encontrar archivos en subcarpetas de etapas
      let dataPath;

      if (file.relativePath) {
        // Usar ruta relativa
        dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
      } else {
        // Compatibilidad con archivos antiguos
        dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);

        // Si no existe y tiene stageId, buscar en carpeta de etapa
        if (!fs.existsSync(dataPath) && file.stageId) {
          try {
            const stagesService = require('./stages.service');
            const stageFolder = stagesService.getStageFolder(file.stageId);
            dataPath = path.join(stageFolder, `${file.id}_data.json`);
          } catch (e) {
            // Ignorar error y continuar
          }
        }
      }

      if (!fs.existsSync(dataPath)) continue;

      try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        for (const chunk of data.chunks) {
          const chunkTextLower = chunk.text.toLowerCase();
          const chunkTextNoAccents = removeAccents(chunkTextLower);

          // Verificar si al menos una palabra clave está presente (incluso parcial)
          let partialScore = 0;
          for (const keyword of queryKeywords) {
            const keywordNoAccents = removeAccents(keyword.toLowerCase());

            // Búsqueda parcial de palabra clave (al menos 4 caracteres)
            if (keyword.length >= 4) {
              for (let i = 0; i <= keyword.length - 4; i++) {
                const partial = keyword.substring(i, i + 4);
                if (chunkTextNoAccents.includes(partial) || chunkTextLower.includes(partial)) {
                  partialScore += 1;
                  break; // Contar la palabra clave solo una vez
                }
              }
            }
          }

          if (partialScore > 0) {
            logger.info(`  ✅ Encontrado coincidencia parcial: score=${partialScore}`);
            results.push({
              text: chunk.text,
              score: partialScore,
              source: file.originalName,
              isQA: chunk.isQA || false,
              isPartial: true // Marcar como coincidencia parcial
            });
          }
        }
      } catch (error) {
        logger.warn(`Error en búsqueda laxa de ${file.originalName}:`, error.message);
      }
    }
  }

  // Ordenar por relevancia y retornar top 5
  const sorted = results.sort((a, b) => b.score - a.score);

  logger.info(`📊 Total resultados (incluyendo parciales): ${sorted.length}`);

  return sorted.slice(0, 5);
}

/**
 * ✅ NUEVO: Elimina acentos de una cadena para búsqueda más flexible
 */
function removeAccents(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
    .replace(/ñ/g, 'n') // Reemplazar ñ
    .replace(/Ñ/g, 'N'); // Reemplazar Ñ
}

/**
 * Obtiene contexto relevante de los archivos subidos
 */
function getContextFromFiles(query, maxResults = 3) {
  const results = searchInFiles(query);

  if (results.length === 0) return '';

  return results
    .slice(0, maxResults)
    .map(r => r.text)
    .join('\n\n---\n\n');
}

// ===========================================
// ✅ NUEVAS FUNCIONES PARA EMBEDDINGS
// ===========================================

/**
 * Obtiene los datos procesados de un archivo
 *
 * @param {Object} fileEntry - Entrada del archivo del índice
 * @returns {Promise<Object|null>} Datos procesados con chunks
 */
async function getFileData(fileEntry) {
  try {
    let dataPath;

    if (fileEntry.relativePath) {
      // Usar ruta relativa
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(fileEntry.relativePath), `${fileEntry.id}_data.json`);
    } else if (fileEntry.stageId) {
      // Buscar en carpeta de etapa
      try {
        const stagesService = require('./stages.service');
        const stageFolder = stagesService.getStageFolder(fileEntry.stageId);
        dataPath = path.join(stageFolder, `${fileEntry.id}_data.json`);
      } catch (e) {
        dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
      }
    } else {
      // Compatibilidad con archivos antiguos
      dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
    }

    if (!fs.existsSync(dataPath)) {
      logger.warn(`⚠️ Archivo de datos no encontrado: ${dataPath}`);
      return null;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return data;
  } catch (error) {
    logger.error(`❌ Error leyendo datos de ${fileEntry.originalName}:`, error.message);
    return null;
  }
}

/**
 * Guarda los datos procesados de un archivo (con embeddings)
 *
 * @param {Object} fileEntry - Entrada del archivo del índice
 * @param {Object} data - Datos procesados con chunks
 */
async function saveFileData(fileEntry, data) {
  try {
    let dataPath;

    if (fileEntry.relativePath) {
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(fileEntry.relativePath), `${fileEntry.id}_data.json`);
    } else if (fileEntry.stageId) {
      try {
        const stagesService = require('./stages.service');
        const stageFolder = stagesService.getStageFolder(fileEntry.stageId);
        dataPath = path.join(stageFolder, `${fileEntry.id}_data.json`);
      } catch (e) {
        dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
      }
    } else {
      dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
    }

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    logger.info(`💾 Datos guardados: ${fileEntry.originalName}`);
  } catch (error) {
    logger.error(`❌ Error guardando datos de ${fileEntry.originalName}:`, error.message);
    throw error;
  }
}

// ===========================================
// ✅ NUEVO: FUNCIONES PARA DOCUMENTOS MANUALES
// ===========================================

/**
 * Creates a manual document from text content.
 * Reuses the existing pipeline: processTxtFile → extractChunks → ensureEmbeddings → reloadChunks
 *
 * @param {string} title - Document title (used as filename)
 * @param {string} content - Text content of the document
 * @param {string} stageId - Stage ID to associate the document with
 * @returns {Promise<Object>} The created file entry
 */
async function createManualDocument(title, content, stageId) {
  // Sanitize title for filename
  const safeTitle = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-_]/g, '').trim();
  const fileName = `${Date.now()}_${safeTitle}.txt`;

  // Determine target directory (same logic as uploadFile)
  let targetDir = KNOWLEDGE_DIR;
  if (stageId) {
    try {
      const stagesService = require('./stages.service');
      targetDir = stagesService.getStageFolder(stageId);
      logger.info(`📁 Manual doc: using stage folder: ${targetDir} (stageId: ${stageId})`);
    } catch (e) {
      logger.warn('Could not get stage folder for manual doc, using default dir:', e.message);
      targetDir = KNOWLEDGE_DIR;
    }
  }

  const filePath = path.join(targetDir, fileName);

  // Write content as TXT file
  fs.writeFileSync(filePath, content, 'utf8');

  // Process using existing pipeline
  const processedData = await processTxtFile(filePath, `${safeTitle}.txt`);

  // Calculate relative path
  const relativePath = path.relative(KNOWLEDGE_DIR, filePath).replace(/\\/g, '/');

  // Create file entry (same structure as uploadFile)
  const fileEntry = {
    id: Date.now().toString(),
    fileName: fileName,
    originalName: `${safeTitle}.txt`,
    type: 'txt',
    size: Buffer.byteLength(content, 'utf8'),
    chunksCount: processedData.chunks.length,
    uploadDate: processedData.uploadDate,
    stageId: stageId || null,
    relativePath: relativePath,
    isManual: true  // Flag to identify manually created documents
  };

  // Add to index
  knowledgeIndex.files.push(fileEntry);
  saveIndex();

  // Generate embeddings (same as uploadFile)
  try {
    const embeddingsService = require('./embeddings.service');
    const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(processedData.chunks);
    processedData.chunks = chunksWithEmbeddings;
    logger.info(`🧠 Manual doc: embeddings generated for ${chunksWithEmbeddings.length} chunks`);
  } catch (error) {
    logger.warn(`⚠️ Manual doc: could not generate embeddings: ${error.message}`);
  }

  // Save processed data JSON
  const dataPath = path.join(targetDir, `${fileEntry.id}_data.json`);
  fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2));

  logger.info(`✏️ Manual document created: ${safeTitle}.txt (${processedData.chunks.length} chunks) [Stage: ${stageId}]`);

  // Reload embeddings cache
  try {
    const embeddingsService = require('./embeddings.service');
    embeddingsService.reloadChunks();
  } catch (e) {
    // Ignore if service not initialized
  }

  // Invalidate file data cache
  fileDataCache.delete(fileEntry.id);

  return fileEntry;
}

/**
 * Updates the content (and optionally the title) of an existing document.
 * Re-processes the document through the full pipeline.
 *
 * @param {string} fileId - ID of the file to update
 * @param {string} newContent - New text content
 * @param {string} [newTitle] - Optional new title for the document
 * @returns {Promise<Object>} The updated file entry
 */
async function updateManualDocument(fileId, newContent, newTitle) {
  const fileIndex = knowledgeIndex.files.findIndex(f => f.id === fileId);
  if (fileIndex === -1) {
    throw new Error('Document not found');
  }

  const file = knowledgeIndex.files[fileIndex];

  // Resolve the physical file path (same logic as deleteFile)
  let filePath, dataPath;
  if (file.relativePath) {
    filePath = path.join(KNOWLEDGE_DIR, file.relativePath);
    dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
  } else {
    filePath = path.join(KNOWLEDGE_DIR, file.fileName);
    if (!fs.existsSync(filePath) && file.stageId) {
      const stagesService = require('./stages.service');
      const stageFolder = stagesService.getStageFolder(file.stageId);
      filePath = path.join(stageFolder, file.fileName);
      dataPath = path.join(stageFolder, `${file.id}_data.json`);
    } else {
      dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
    }
  }

  // If title changed, rename the physical file and update index metadata
  if (newTitle && newTitle.trim()) {
    const trimmedTitle = newTitle.trim();
    const safeTitle = trimmedTitle.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-_]/g, '').trim();
    const newOriginalName = safeTitle.endsWith('.txt') ? safeTitle : `${safeTitle}.txt`;

    // Build new file name preserving the timestamp prefix
    const timestampPrefix = file.fileName.split('_')[0];
    const newFileName = `${timestampPrefix}_${newOriginalName}`;
    const targetDir = path.dirname(filePath);
    const newFilePath = path.join(targetDir, newFileName);

    // Rename file on disk (only if path actually changed)
    if (filePath !== newFilePath && fs.existsSync(filePath)) {
      fs.renameSync(filePath, newFilePath);
      logger.info(`📝 File renamed: ${file.fileName} → ${newFileName}`);
    }

    // Update index entry
    knowledgeIndex.files[fileIndex].originalName = newOriginalName;
    knowledgeIndex.files[fileIndex].fileName = newFileName;
    knowledgeIndex.files[fileIndex].relativePath = path.relative(KNOWLEDGE_DIR, newFilePath).replace(/\\/g, '/');

    // Point to the new path for content writing below
    filePath = newFilePath;
  }

  // Overwrite the physical TXT file
  fs.writeFileSync(filePath, newContent, 'utf8');

  // Re-process using existing pipeline
  const processedData = await processTxtFile(filePath, knowledgeIndex.files[fileIndex].originalName);

  // Generate embeddings
  try {
    const embeddingsService = require('./embeddings.service');
    const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(processedData.chunks);
    processedData.chunks = chunksWithEmbeddings;
    logger.info(`🧠 Updated doc: embeddings generated for ${chunksWithEmbeddings.length} chunks`);
  } catch (error) {
    logger.warn(`⚠️ Updated doc: could not generate embeddings: ${error.message}`);
  }

  // Save updated data JSON
  fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2));

  // Update index entry
  knowledgeIndex.files[fileIndex].chunksCount = processedData.chunks.length;
  knowledgeIndex.files[fileIndex].size = Buffer.byteLength(newContent, 'utf8');
  saveIndex();

  logger.info(`✏️ Document updated: ${knowledgeIndex.files[fileIndex].originalName} (${processedData.chunks.length} chunks)`);

  // Reload embeddings cache (forces vector search to use updated data)
  try {
    const embeddingsService = require('./embeddings.service');
    embeddingsService.reloadChunks();
    logger.info('[Knowledge] Embeddings cache reloaded after document update');
  } catch (e) {
    logger.warn('[Knowledge] Could not reload embeddings cache:', e.message);
  }

  // ✅ FIX: Clear ALL file data cache to ensure searchInFiles() reads fresh data
  // Previously only deleted the single file's cache entry, but this ensures
  // no stale data persists for keyword-based search.
  clearFileDataCache();

  return knowledgeIndex.files[fileIndex];
}

/**
 * Reads the raw text content of a document file.
 *
 * @param {string} fileId - ID of the file to read
 * @returns {Object} { content, fileName, originalName }
 */
function getDocumentContent(fileId) {
  const file = knowledgeIndex.files.find(f => f.id === fileId);
  if (!file) {
    throw new Error('Document not found');
  }

  // Resolve physical path (same logic as download endpoint)
  let filePath;
  if (file.relativePath) {
    filePath = path.join(KNOWLEDGE_DIR, file.relativePath);
  } else {
    filePath = path.join(KNOWLEDGE_DIR, file.fileName);
    if (!fs.existsSync(filePath) && file.stageId) {
      const stagesService = require('./stages.service');
      const stageFolder = stagesService.getStageFolder(file.stageId);
      filePath = path.join(stageFolder, file.fileName);
    }
  }

  if (!fs.existsSync(filePath)) {
    throw new Error('Physical file not found on disk');
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return {
    content,
    fileName: file.fileName,
    originalName: file.originalName
  };
}

/**
 * ✅ NUEVO: Activa o desactiva un documento individual
 *
 * @param {string} fileId - ID del documento
 * @param {boolean} isActive - true para activar, false para desactivar
 * @returns {Object} El documento actualizado
 */
function toggleDocumentActive(fileId, isActive) {
  const file = knowledgeIndex.files.find(f => f.id === fileId);

  if (!file) {
    throw new Error('Documento no encontrado');
  }

  file.is_active = isActive;
  file.updatedAt = Date.now();

  saveIndex();

  logger.info(`${isActive ? '🟢' : '🔴'} Documento "${file.originalName}" ${isActive ? 'ACTIVADO' : 'DESACTIVADO'}`);

  return file;
}

module.exports = {
  uploadFile,
  getUploadedFiles,
  getActiveUploadedFiles,  // ✅ FIX: Solo archivos de etapas activas + documentos activos
  getFilesByStage,
  deleteFile,
  searchInFiles,
  getContextFromFiles,
  clearFileDataCache,      // ✅ FIX: Invalidación de cache externa
  processTxtFile,  // ✅ Exportado para script de reproceso
  getFileData,     // ✅ NUEVO: Para embeddings
  saveFileData,    // ✅ NUEVO: Para embeddings
  createManualDocument,    // ✅ NUEVO: Crear documento manual
  updateManualDocument,    // ✅ NUEVO: Editar documento existente
  getDocumentContent,      // ✅ NUEVO: Leer contenido de documento
  toggleDocumentActive,    // ✅ NUEVO: Toggle individual de documentos
};
