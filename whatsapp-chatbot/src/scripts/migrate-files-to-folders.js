/**
 * ===========================================
 * SCRIPT DE MIGRACIÓN DE ARCHIVOS A CARPETAS
 * ===========================================
 *
 * Este script:
 * 1. Lee el índice de archivos
 * 2. Para cada archivo con stageId pero sin relativePath:
 *    - Lo mueve a la carpeta de su etapa
 *    - Actualiza el relativePath en el índice
 * 3. Guarda el índice actualizado
 *
 * USO: node src/scripts/migrate-files-to-folders.js
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge_files');
const INDEX_FILE = path.join(KNOWLEDGE_DIR, 'index.json');
const STAGES_FILE = path.join(KNOWLEDGE_DIR, 'stages.json');

console.log('===========================================');
console.log('MIGRACIÓN DE ARCHIVOS A CARPETAS DE ETAPAS');
console.log('===========================================\n');

// Cargar índice
if (!fs.existsSync(INDEX_FILE)) {
  console.error('❌ No se encontró el archivo de índice:', INDEX_FILE);
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
console.log(`📄 Archivos en índice: ${index.files.length}\n`);

// Cargar etapas
if (!fs.existsSync(STAGES_FILE)) {
  console.error('❌ No se encontró el archivo de etapas:', STAGES_FILE);
  process.exit(1);
}

const stages = JSON.parse(fs.readFileSync(STAGES_FILE, 'utf8'));
console.log(`📂 Etapas configuradas: ${stages.length}`);
stages.forEach(s => {
  const folderName = s.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  console.log(`   - ${s.id}: "${s.name}" → carpeta: ${folderName}`);
});
console.log('');

// Función para obtener nombre de carpeta de una etapa
function getStageFolderName(stageId) {
  const stage = stages.find(s => s.id === stageId);
  if (!stage) return null;

  return stage.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Función para asegurar que existe la carpeta
function ensureFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`   📁 Carpeta creada: ${path.basename(folderPath)}`);
  }
}

// Migrar archivos
let migrated = 0;
let errors = 0;
let skipped = 0;

console.log('🔄 Iniciando migración...\n');

for (const file of index.files) {
  // Caso 1: Archivo con stageId pero sin relativePath (en carpeta raíz)
  if (file.stageId && !file.relativePath) {
    const folderName = getStageFolderName(file.stageId);
    if (!folderName) {
      console.log(`⚠️ Etapa no encontrada para archivo ${file.fileName} (stageId: ${file.stageId})`);
      errors++;
      continue;
    }

    const stageFolderPath = path.join(KNOWLEDGE_DIR, folderName);
    ensureFolder(stageFolderPath);

    // Mover archivo principal
    const oldFilePath = path.join(KNOWLEDGE_DIR, file.fileName);
    const newFilePath = path.join(stageFolderPath, file.fileName);

    if (fs.existsSync(oldFilePath)) {
      try {
        fs.renameSync(oldFilePath, newFilePath);
        console.log(`   📄 Movido: ${file.fileName} → ${folderName}/`);
      } catch (err) {
        console.error(`   ❌ Error moviendo ${file.fileName}: ${err.message}`);
        errors++;
        continue;
      }
    } else {
      console.log(`   ⚠️ Archivo no encontrado en raíz: ${file.fileName}`);
    }

    // Mover archivo de datos
    const oldDataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
    const newDataPath = path.join(stageFolderPath, `${file.id}_data.json`);

    if (fs.existsSync(oldDataPath)) {
      try {
        fs.renameSync(oldDataPath, newDataPath);
        console.log(`   📄 Movido: ${file.id}_data.json → ${folderName}/`);
      } catch (err) {
        console.error(`   ❌ Error moviendo ${file.id}_data.json: ${err.message}`);
      }
    }

    // Actualizar relativePath en el índice
    file.relativePath = `${folderName}/${file.fileName}`;
    migrated++;
  }
  // Caso 2: Archivo sin stageId (legado)
  else if (!file.stageId && !file.relativePath) {
    console.log(`   ℹ️ Archivo sin etapa (legado): ${file.fileName}`);
    skipped++;
  }
  // Caso 3: Archivo ya migrado
  else if (file.relativePath) {
    // Ya tiene ruta relativa, verificar que existe
    const fullPath = path.join(KNOWLEDGE_DIR, file.relativePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`   ⚠️ Archivo con ruta relativa no existe: ${file.relativePath}`);
    }
    skipped++;
  }
}

// Guardar índice actualizado
console.log('\n💾 Guardando índice actualizado...');
index.lastUpdate = new Date().toISOString();
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));

console.log('\n===========================================');
console.log('RESUMEN DE MIGRACIÓN');
console.log('===========================================');
console.log(`✅ Archivos migrados: ${migrated}`);
console.log(`⏭️ Archivos omitidos: ${skipped}`);
console.log(`❌ Errores: ${errors}`);
console.log('===========================================\n');

if (migrated > 0) {
  console.log('✅ Migración completada exitosamente.');
  console.log('   Los archivos ahora están organizados en sus carpetas de etapa.');
} else {
  console.log('ℹ️ No había archivos para migrar.');
}
