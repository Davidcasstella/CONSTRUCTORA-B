/**
 * ===========================================
 * SCRIPT: REGENERAR EMBEDDINGS
 * ===========================================
 *
 * Regenera los embeddings para todos los chunks
 * usando el proveedor configurado (Xenova o OpenAI).
 *
 * USO:
 *   node scripts/regenerate-embeddings.js
 */

const fs = require('fs');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config();

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge_files');
const INDEX_PATH = path.join(KNOWLEDGE_DIR, 'index.json');

console.log(`${colors.cyan}===========================================`);
console.log(`  REGENERACIÓN DE EMBEDDINGS - NORBOY RAG`);
console.log(`===========================================${colors.reset}\n`);

async function main() {
  // Importar servicios (después de cargar dotenv)
  const embeddingsService = require('../src/services/embeddings.service');

  // Cargar índice
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  console.log(`📂 Archivos a procesar: ${index.files.length}\n`);

  let totalChunks = 0;
  let totalProcessed = 0;
  let errors = 0;

  for (const file of index.files) {
    console.log(`${colors.blue}📄 ${file.originalName}${colors.reset}`);

    // Buscar archivo de datos
    let dataPath;

    if (file.relativePath) {
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
    } else if (file.stageId) {
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
      console.log(`   ${colors.yellow}⚠️  Archivo de datos no encontrado${colors.reset}`);
      errors++;
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

      if (!data.chunks || data.chunks.length === 0) {
        console.log(`   ${colors.yellow}⚠️  Sin chunks${colors.reset}`);
        continue;
      }

      console.log(`   Chunks: ${data.chunks.length}`);
      totalChunks += data.chunks.length;

      // Limpiar embeddings existentes para forzar regeneración
      for (const chunk of data.chunks) {
        delete chunk.embedding;
        delete chunk.embeddingGenerated;
        delete chunk.embeddingDate;
        delete chunk.embeddingProvider;
      }

      // Generar nuevos embeddings
      console.log(`   ${colors.cyan}🔄 Generando embeddings...${colors.reset}`);

      const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(data.chunks);

      // Actualizar datos
      data.chunks = chunksWithEmbeddings;
      data.embeddingsRegeneratedAt = new Date().toISOString();

      // Guardar
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      totalProcessed += data.chunks.length;
      console.log(`   ${colors.green}✅ Completado${colors.reset}\n`);

    } catch (error) {
      console.log(`   ${colors.red}❌ Error: ${error.message}${colors.reset}\n`);
      errors++;
    }
  }

  // Recargar chunks en memoria
  console.log(`${colors.cyan}🔄 Recargando chunks en memoria...${colors.reset}`);
  await embeddingsService.reloadChunks();

  // Estadísticas
  const stats = embeddingsService.getEmbeddingStats();

  console.log(`\n${colors.cyan}===========================================`);
  console.log(`  RESUMEN`);
  console.log(`===========================================${colors.reset}`);
  console.log(`   Archivos procesados: ${index.files.length - errors}/${index.files.length}`);
  console.log(`   Chunks procesados: ${totalProcessed}/${totalChunks}`);
  console.log(`   Errores: ${errors}`);
  console.log(`   Dimensión embeddings: ${stats.embeddingDimension}`);

  console.log(`\n${colors.green}✅ Regeneración de embeddings completada!${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Error fatal: ${error.message}${colors.reset}`);
  process.exit(1);
});
