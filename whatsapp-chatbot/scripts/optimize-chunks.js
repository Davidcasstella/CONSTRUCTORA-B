/**
 * ===========================================
 * SCRIPT: OPTIMIZACIÓN DE CHUNKING
 * ===========================================
 *
 * Reprocesa todos los documentos con una estrategia
 * de chunking mejorada y regenera embeddings.
 *
 * MEJORAS:
 * - Chunks semánticos (respeta estructura Q&A)
 * - Overlap entre chunks (20% de contexto)
 * - Tamaño óptimo para FAQs (200-500 tokens)
 * - Preserva metadatos
 *
 * USO:
 *   node scripts/optimize-chunks.js --dry-run  (solo muestra)
 *   node scripts/optimize-chunks.js            (reprocesa todo)
 */

const fs = require('fs');
const path = require('path');

// Colores
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

const isDryRun = process.argv.includes('--dry-run');
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge_files');
const INDEX_PATH = path.join(KNOWLEDGE_DIR, 'index.json');

// ===========================================
// CONFIGURACIÓN DE CHUNKING OPTIMIZADO
// ===========================================

const CHUNK_CONFIG = {
  // Tamaño de chunk en caracteres
  minChunkSize: 100,    // Mínimo para evitar chunks demasiado cortos
  maxChunkSize: 800,    // Máximo para mantener relevancia
  targetChunkSize: 400, // Tamaño objetivo

  // Overlap
  overlapSize: 80,      // ~20% de overlap

  // Q&A específico
  preserveQA: true,     // Mantener pares Q&A juntos
  qaMinSize: 50,        // Mínimo para un Q&A válido
};

console.log(`${colors.cyan}===========================================`);
console.log(`  OPTIMIZACIÓN DE CHUNKING - NORBOY RAG`);
console.log(`===========================================${colors.reset}\n`);

if (isDryRun) {
  console.log(`${colors.yellow}🔍 MODO DRY-RUN: Solo mostrará cambios${colors.reset}\n`);
}

// ===========================================
// FUNCIONES DE CHUNKING MEJORADO
// ===========================================

/**
 * Detecta y extrae pares Q&A del texto
 */
function extractQAPairs(text) {
  const pairs = [];

  // Normalizar line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Patrón 1: Formato con emojis numerados (1️⃣ ¿Pregunta?)
  const emojiPattern = /(\d+[️⃣]*\s*[¿]?[^\n]+\?)\s*\n\s*(?:Respuesta:?)?\s*\n?\s*([^\d️⃣]+?)(?=\d+[️⃣]*\s*[¿]|$)/gi;

  // Patrón 2: Formato ### ¿Pregunta?
  const headerPattern = /###\s*([¿]?[^\n]+\?)\s*\n([^#]+?)(?=###|$)/gi;

  // Patrón 3: Formato P: / R:
  const prPattern = /(?:P:|Pregunta:)\s*([^\n]+)\s*\n\s*(?:R:|Respuesta:)\s*([^\n]+(?:\n(?!P:|Pregunta:)[^\n]+)*)/gi;

  // Patrón 4: Formato **P:** **R:**
  const boldPattern = /\*\*P:\*\*\s*([^\n]+)\s*\n\s*\*\*R:\*\*\s*([^\n]+)/gi;

  // Intentar cada patrón
  let match;

  // Patrón de headers markdown (### ¿Pregunta?)
  while ((match = headerPattern.exec(normalized)) !== null) {
    const question = match[1].trim().replace(/^[¿]/, '').replace(/\?$/, '');
    const answer = match[2].trim();

    if (question.length > 10 && answer.length > 20) {
      pairs.push({
        question,
        answer: cleanAnswer(answer),
        source: 'header_pattern'
      });
    }
  }

  // Si no encontramos con headers, intentar otros patrones
  if (pairs.length === 0) {
    while ((match = prPattern.exec(normalized)) !== null) {
      const question = match[1].trim();
      const answer = match[2].trim();

      if (question.length > 5 && answer.length > 10) {
        pairs.push({
          question,
          answer: cleanAnswer(answer),
          source: 'pr_pattern'
        });
      }
    }
  }

  return pairs;
}

/**
 * Limpia la respuesta de texto innecesario
 */
function cleanAnswer(answer) {
  return answer
    .replace(/\s*Estamos para servirle\.?\s*$/gi, '')
    .replace(/\s*---\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Divide texto en chunks con overlap
 */
function splitWithOverlap(text, maxSize, overlapSize) {
  const chunks = [];

  // Dividir por párrafos primero
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmedPara = para.trim();

    // Si el párrafo es muy largo, dividirlo
    if (trimmedPara.length > maxSize) {
      // Guardar chunk actual si existe
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Dividir párrafo largo en oraciones
      const sentences = trimmedPara.split(/(?<=[.!?])\s+/);
      let subChunk = '';

      for (const sentence of sentences) {
        if ((subChunk + ' ' + sentence).length > maxSize) {
          if (subChunk.length > 0) {
            chunks.push(subChunk.trim());
            // Overlap: tomar las últimas palabras
            const words = subChunk.split(/\s+/);
            const overlapWords = Math.ceil(words.length * 0.2);
            subChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
          } else {
            subChunk = sentence;
          }
        } else {
          subChunk = (subChunk + ' ' + sentence).trim();
        }
      }

      if (subChunk.length > 0) {
        currentChunk = subChunk;
      }
    } else {
      // Párrafo normal
      if ((currentChunk + '\n\n' + trimmedPara).length > maxSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // Overlap: últimas líneas del chunk anterior
          const lines = currentChunk.split('\n');
          const overlapLines = lines.slice(-1).join('\n');
          currentChunk = overlapLines + '\n\n' + trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      } else {
        currentChunk = (currentChunk + '\n\n' + trimmedPara).trim();
      }
    }
  }

  // Último chunk
  if (currentChunk.length >= CHUNK_CONFIG.minChunkSize) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Extrae palabras clave
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o',
    'que', 'es', 'son', 'para', 'por', 'con', 'se', 'su', 'al', 'lo',
    'como', 'más', 'pero', 'sus', 'le', 'ya', 'fue', 'han', 'muy', 'sin'
  ]);

  const words = text.toLowerCase()
    .replace(/[^\wáéíóúüñ\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Procesa contenido con estrategia optimizada
 */
function processContentOptimized(content, fileName) {
  const chunks = [];

  // 1. Intentar extraer pares Q&A
  const qaPairs = extractQAPairs(content);

  if (qaPairs.length > 0) {
    console.log(`   ${colors.green}✅ Detectados ${qaPairs.length} pares Q&A${colors.reset}`);

    for (const qa of qaPairs) {
      const text = `Pregunta: ¿${qa.question}?\nRespuesta: ${qa.answer}`;

      chunks.push({
        text,
        keywords: extractKeywords(text),
        isQA: true,
        question: qa.question,
        answer: qa.answer,
        source: fileName
      });
    }
  }

  // 2. Procesar el resto del contenido (no Q&A)
  // Remover las secciones Q&A ya procesadas
  let remainingContent = content;

  // Remover secciones markdown de Q&A
  remainingContent = remainingContent.replace(/###\s*[¿]?[^\n]+\?\s*\n[^#]+?(?=###|$)/gi, '\n');

  // Dividir con overlap
  const textChunks = splitWithOverlap(
    remainingContent,
    CHUNK_CONFIG.maxChunkSize,
    CHUNK_CONFIG.overlapSize
  );

  for (const text of textChunks) {
    if (text.length >= CHUNK_CONFIG.minChunkSize) {
      // Evitar duplicados con Q&A
      const isDuplicate = chunks.some(c =>
        c.text.includes(text.substring(0, 50)) ||
        text.includes(c.text.substring(0, 50))
      );

      if (!isDuplicate) {
        chunks.push({
          text: text.trim(),
          keywords: extractKeywords(text),
          isQA: false,
          source: fileName
        });
      }
    }
  }

  return chunks;
}

// ===========================================
// EJECUCIÓN PRINCIPAL
// ===========================================

async function main() {
  // Cargar índice
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  console.log(`📂 Archivos a procesar: ${index.files.length}\n`);

  let totalChunksOld = 0;
  let totalChunksNew = 0;
  let filesProcessed = 0;

  for (const file of index.files) {
    console.log(`${colors.blue}📄 ${file.originalName}${colors.reset}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Chunks actuales: ${file.chunksCount}`);

    totalChunksOld += file.chunksCount;

    // Buscar archivo de datos
    let dataPath;

    if (file.relativePath) {
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
    } else if (file.stageId) {
      // Intentar en subcarpeta de etapa
      const stageFolders = fs.readdirSync(KNOWLEDGE_DIR).filter(f =>
        fs.statSync(path.join(KNOWLEDGE_DIR, f)).isDirectory()
      );

      for (const folder of stageFolders) {
        const testPath = path.join(KNOWLEDGE_DIR, folder, `${file.id}_data.json`);
        if (fs.existsSync(testPath)) {
          dataPath = testPath;
          break;
        }
      }
    }

    if (!dataPath) {
      dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
    }

    if (!fs.existsSync(dataPath)) {
      console.log(`   ${colors.yellow}⚠️  Archivo de datos no encontrado: ${dataPath}${colors.reset}`);
      continue;
    }

    // Cargar datos
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    if (!data.content) {
      console.log(`   ${colors.yellow}⚠️  Sin contenido para reprocesar${colors.reset}`);
      continue;
    }

    // Reprocesar con estrategia optimizada
    const newChunks = processContentOptimized(data.content, file.originalName);

    console.log(`   ${colors.green}Chunks nuevos: ${newChunks.length}${colors.reset}`);

    totalChunksNew += newChunks.length;

    if (!isDryRun) {
      // Actualizar datos
      data.chunks = newChunks;
      data.chunkingStrategy = 'optimized_v2';
      data.chunkingDate = new Date().toISOString();
      data.chunkConfig = CHUNK_CONFIG;

      // Guardar
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      // Actualizar índice
      file.chunksCount = newChunks.length;
    }

    filesProcessed++;
    console.log('');
  }

  // Guardar índice actualizado
  if (!isDryRun) {
    index.lastUpdate = new Date().toISOString();
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  }

  // Resumen
  console.log(`${colors.cyan}===========================================`);
  console.log(`  RESUMEN`);
  console.log(`===========================================${colors.reset}`);
  console.log(`   Archivos procesados: ${filesProcessed}`);
  console.log(`   Chunks antes: ${totalChunksOld}`);
  console.log(`   Chunks después: ${totalChunksNew}`);
  console.log(`   Diferencia: ${totalChunksNew - totalChunksOld > 0 ? '+' : ''}${totalChunksNew - totalChunksOld}`);

  if (isDryRun) {
    console.log(`\n${colors.yellow}💡 Ejecuta sin --dry-run para aplicar los cambios${colors.reset}`);
  } else {
    console.log(`\n${colors.green}✅ Chunking optimizado completado!${colors.reset}`);
    console.log(`\n${colors.yellow}⚠️  IMPORTANTE: Debes regenerar los embeddings:${colors.reset}`);
    console.log(`   node scripts/regenerate-embeddings.js`);
  }
}

main().catch(console.error);
