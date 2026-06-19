/**
 * ===========================================
 * SERVICIO DE GESTIÓN DE ETAPAS (STAGES)
 * ===========================================
 *
 * Gestiona las etapas para organizar documentos por fases del proceso.
 *
 * Estructura de una etapa:
 * {
 *   id: "stage_1234567890",
 *   name: "Etapa 1",
 *   order: 1,
 *   is_active: true,
 *   createdAt: 1706544000000,
 *   updatedAt: 1706547600000
 * }
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Archivo de almacenamiento de etapas
const STAGES_FILE = path.join(process.cwd(), 'knowledge_files', 'stages.json');

// Directorio base de documentos
const DOCUMENTS_DIR = path.join(process.cwd(), 'knowledge_files');

// Asegurar que el directorio existe
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

// Etapas en memoria
let stages = [];

/**
 * Carga las etapas desde el archivo
 */
function loadStages() {
  try {
    if (fs.existsSync(STAGES_FILE)) {
      const data = fs.readFileSync(STAGES_FILE, 'utf8');
      stages = JSON.parse(data);

      // ✅ MIGRACIÓN: Agregar is_active a etapas que no lo tengan
      let migrated = false;
      stages.forEach(stage => {
        if (typeof stage.is_active === 'undefined') {
          stage.is_active = true;
          migrated = true;
        }
      });
      if (migrated) {
        saveStages();
        logger.info('✅ Etapas migradas: campo is_active agregado');
      }

      logger.info(`📂 Cargadas ${stages.length} etapas desde ${STAGES_FILE}`);

      // ✅ NUEVO: Crear carpetas para las etapas cargadas
      stages.forEach(stage => {
        try {
          getStageFolder(stage.id);
        } catch (e) {
          logger.warn(`No se pudo crear carpeta para etapa ${stage.id}:`, e.message);
        }
      });
    } else {
      // Si no existe, crear etapas por defecto
      stages = [
        {
          id: 'stage_1',
          name: 'Etapa 1',
          order: 1,
          is_active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'stage_2',
          name: 'Etapa 2',
          order: 2,
          is_active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'stage_3',
          name: 'Etapa 3',
          order: 3,
          is_active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];
      saveStages();

      // ✅ NUEVO: Crear carpetas para las etapas por defecto
      stages.forEach(stage => {
        try {
          getStageFolder(stage.id);
        } catch (e) {
          logger.warn(`No se pudo crear carpeta para etapa ${stage.id}:`, e.message);
        }
      });

      logger.info('✅ Etapas por defecto creadas');
    }
  } catch (error) {
    logger.error('Error cargando etapas:', error.message);
    stages = [];
  }
}

/**
 * Guarda las etapas en el archivo
 */
function saveStages() {
  try {
    fs.writeFileSync(STAGES_FILE, JSON.stringify(stages, null, 2));
    logger.debug('💾 Etapas guardadas correctamente');
  } catch (error) {
    logger.error('Error guardando etapas:', error.message);
  }
}

/**
 * Obtiene todas las etapas ordenadas
 */
function getAllStages() {
  return stages.sort((a, b) => a.order - b.order);
}

/**
 * Obtiene una etapa por ID
 */
function getStageById(stageId) {
  return stages.find(s => s.id === stageId) || null;
}

/**
 * Obtiene una etapa por orden
 */
function getStageByOrder(order) {
  return stages.find(s => s.order === order) || null;
}

/**
 * Crea una nueva etapa
 */
function createStage(name) {
  const maxOrder = stages.length > 0 ? Math.max(...stages.map(s => s.order)) : 0;

  const newStage = {
    id: `stage_${Date.now()}`,
    name: name || `Nueva Etapa`,
    order: maxOrder + 1,
    is_active: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  stages.push(newStage);
  saveStages();

  logger.info(`✅ Nueva etapa creada: ${newStage.name} (orden: ${newStage.order})`);

  return newStage;
}

/**
 * Actualiza el nombre de una etapa
 * ✅ CORREGIDO: Ahora migra los archivos de la carpeta antigua a la nueva
 */
function updateStageName(stageId, newName) {
  const stage = getStageById(stageId);

  if (!stage) {
    throw new Error('Etapa no encontrada');
  }

  const oldName = stage.name;

  // Calcular nombre de carpeta antigua
  const oldFolderName = oldName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Calcular nombre de carpeta nueva
  const newFolderName = newName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const oldFolderPath = path.join(DOCUMENTS_DIR, oldFolderName);
  const newFolderPath = path.join(DOCUMENTS_DIR, newFolderName);

  // ✅ NUEVO: Si la carpeta antigua existe y es diferente, migrar
  if (oldFolderName !== newFolderName && fs.existsSync(oldFolderPath)) {
    try {
      // Crear carpeta nueva si no existe
      if (!fs.existsSync(newFolderPath)) {
        fs.mkdirSync(newFolderPath, { recursive: true });
      }

      // Mover todos los archivos
      const files = fs.readdirSync(oldFolderPath);
      for (const file of files) {
        const oldPath = path.join(oldFolderPath, file);
        const newPath = path.join(newFolderPath, file);
        fs.renameSync(oldPath, newPath);
        logger.info(`   📄 Movido: ${file}`);
      }

      // Eliminar carpeta antigua si está vacía
      const remaining = fs.readdirSync(oldFolderPath);
      if (remaining.length === 0) {
        fs.rmdirSync(oldFolderPath);
        logger.info(`   🗑️ Carpeta antigua eliminada: ${oldFolderName}`);
      }

      logger.info(`📁 Archivos migrados de ${oldFolderName} → ${newFolderName}`);
    } catch (err) {
      logger.warn(`⚠️ Error migrando archivos: ${err.message}`);
    }
  }

  // Actualizar etapa
  stage.name = newName;
  stage.updatedAt = Date.now();

  saveStages();

  // ✅ NUEVO: Actualizar rutas relativas en el índice de archivos
  try {
    const knowledgeUploadService = require('./knowledge-upload.service');
    const files = knowledgeUploadService.getUploadedFiles();

    let updated = 0;
    for (const file of files) {
      if (file.stageId === stageId && file.relativePath) {
        // Actualizar ruta relativa
        const oldRelative = file.relativePath;
        file.relativePath = file.relativePath.replace(oldFolderName + '/', newFolderName + '/');
        if (oldRelative !== file.relativePath) {
          updated++;
        }
      }
    }

    if (updated > 0) {
      logger.info(`📝 ${updated} rutas relativas actualizadas en el índice`);
    }
  } catch (err) {
    logger.warn(`⚠️ Error actualizando rutas en índice: ${err.message}`);
  }

  logger.info(`📝 Etapa renombrada: "${oldName}" → "${newName}"`);

  return stage;
}

/**
 * Elimina una etapa
 */
function deleteStage(stageId) {
  const stageIndex = stages.findIndex(s => s.id === stageId);

  if (stageIndex === -1) {
    throw new Error('Etapa no encontrada');
  }

  const stage = stages[stageIndex];

  // Verificar si hay documentos en esta etapa
  const knowledgeUploadService = require('./knowledge-upload.service');
  const files = knowledgeUploadService.getUploadedFiles();
  const filesInStage = files.filter(f => f.stageId === stageId);

  if (filesInStage.length > 0) {
    throw new Error(
      `No se puede eliminar la etapa "${stage.name}" porque tiene ${filesInStage.length} documento(s) asociado(s). ` +
      'Elimina o mueve los documentos primero.'
    );
  }

  stages.splice(stageIndex, 1);

  // Reordenar las etapas restantes
  stages.forEach((s, index) => {
    s.order = index + 1;
  });

  saveStages();

  logger.info(`🗑️ Etapa eliminada: "${stage.name}"`);

  return true;
}

/**
 * ✅ NUEVO: Obtiene solo las etapas activas
 */
function getActiveStages() {
  return stages.filter(s => s.is_active !== false);
}

/**
 * ✅ NUEVO: Activa o desactiva una etapa
 * 
 * @param {string} stageId - ID de la etapa
 * @param {boolean} isActive - true para activar, false para desactivar
 * @returns {Object} La etapa actualizada
 */
function toggleStageActive(stageId, isActive) {
  const stage = getStageById(stageId);

  if (!stage) {
    throw new Error('Etapa no encontrada');
  }

  stage.is_active = isActive;
  stage.updatedAt = Date.now();

  saveStages();

  logger.info(`${isActive ? '🟢' : '🔴'} Etapa "${stage.name}" ${isActive ? 'ACTIVADA' : 'DESACTIVADA'}`);

  return stage;
}

/**
 * Inicializa el servicio
 */
function initialize() {
  loadStages();
}

/**
 * ✅ NUEVO: Obtiene la ruta de la carpeta de una etapa
 * Crea la carpeta si no existe
 *
 * @param {string} stageId - ID de la etapa
 * @returns {string} Ruta de la carpeta de la etapa
 */
function getStageFolder(stageId) {
  const stage = getStageById(stageId);

  if (!stage) {
    throw new Error(`Etapa no encontrada: ${stageId}`);
  }

  // Crear nombre de carpeta seguro (sin caracteres inválidos)
  const folderName = stage.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const stageFolderPath = path.join(DOCUMENTS_DIR, folderName);

  // Crear carpeta si no existe
  if (!fs.existsSync(stageFolderPath)) {
    fs.mkdirSync(stageFolderPath, { recursive: true });
    logger.info(`📁 Carpeta de etapa creada: ${folderName}`);
  }

  return stageFolderPath;
}

/**
 * ✅ NUEVO: Obtiene la ruta relativa de la carpeta para almacenamiento
 */
function getStageFolderRelative(stageId) {
  const stage = getStageById(stageId);

  if (!stage) {
    return null;
  }

  // Crear nombre de carpeta seguro
  const folderName = stage.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return folderName;
}

// Cargar etapas al inicio
initialize();

module.exports = {
  getAllStages,
  getActiveStages,
  getStageById,
  getStageByOrder,
  createStage,
  updateStageName,
  deleteStage,
  toggleStageActive,
  saveStages,
  getStageFolder,
  getStageFolderRelative
};
