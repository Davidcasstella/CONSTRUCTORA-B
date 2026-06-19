const path = require('path');
const settingsService = require('../src/services/settings.service');

// 1. Inyectar API keys
const keys = settingsService.getApiKeys();
if (keys.openai && keys.openai.apiKey) {
    process.env.OPENAI_API_KEY = keys.openai.apiKey;
    process.env.OPENAI_MODEL = keys.openai.model || 'text-embedding-3-small';
}
if (keys.groq && keys.groq.apiKey) {
    process.env.GROQ_API_KEY = keys.groq.apiKey;
}

// 2. Cargar servicios
const embeddingsService = require('../src/services/embeddings.service');
const knowledgeUploadService = require('../src/services/knowledge-upload.service');

async function main() {
    try {
        console.log('🚀 Iniciando prueba de recuperación...');

        // Cargar chunks (esto leerá los JSONs actualizados)
        console.log('📦 Cargando chunks...');
        await embeddingsService.loadAllChunks();

        const query = "venta de base de datos de asociados";
        console.log(`\n🔍 Buscando: "${query}"`);

        const results = await embeddingsService.findRelevantChunks(query, 5);

        console.log(`\n📊 Encontrados ${results.length} resultados:\n`);

        results.forEach((r, i) => {
            console.log(`[${i + 1}] Score: ${r.similarity.toFixed(4)} | File: ${r.filename}`);
            console.log(`    Text (${r.text.length} chars): ${r.text.substring(0, 150)}...`);
            console.log('---------------------------------------------------');
        });

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
