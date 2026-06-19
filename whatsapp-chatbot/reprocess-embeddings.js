/**
 * ===========================================
 * SCRIPT DE REPROCESAMIENTO DE EMBEDDINGS
 * ===========================================
 *
 * Genera embeddings para todos los chunks existentes
 * que no los tengan aún.
 *
 * USO:
 *   node reprocess-embeddings.js
 *
 * OPCIONES:
 *   --force    - Regenerar todos los embeddings (incluso los existentes)
 *   --stats    - Solo mostrar estadísticas
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');

// Directorio de conocimiento
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge_files');
const KNOWLEDGE_INDEX = path.join(KNOWLEDGE_DIR, 'index.json');

// Cargar servicios
const knowledgeUploadService = require('./src/services/knowledge-upload.service');
const embeddingsService = require('./src/services/embeddings.service');

// ===========================================
// ARGUMENTOS DE LÍNEA DE COMANDOS
// ===========================================

const args = process.argv.slice(2);
const FORCE_REGENERATE = args.includes('--force');
const STATS_ONLY = args.includes('--stats');

// ===========================================
// FUNCIONES
// ===========================================

/**
 * Muestra estadísticas de embeddings
 */
async function showStats() {
  console.log('\n📊 ESTADÍSTICAS DE EMBEDDINGS\n');

  // Cargar índice
  let index;
  try {
    index = JSON.parse(fs.readFileSync(KNOWLEDGE_INDEX, 'utf8'));
  } catch (e) {
    console.error('❌ Error cargando índice:', e.message);
    process.exit(1);
  }

  let totalChunks = 0;
  let chunksWithEmbeddings = 0;
  let chunksWithoutEmbeddings = 0;

  const filesByStatus = {
    withEmbeddings: [],
    withoutEmbeddings: [],
    error: []
  };

  console.log('📂 Analizando archivos...\n');

  for (const file of index.files) {
    try {
      const data = await knowledgeUploadService.getFileData(file);

      if (!data || !data.chunks) {
        filesByStatus.error.push({ file: file.originalName, reason: 'Sin datos o chunks' });
        continue;
      }

      totalChunks += data.chunks.length;

      const withEmb = data.chunks.filter(c => c.embedding && c.embedding.length > 0).length;
      const withoutEmb = data.chunks.length - withEmb;

      chunksWithEmbeddings += withEmb;
      chunksWithoutEmbeddings += withoutEmb;

      if (withoutEmb === 0) {
        filesByStatus.withEmbeddings.push({
          file: file.originalName,
          chunks: data.chunks.length
        });
      } else {
        filesByStatus.withoutEmbeddings.push({
          file: file.originalName,
          total: data.chunks.length,
          without: withoutEmb
        });
      }
    } catch (error) {
      filesByStatus.error.push({ file: file.originalName, reason: error.message });
    }
  }

  // Mostrar resumen
  console.log('📈 RESUMEN GENERAL:');
  console.log(`   Total archivos: ${index.files.length}`);
  console.log(`   Total chunks: ${totalChunks}`);
  console.log(`   ✅ Con embeddings: ${chunksWithEmbeddings} (${((chunksWithEmbeddings/totalChunks)*100).toFixed(1)}%)`);
  console.log(`   ❌ Sin embeddings: ${chunksWithoutEmbeddings} (${((chunksWithoutEmbeddings/totalChunks)*100).toFixed(1)}%)`);

  // Archivos completos
  if (filesByStatus.withEmbeddings.length > 0) {
    console.log('\n✅ ARCHIVOS COMPLETOS (todos los chunks con embeddings):');
    filesByStatus.withEmbeddings.forEach(f => {
      console.log(`   ✓ ${f.file} (${f.chunks} chunks)`);
    });
  }

  // Archivos incompletos
  if (filesByStatus.withoutEmbeddings.length > 0) {
    console.log('\n⚠️  ARCHIVOS INCOMPLETOS (faltan embeddings):');
    filesByStatus.withoutEmbeddings.forEach(f => {
      console.log(`   ⚠️  ${f.file}: ${f.without}/${f.total} chunks sin embeddings`);
    });
  }

  // Errores
  if (filesByStatus.error.length > 0) {
    console.log('\n❌ ARCHIVOS CON ERRORES:');
    filesByStatus.error.forEach(f => {
      console.log(`   ❌ ${f.file}: ${f.reason}`);
    });
  }

  console.log('');

  // Estimación de costos
  if (chunksWithoutEmbeddings > 0) {
    const avgTokensPerChunk = 100;
    const tokensNeeded = chunksWithoutEmbeddings * avgTokensPerChunk;
    const costPer1KTokens = 0.00002; // text-embedding-3-small
    const estimatedCost = (tokensNeeded / 1000) * costPer1KTokens;

    console.log('💰 ESTIMACIÓN DE COSTOS:');
    console.log(`   Chunks sin embeddings: ${chunksWithoutEmbeddings}`);
    console.log(`   Tokens estimados: ${tokensNeeded.toLocaleString()}`);
    console.log(`   Costo estimado: $${estimatedCost.toFixed(6)} USD`);
    console.log('');
  }
}

/**
 * Genera embeddings para todos los archivos que los necesiten
 */
async function generateMissingEmbeddings() {
  console.log('🚀 Iniciando generación de embeddings...\n');

  // Cargar índice
  let index;
  try {
    index = JSON.parse(fs.readFileSync(KNOWLEDGE_INDEX, 'utf8'));
  } catch (e) {
    console.error('❌ Error cargando índice:', e.message);
    process.exit(1);
  }

  console.log(`📂 Archivos en índice: ${index.files.length}\n`);

  let totalProcessed = 0;
  let totalEmbeddingsGenerated = 0;
  let errors = 0;

  for (const file of index.files) {
    try {
      console.log(`\n📄 Procesando: ${file.originalName}`);

      const data = await knowledgeUploadService.getFileData(file);

      if (!data || !data.chunks) {
        console.log(`   ⚠️  No tiene chunks, saltando...`);
        continue;
      }

      // Filtrar chunks que necesitan embeddings
      let chunksToProcess;

      if (FORCE_REGENERATE) {
        // Procesar todos
        chunksToProcess = data.chunks.map(c => ({
          ...c,
          embeddingGenerated: false // Forzar regeneración
        }));
      } else {
        // Procesar solo los que no tienen
        chunksToProcess = data.chunks.filter(c => !c.embedding || c.embedding.length === 0);
      }

      if (chunksToProcess.length === 0) {
        console.log(`   ✅ Ya tiene embeddings (${data.chunks.length} chunks)`);
        continue;
      }

      console.log(`   🔄 Generando embeddings para ${chunksToProcess.length} chunks...`);

      // Generar embeddings
      const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(chunksToProcess);

      // Actualizar datos
      if (FORCE_REGENERATE) {
        // Reemplazar todos los chunks
        data.chunks = chunksWithEmbeddings;
      } else {
        // Actualizar solo los procesados
        chunksWithEmbeddings.forEach(newChunk => {
          const index = data.chunks.findIndex(c => c.text === newChunk.text);
          if (index !== -1) {
            data.chunks[index] = newChunk;
          }
        });
      }

      // Guardar datos actualizados
      await knowledgeUploadService.saveFileData(file, data);

      console.log(`   ✅ Completado: ${chunksWithEmbeddings.length} chunks`);

      totalProcessed++;
      totalEmbeddingsGenerated += chunksWithEmbeddings.length;

      // Pequeña pausa entre archivos para no saturar
      await sleep(500);

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN:');
  console.log(`   ✅ Archivos procesados: ${totalProcessed}`);
  console.log(`   🧠 Embeddings generados: ${totalEmbeddingsGenerated}`);
  console.log(`   ❌ Errores: ${errors}`);
  console.log('='.repeat(50));

  if (totalEmbeddingsGenerated > 0) {
    const avgTokensPerChunk = 100;
    const tokensUsed = totalEmbeddingsGenerated * avgTokensPerChunk;
    const costPer1KTokens = 0.00002;
    const actualCost = (tokensUsed / 1000) * costPer1KTokens;

    console.log(`\n💰 COSTO ESTIMADO: $${actualCost.toFixed(6)} USD`);
  }

  console.log('\n✨ Proceso completado!\n');

  // Recargar caché de embeddings
  try {
    console.log('🔄 Recargando caché de embeddings...');
    embeddingsService.reloadChunks();
    console.log('✅ Caché recargada');
  } catch (error) {
    console.warn('⚠️  No se pudo recargar la caché:', error.message);
  }
}

/**
 * Sleep con promesas
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===========================================
// FUNCIÓN PRINCIPAL
// ===========================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   REPROCESAMIENTO DE EMBEDDINGS - NORBOY CHATBOT       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Verificar OPENAI_API_KEY
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY no está definida en .env');
    console.log('   Por favor agrega: OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  try {
    if (STATS_ONLY) {
      await showStats();
    } else {
      await showStats();

      if (!FORCE_REGENERATE) {
        console.log('💡 Tip: Usa --force para regenerar todos los embeddings');
        console.log('💡 Tip: Usa --stats para solo ver estadísticas\n');
      }

      console.log('🔄 Iniciando generación de embeddings...\n');
      await generateMissingEmbeddings();
    }
  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main();
