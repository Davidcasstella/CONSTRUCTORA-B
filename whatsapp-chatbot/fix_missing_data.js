/**
 * One-off script to generate _data.json for documents missing them.
 * Loads OPENAI_API_KEY from settings.json before generating embeddings.
 * Run: node fix_missing_data.js
 */
const path = require('path');
const fs = require('fs');

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge_files');
const indexPath = path.join(KNOWLEDGE_DIR, 'index.json');

// Bootstrap: load OPENAI_API_KEY from settings.json
const settingsPath = path.join(__dirname, 'settings.json');
if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.openai && settings.openai.apiKey) {
        process.env.OPENAI_API_KEY = settings.openai.apiKey;
        console.log('🔑 OPENAI_API_KEY cargada desde settings.json');
    }
}

// Also try .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath) && !process.env.OPENAI_API_KEY) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/OPENAI_API_KEY=(.+)/);
    if (match) {
        process.env.OPENAI_API_KEY = match[1].trim();
        console.log('🔑 OPENAI_API_KEY cargada desde .env');
    }
}

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ No se encontró OPENAI_API_KEY en settings.json ni .env');
    process.exit(1);
}

async function main() {
    console.log('📂 Leyendo index.json...');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    let fixed = 0;
    let checked = 0;

    for (const file of index.files) {
        checked++;

        let dataDir = KNOWLEDGE_DIR;
        if (file.relativePath) {
            dataDir = path.join(KNOWLEDGE_DIR, path.dirname(file.relativePath));
        }
        const dataPath = path.join(dataDir, `${file.id}_data.json`);

        if (fs.existsSync(dataPath)) {
            continue;
        }

        const filePath = file.relativePath
            ? path.join(KNOWLEDGE_DIR, file.relativePath)
            : path.join(dataDir, file.fileName);

        if (!fs.existsSync(filePath) || file.type !== 'txt') {
            console.log(`⚠️ Saltando: ${file.originalName}`);
            continue;
        }

        console.log(`\n🔧 Procesando: ${file.originalName} (id: ${file.id})`);

        const knowledgeService = require('./src/services/knowledge-upload.service');
        const processedData = await knowledgeService.processTxtFile(filePath, file.originalName);
        console.log(`   📄 Chunks: ${processedData.chunks.length}`);

        try {
            const embeddingsService = require('./src/services/embeddings.service');
            const chunksWithEmbeddings = await embeddingsService.ensureEmbeddings(processedData.chunks);
            processedData.chunks = chunksWithEmbeddings;
            const dims = chunksWithEmbeddings[0]?.embedding?.length || 0;
            console.log(`   🧠 Embeddings OK: ${chunksWithEmbeddings.length} chunks, ${dims} dims`);
        } catch (err) {
            console.log(`   ⚠️ Embeddings fallaron: ${err.message}`);
        }

        fs.writeFileSync(dataPath, JSON.stringify(processedData, null, 2));
        console.log(`   ✅ _data.json guardado!`);
        fixed++;
    }

    console.log(`\n✅ Listo! Revisados: ${checked}, Corregidos: ${fixed}`);
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
