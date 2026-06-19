/**
 * SCRIPT PARA REPROCESAR ARCHIVOS DE CONOCIMIENTO
 *
 * Este script reprocesa todos los archivos TXT existentes
 * con el nuevo sistema de parsing Q&A con emojis.
 */

const fs = require('fs');
const path = require('path');

// Directorio de conocimiento
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge_files');
const KNOWLEDGE_INDEX = path.join(KNOWLEDGE_DIR, 'index.json');

// Cargar servicios
const knowledgeUploadService = require('./src/services/knowledge-upload.service');

/**
 * Reprocesa un archivo individual
 */
async function reprocessFile(fileEntry) {
  try {
    console.log(`\n🔄 Reprocesando: ${fileEntry.originalName}`);

    // Determinar ruta del archivo físico
    let filePath;
    if (fileEntry.relativePath) {
      filePath = path.join(KNOWLEDGE_DIR, fileEntry.relativePath);
    } else if (fileEntry.stageId) {
      try {
        const stagesService = require('./src/services/stages.service');
        const stageFolder = stagesService.getStageFolder(fileEntry.stageId);
        filePath = path.join(stageFolder, fileEntry.fileName);
      } catch (e) {
        filePath = path.join(KNOWLEDGE_DIR, fileEntry.fileName);
      }
    } else {
      filePath = path.join(KNOWLEDGE_DIR, fileEntry.fileName);
    }

    if (!fs.existsSync(filePath)) {
      console.log(`❌ Archivo no encontrado: ${filePath}`);
      return false;
    }

    // Leer el archivo
    const fileBuffer = fs.readFileSync(filePath);

    // Crear objeto de archivo simulado (como lo recibe multer)
    const simulatedFile = {
      originalname: fileEntry.originalName,
      buffer: fileBuffer,
      size: fileBuffer.length
    };

    // Eliminar datos procesados antiguos
    let dataPath;
    if (fileEntry.relativePath) {
      dataPath = path.join(KNOWLEDGE_DIR, path.dirname(fileEntry.relativePath), `${fileEntry.id}_data.json`);
    } else if (fileEntry.stageId) {
      try {
        const stagesService = require('./src/services/stages.service');
        const stageFolder = stagesService.getStageFolder(fileEntry.stageId);
        dataPath = path.join(stageFolder, `${fileEntry.id}_data.json`);
      } catch (e) {
        dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
      }
    } else {
      dataPath = path.join(KNOWLEDGE_DIR, `${fileEntry.id}_data.json`);
    }

    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
      console.log(`🗑️  Eliminados datos antiguos: ${dataPath}`);
    }

    // Procesar con el nuevo sistema
    const ext = path.extname(fileEntry.originalName).toLowerCase();

    if (ext === '.txt') {
      const processed = await knowledgeUploadService.processTxtFile(filePath, fileEntry.originalName);

      // Guardar nuevos datos procesados
      let targetDir;
      if (fileEntry.relativePath) {
        targetDir = path.join(KNOWLEDGE_DIR, path.dirname(fileEntry.relativePath));
      } else if (fileEntry.stageId) {
        try {
          const stagesService = require('./src/services/stages.service');
          targetDir = stagesService.getStageFolder(fileEntry.stageId);
        } catch (e) {
          targetDir = KNOWLEDGE_DIR;
        }
      } else {
        targetDir = KNOWLEDGE_DIR;
      }

      const newDataPath = path.join(targetDir, `${fileEntry.id}_data.json`);
      fs.writeFileSync(newDataPath, JSON.stringify(processed, null, 2));

      // Actualizar índice
      fileEntry.chunksCount = processed.chunks.length;
      console.log(`✅ Reprocesado: ${processed.chunks.length} chunks generados`);

      return true;
    } else {
      console.log(`⏭️  Archivo no es TXT (${ext}), omitiendo`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error reprocesando ${fileEntry.originalName}:`, error.message);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando reproceso de archivos de conocimiento...\n');

  // Cargar índice
  let index;
  try {
    index = JSON.parse(fs.readFileSync(KNOWLEDGE_INDEX, 'utf8'));
  } catch (e) {
    console.error('❌ Error cargando índice:', e.message);
    process.exit(1);
  }

  console.log(`📂 Archivos en índice: ${index.files.length}`);

  if (index.files.length === 0) {
    console.log('⚠️  No hay archivos para procesar');
    process.exit(0);
  }

  // Filtrar solo archivos TXT
  const txtFiles = index.files.filter(f => f.type === 'txt');
  console.log(`📄 Archivos TXT: ${txtFiles.length}\n`);

  if (txtFiles.length === 0) {
    console.log('⚠️  No hay archivos TXT para procesar');
    process.exit(0);
  }

  // Reprocesar cada archivo
  let processed = 0;
  let failed = 0;

  for (const file of txtFiles) {
    const success = await reprocessFile(file);
    if (success) {
      processed++;
    } else {
      failed++;
    }
  }

  // Guardar índice actualizado
  index.lastUpdate = new Date().toISOString();
  fs.writeFileSync(KNOWLEDGE_INDEX, JSON.stringify(index, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN:');
  console.log(`   ✅ Procesados: ${processed}`);
  console.log(`   ❌ Fallidos: ${failed}`);
  console.log(`   📁 Total: ${txtFiles.length}`);
  console.log('='.repeat(50));
  console.log('\n✨ Reproceso completado!');
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
