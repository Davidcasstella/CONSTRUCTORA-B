const fs = require('fs');
const path = require('path');

// Ajustar paths relativos (el script está en /scripts)
// 1. Cargar settingsService primero para obtener keys
const settingsService = require('../src/services/settings.service');

// Config
const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge_files');

// 2. Inyectar API keys y Configuración ANTES de cargar otros servicios
const keys = settingsService.getApiKeys();
if (keys.openai && keys.openai.apiKey) {
    process.env.OPENAI_API_KEY = keys.openai.apiKey;
    console.log('🔑 OPENAI_API_KEY inyectada desde settings.json');
}
if (keys.groq && keys.groq.apiKey) {
    process.env.GROQ_API_KEY = keys.groq.apiKey;
    console.log('🔑 GROQ_API_KEY inyectada desde settings.json');
}

// Configurar batch size seguro para evitar errores de token limit (8192 tokens)
// 5 chunks * 800 chars = ~4000 chars ~= 1000 tokens (MUY seguro)
process.env.EMBEDDING_BATCH_SIZE = '5';
console.log('📉 EMBEDDING_BATCH_SIZE configurado a 5 para evitar limites de token');

// 3. Cargar el resto de servicios (ahora sí leerán las env vars actualizadas)
const knowledgeUploadService = require('../src/services/knowledge-upload.service');
const embeddingsService = require('../src/services/embeddings.service');
const stagesService = require('../src/services/stages.service');

async function main() {
    console.log('🚀 Iniciando re-procesamiento de base de conocimiento...');
    console.log(`📂 KNOWLEDGE_DIR: ${KNOWLEDGE_DIR}`);

    // 1. Obtener todos los archivos
    const allFiles = knowledgeUploadService.getUploadedFiles();
    const txtFiles = allFiles.filter(f => f.originalName.toLowerCase().endsWith('.txt'));

    console.log(`📂 Encontrados ${allFiles.length} archivos totales`);
    console.log(`📄 Encontrados ${txtFiles.length} archivos TXT para re-procesar`);

    let successCount = 0;
    let errorCount = 0;

    for (const file of txtFiles) {
        console.log(`\n============== PROCESANDO: ${file.originalName} ==============`);

        try {
            // 2. Construir ruta al archivo fuente
            let sourcePath;

            if (file.relativePath) {
                sourcePath = path.join(KNOWLEDGE_DIR, file.relativePath);
            } else if (file.stageId) {
                // Intentar obtener ruta de etapa
                try {
                    const stageFolder = stagesService.getStageFolder(file.stageId);
                    sourcePath = path.join(stageFolder, file.originalName);
                } catch (e) {
                    sourcePath = path.join(KNOWLEDGE_DIR, file.originalName);
                }
            } else {
                sourcePath = path.join(KNOWLEDGE_DIR, file.originalName);
            }

            if (!fs.existsSync(sourcePath)) {
                console.error(`❌ Archivo fuente no encontrado: ${sourcePath}`);
                errorCount++;
                continue;
            }

            // 3. Procesar TXT (automáticamente usa la nueva lógica de chunks)
            console.log(`🔨 Generando nuevos chunks desde: ${sourcePath}`);
            const data = await knowledgeUploadService.processTxtFile(sourcePath, file.originalName);

            console.log(`✅ Chunks generados: ${data.chunks.length}`);

            // 4. Generar embeddings para los nuevos chunks
            console.log(`🧠 Generando embeddings para ${data.chunks.length} chunks...`);
            // ensureEmbeddings devuelve los chunks modificados in-place (o nuevos, depende impl)
            // Pero viendo el codigo, modifica y retorna.
            await embeddingsService.ensureEmbeddings(data.chunks);
            console.log(`✅ Embeddings generados correctamente`);

            // 5. Guardar los datos actualizados
            console.log(`💾 Guardando datos actualizados...`);
            await knowledgeUploadService.saveFileData(file, data);

            console.log(`✨ Completado: ${file.originalName}`);
            successCount++;

        } catch (error) {
            console.error(`❌ Error procesando ${file.originalName}:`, error.message);
            errorCount++;
        }
    }

    console.log('\n===========================================');
    console.log(`🏁 RESUMEN FINAL`);
    console.log(`✅ Exitosos: ${successCount}`);
    console.log(`❌ Fallidos: ${errorCount}`);
    console.log('===========================================');

    // Forzar recarga en memoria del servicio
    if (successCount > 0) {
        console.log('🔄 Recargando chunks en memoria del servicio...');
        try {
            await embeddingsService.reloadChunks();
            console.log('✅ Recarga completa');
        } catch (e) {
            console.error('⚠️ Error en recarga (no crítico, se recargará al reinicio/consulta):', e.message);
        }
    }
}

main().catch(console.error);
