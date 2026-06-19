/**
 * ===========================================
 * SCRIPT DE MIGRACIÓN: MOVER DOCUMENTOS A CARPETAS POR ETAPA
 * ===========================================
 *
 * Este script organiza los documentos existentes en carpetas por etapa.
 * Solo ejecutar UNA VEZ para organizar documentos antiguos.
 *
 * Uso:
 * node src/scripts/migrate-documents-to-folders.js
 */

const fs = require('fs');
const path = require('path');

// Rutas
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge_files');
const INDEX_FILE = path.join(KNOWLEDGE_DIR, 'knowledge_index.json');
const STAGES_FILE = path.join(KNOWLEDGE_DIR, 'stages.json');

console.log('🔄 Iniciando migración de documentos a carpetas por etapa...\n');

try {
  // Cargar índice de documentos
  if (!fs.existsSync(INDEX_FILE)) {
    console.log('ℹ️  No existe índice de documentos. No hay nada que migrar.');
    process.exit(0);
  }

  const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const files = indexData.files || [];

  if (files.length === 0) {
    console.log('ℹ️  No hay documentos en el índice. No hay nada que migrar.');
    process.exit(0);
  }

  // Cargar etapas
  let stages = [];
  if (fs.existsSync(STAGES_FILE)) {
    const stagesData = JSON.parse(fs.readFileSync(STAGES_FILE, 'utf8'));
    stages = stagesData.stages || stagesData || [];
  }

  if (stages.length === 0) {
    console.log('⚠️  No hay etapas configuradas. No se puede organizar por etapas.');
    process.exit(0);
  }

  console.log(`📂 Encontrados ${files.length} documentos`);
  console.log(`📁 Encontradas ${stages.length} etapas\n`);

  let movedCount = 0;
  let skippedCount = 0;

  // Función para obtener carpeta de etapa
  function getStageFolder(stageId) {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return null;

    const folderName = stage.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const stageFolderPath = path.join(KNOWLEDGE_DIR, folderName);

    // Crear carpeta si no existe
    if (!fs.existsSync(stageFolderPath)) {
      fs.mkdirSync(stageFolderPath, { recursive: true });
    }

    return stageFolderPath;
  }

  // Procesar cada archivo
  files.forEach((file, index) => {
    const oldFilePath = path.join(KNOWLEDGE_DIR, file.fileName);
    const oldDataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);

    // Verificar que el archivo existe
    if (!fs.existsSync(oldFilePath)) {
      console.log(`⏭️  [${index + 1}/${files.length}] ${file.originalName} - No existe, se omite`);
      skippedCount++;
      return;
    }

    // Si tiene stageId, mover a carpeta de etapa
    if (file.stageId) {
      const stageFolder = getStageFolder(file.stageId);

      if (stageFolder) {
        const newFilePath = path.join(stageFolder, file.fileName);
        const newDataPath = path.join(stageFolder, `${file.id}_data.json`);

        // Mover archivo
        if (fs.existsSync(oldFilePath)) {
          fs.renameSync(oldFilePath, newFilePath);
        }

        // Mover archivo de datos
        if (fs.existsSync(oldDataPath)) {
          fs.renameSync(oldDataPath, newDataPath);
        }

        // Actualizar ruta relativa en el índice
        const relativePath = path.relative(KNOWLEDGE_DIR, newFilePath).replace(/\\/g, '/');
        file.relativePath = relativePath;

        console.log(`✅ [${index + 1}/${files.length}] ${file.originalName} → ${relativePath}`);
        movedCount++;
      } else {
        console.log(`⚠️  [${index + 1}/${files.length}] ${file.originalName} - Etapa no encontrada`);
        skippedCount++;
      }
    } else {
      console.log(`⏭️  [${index + 1}/${files.length}] ${file.originalName} - Sin etapa, se mantiene en raíz`);
      skippedCount++;
    }
  });

  // Guardar índice actualizado
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  console.log('\n✅ Migración completada!');
  console.log(`   📁 Movidos: ${movedCount} documentos`);
  console.log(`   ⏭️  Omities: ${skippedCount} documentos`);
  console.log(`\n💾 Índice actualizado guardado en: ${INDEX_FILE}`);

} catch (error) {
  console.error('❌ Error durante la migración:', error);
  process.exit(1);
}
