/**
 * ===========================================
 * SCRIPT: LIMPIEZA DE DOCUMENTOS DUPLICADOS
 * ===========================================
 *
 * Detecta y elimina archivos duplicados en knowledge_files.
 *
 * USO:
 *   node scripts/cleanup-duplicates.js --dry-run  (solo muestra, no borra)
 *   node scripts/cleanup-duplicates.js            (ejecuta la limpieza)
 */

const fs = require('fs');
const path = require('path');

// Colores para consola
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

const isDryRun = process.argv.includes('--dry-run');

console.log(`${colors.cyan}===========================================`);
console.log(`  LIMPIEZA DE DUPLICADOS - NORBOY RAG`);
console.log(`===========================================${colors.reset}\n`);

if (isDryRun) {
  console.log(`${colors.yellow}🔍 MODO DRY-RUN: Solo mostrará cambios, no los aplicará${colors.reset}\n`);
}

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    }
  } catch (error) {
    console.error(`${colors.red}Error cargando índice: ${error.message}${colors.reset}`);
  }
  return { files: [], lastUpdate: null };
}

function saveIndex(index) {
  index.lastUpdate = new Date().toISOString();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

function findDuplicates(files) {
  const byName = {};

  for (const file of files) {
    const name = file.originalName;
    if (!byName[name]) {
      byName[name] = [];
    }
    byName[name].push(file);
  }

  const duplicates = {};
  for (const [name, fileList] of Object.entries(byName)) {
    if (fileList.length > 1) {
      duplicates[name] = fileList;
    }
  }

  return duplicates;
}

function selectBestVersion(fileList) {
  // Criterios de selección:
  // 1. Priorizar archivos con stageId (asociados a etapa)
  // 2. Mayor cantidad de chunks
  // 3. Más reciente

  return fileList.sort((a, b) => {
    // Priorizar con stageId
    if (a.stageId && !b.stageId) return -1;
    if (!a.stageId && b.stageId) return 1;

    // Mayor cantidad de chunks
    if (a.chunksCount !== b.chunksCount) {
      return b.chunksCount - a.chunksCount;
    }

    // Más reciente
    return new Date(b.uploadDate) - new Date(a.uploadDate);
  })[0];
}

function deleteFile(file) {
  // Determinar rutas
  let filePath, dataPath;

  if (file.relativePath) {
    filePath = path.join(KNOWLEDGE_DIR, file.relativePath);
    dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
  } else {
    filePath = path.join(KNOWLEDGE_DIR, file.fileName);
    dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
  }

  let deleted = 0;

  if (fs.existsSync(filePath)) {
    if (!isDryRun) {
      fs.unlinkSync(filePath);
    }
    console.log(`   ${colors.red}🗑️  ${filePath}${colors.reset}`);
    deleted++;
  }

  if (fs.existsSync(dataPath)) {
    if (!isDryRun) {
      fs.unlinkSync(dataPath);
    }
    console.log(`   ${colors.red}🗑️  ${dataPath}${colors.reset}`);
    deleted++;
  }

  return deleted;
}

// ===========================================
// EJECUCIÓN PRINCIPAL
// ===========================================

const index = loadIndex();
console.log(`📂 Archivos en índice: ${index.files.length}\n`);

// Encontrar duplicados
const duplicates = findDuplicates(index.files);
const duplicateCount = Object.keys(duplicates).length;

if (duplicateCount === 0) {
  console.log(`${colors.green}✅ No se encontraron duplicados!${colors.reset}`);
  process.exit(0);
}

console.log(`${colors.yellow}⚠️  Encontrados ${duplicateCount} grupos de duplicados:${colors.reset}\n`);

let totalDeleted = 0;
const idsToRemove = [];

for (const [name, fileList] of Object.entries(duplicates)) {
  console.log(`${colors.blue}📄 "${name}" (${fileList.length} copias)${colors.reset}`);

  const best = selectBestVersion(fileList);
  console.log(`   ${colors.green}✅ MANTENER: ID ${best.id} (${best.chunksCount} chunks, stage: ${best.stageId || 'ninguno'})${colors.reset}`);

  for (const file of fileList) {
    if (file.id !== best.id) {
      console.log(`   ${colors.red}❌ ELIMINAR: ID ${file.id} (${file.chunksCount} chunks, stage: ${file.stageId || 'ninguno'})${colors.reset}`);

      totalDeleted += deleteFile(file);
      idsToRemove.push(file.id);
    }
  }

  console.log('');
}

// Actualizar índice
if (!isDryRun && idsToRemove.length > 0) {
  index.files = index.files.filter(f => !idsToRemove.includes(f.id));
  saveIndex(index);
  console.log(`${colors.green}✅ Índice actualizado${colors.reset}`);
}

// Resumen
console.log(`\n${colors.cyan}===========================================`);
console.log(`  RESUMEN`);
console.log(`===========================================${colors.reset}`);
console.log(`   Duplicados encontrados: ${duplicateCount} grupos`);
console.log(`   Archivos eliminados: ${idsToRemove.length}`);
console.log(`   Archivos físicos borrados: ${totalDeleted}`);
console.log(`   Archivos restantes: ${index.files.length - idsToRemove.length}`);

if (isDryRun) {
  console.log(`\n${colors.yellow}💡 Ejecuta sin --dry-run para aplicar los cambios${colors.reset}`);
}

// Verificar archivos huérfanos (no en índice pero existen)
console.log(`\n${colors.cyan}🔍 Buscando archivos huérfanos...${colors.reset}`);

function findOrphanFiles(dir, indexedIds, basePath = '') {
  const orphans = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      orphans.push(...findOrphanFiles(fullPath, indexedIds, path.join(basePath, item)));
    } else if (item.endsWith('_data.json')) {
      const id = item.replace('_data.json', '');
      if (!indexedIds.has(id)) {
        orphans.push({ path: fullPath, id, type: 'data' });
      }
    } else if (!item.includes('index.json')) {
      // Archivos que no están en el índice
      const matchInIndex = index.files.some(f =>
        f.fileName === item ||
        (f.relativePath && f.relativePath.endsWith(item))
      );

      if (!matchInIndex) {
        orphans.push({ path: fullPath, id: null, type: 'file' });
      }
    }
  }

  return orphans;
}

const indexedIds = new Set(index.files.map(f => f.id));
const orphans = findOrphanFiles(KNOWLEDGE_DIR, indexedIds);

if (orphans.length > 0) {
  console.log(`${colors.yellow}⚠️  Encontrados ${orphans.length} archivos huérfanos:${colors.reset}`);

  for (const orphan of orphans) {
    console.log(`   ${colors.yellow}📄 ${orphan.path}${colors.reset}`);

    if (!isDryRun) {
      fs.unlinkSync(orphan.path);
      console.log(`      ${colors.red}🗑️  Eliminado${colors.reset}`);
    }
  }
} else {
  console.log(`${colors.green}✅ No hay archivos huérfanos${colors.reset}`);
}

console.log(`\n${colors.green}✅ Limpieza completada!${colors.reset}`);
