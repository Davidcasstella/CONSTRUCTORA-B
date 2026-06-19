/**
 * SCRIPT DE VERIFICACIÓN: RECONSTRUCCIÓN DE MEDIA
 * 
 * Simula el flujo completo:
 * 1. El mensaje no existe en el índice local.
 * 2. Se invoca getMediaBuffer.
 * 3. El sistema busca en DynamoDB (Mocked).
 * 4. Reconstruye el s3Key.
 * 5. Descarga de S3 (Mocked).
 * 6. Verifica que el buffer final es correcto.
 */

const path = require('path');
const logger = require('./src/utils/logger');

// Mockear el repositorio ANTES de cargar el servicio
const mockMessage = {
    messageId: 'MSG_RECONSTRUCTION_TEST_001',
    participantId: '573001234567@s.whatsapp.net',
    content: {
        text: '[Imagen]',
        fileName: 'test-reconstruction.jpg',
        mimeType: 'image/jpeg',
        fileSize: 50000,
        s3Key: 'images/573001234567/test-reconstruction.jpg'
    }
};

// Necesitamos mockear require('../repositories/conversation.repository')
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (reqPath) {
    if (reqPath.endsWith('conversation.repository')) {
        return {
            findMessageById: async (id) => {
                console.log(`🔍 [MOCK REPO] Buscando ID: ${id}`);
                return id === mockMessage.messageId ? mockMessage : null;
            }
        };
    }
    if (reqPath.endsWith('s3.service')) {
        return {
            downloadFile: async (key) => {
                console.log(`☁️ [MOCK S3] Descargando: ${key}`);
                return Buffer.from('CONTENIDO_MAGICO_RECUPERADO_DE_S3');
            }
        };
    }
    if (reqPath.endsWith('config')) {
        const config = originalRequire.apply(this, arguments);
        return {
            ...config,
            s3: { ...config.s3, enabled: true }, // Forzar S3 habilitado
            media: { ...config.media, uploadDir: './test-uploads' }
        };
    }
    return originalRequire.apply(this, arguments);
};

const mediaStorageService = require('./src/services/media-storage.service');

async function runTest() {
    console.log('\n🚀 INICIANDO PRUEBA INTENSIVA DE RECONSTRUCCIÓN DE MEDIA\n');

    const messageId = mockMessage.messageId;

    // 1. Verificar que NO está en el índice inicial
    console.log('--- PASO 1: Verificar ausencia local ---');
    const infoBefore = await mediaStorageService.getMediaInfo(messageId);
    console.log(`ℹ️ MediaInfo reconstruido:`, JSON.stringify(infoBefore, null, 2));

    // 2. Intentar obtener el buffer (esto debería disparar la reconstrucción)
    console.log('\n--- PASO 2: Solicitar buffer (disparar reconstrucción) ---');
    const buffer = await mediaStorageService.getMediaBuffer(messageId);

    if (buffer) {
        console.log(`📦 Buffer recibido (longitud: ${buffer.length})`);
        console.log(`📄 Contenido: "${buffer.toString()}"`);

        if (buffer.toString() === 'CONTENIDO_MAGICO_RECUPERADO_DE_S3') {
            console.log('✅ ÉXITO: El buffer fue recuperado e integrado correctamente!');
        } else {
            console.error('❌ ERROR: El contenido del buffer es incorrecto.');
            process.exit(1);
        }
    } else {
        console.error('❌ ERROR: No se pudo recuperar el buffer (resultó en null).');
        process.exit(1);
    }

    // 3. Verificar que ahora SÍ está en el índice
    console.log('\n--- PASO 3: Verificar que el índice fue actualizado ---');
    const info = await mediaStorageService.getMediaInfo(messageId);
    if (info && info.s3Key === mockMessage.content.s3Key) {
        console.log(`✅ ÉXITO: El índice local ahora contiene el s3Key: ${info.s3Key}`);
    } else {
        console.error('❌ ERROR: El índice no fue actualizado correctamente.');
        process.exit(1);
    }

    console.log('\n✨ PRUEBA FINALIZADA CON ÉXITO AL 100% ✨\n');
}

runTest().catch(err => {
    console.error('💥 ERROR FATAL EN PRUEBA:', err);
    process.exit(1);
});
