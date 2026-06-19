const fs = require('fs');
const path = require('path');
const knowledgeUploadService = require('../src/services/knowledge-upload.service');
const embeddingsService = require('../src/services/embeddings.service');
const stagesService = require('../src/services/stages.service');

// Config
const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge_files');

async function main() {
    console.log('🚀 Iniciando re-procesamiento de base de conocimiento...');

    // 1. Obtener todos los archivos
    const allFiles = knowledgeUploadService.getUploadedFiles();
    const txtFiles = allFiles.filter(f => f.originalName.toLowerCase().endsWith('.txt'));

    console.log(`📂 Encontrados ${allFiles.length} archivos totales`);
    console.log(`📄 Encontrados ${txtFiles.length} archivos TXT para re-procesar`);

    for (const file of txtFiles) {
        console.log(`\n============== PROCESANDO: ${file.originalName} ==============`);

        try {
            // 2. Construir rutas
            let sourcePath;
            let dataPath;

            if (file.relativePath) {
                sourcePath = path.join(KNOWLEDGE_DIR, file.relativePath);
                dataPath = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath), `${file.id}_data.json`);
            } else if (file.stageId) {
                // Fallback para estructura antigua
                try {
                    const stageFolder = stagesService.getStageFolder(file.stageId);
                    sourcePath = path.join(stageFolder, file.originalName);
                    dataPath = path.join(stageFolder, `${file.id}_data.json`);
                } catch (e) {
                    sourcePath = path.join(KNOWLEDGE_DIR, file.originalName);
                    dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
                }
            } else {
                sourcePath = path.join(KNOWLEDGE_DIR, file.originalName);
                dataPath = path.join(KNOWLEDGE_DIR, `${file.id}_data.json`);
            }

            if (!fs.existsSync(sourcePath)) {
                console.error(`❌ Archivo fuente no encontrado: ${sourcePath}`);
                continue;
            }

            // 3. Procesar TXT (automáticamente usa la nueva lógica de chunks)
            console.log(`🔨 Generando nuevos chunks desde: ${sourcePath}`);
            // Hack: access exported processTxtFile via require if it was exported, 
            // but knowledgeUploadService only exports it via module.exports
            // Let's assume it's available or we can use the service instance if it was a class.
            // knowledge-upload.service is an object with methods.

            // WAIT: processTxtFile IS NOT EXPORTED in knowledge-upload.service.js based on previous view!
            // I need to check imports/exports again.
            // If NOT exported, I have to duplicate the logic or export it.

            // Let's check exports of knowledge-upload.service.js
        } catch (error) {
            console.error(`❌ Error procesando ${file.originalName}:`, error);
        }
    }
}

// Check exports first
const exported = require('../src/services/knowledge-upload.service');
console.log('Exports:', Object.keys(exported));

// Run
// main();
