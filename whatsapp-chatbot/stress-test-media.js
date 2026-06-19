/**
 * STRESS TEST: MEDIA RECOVERY CHAIN
 * 
 * Este script prueba intensivamente los 3 niveles de recuperación:
 * 1. Local (Caché)
 * 2. S3 (Nube)
 * 3. WhatsApp (Emergencia/Fallback)
 * 
 * Se ejecutan múltiples escenarios de fallo y pruebas de concurrencia.
 */

const path = require('path');
const fs = require('fs');

// --- MOCKS INICIALES ---
const mockLogger = {
    info: (...args) => console.log('INFO:', ...args),
    warn: (...args) => console.warn('WARN:', ...args),
    error: (...args) => console.error('ERROR:', ...args),
    debug: (...args) => console.log('DEBUG:', ...args)
};

const mockDb = {
    'MSG_LOCAL_OK': {
        messageId: 'MSG_LOCAL_OK',
        participantId: 'user1',
        content: { fileName: 'local.jpg', mimeType: 'image/jpeg', fileSize: 100 }
    },
    'MSG_S3_OK': {
        messageId: 'MSG_S3_OK',
        participantId: 'user2',
        content: { fileName: 's3.jpg', mimeType: 'image/jpeg', fileSize: 200, s3Key: 'keys/s3.jpg' }
    },
    'MSG_WA_OK': {
        messageId: 'MSG_WA_OK',
        participantId: 'user3',
        type: 'image',
        content: { fileName: 'wa.jpg', mimeType: 'image/jpeg', fileSize: 300 },
        metadata: { whatsappMessage: { key: { id: 'WA_REF' }, message: { imageMessage: {} } } }
    },
    'MSG_WA_BAD_MAC': {
        messageId: 'MSG_WA_BAD_MAC',
        participantId: 'user4',
        type: 'image',
        content: { fileName: 'bad.jpg', mimeType: 'image/jpeg', fileSize: 400 },
        metadata: { whatsappMessage: { key: { id: 'WA_BAD' }, message: { imageMessage: {} } } }
    },
    'MSG_TOTAL_FAIL': {
        messageId: 'MSG_TOTAL_FAIL',
        participantId: 'user5',
        type: 'image',
        content: { fileName: 'fail.jpg', mimeType: 'image/jpeg', fileSize: 500 }
    }
};

// Interceptar requires
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (reqPath) {
    if (reqPath.includes('utils/logger')) {
        return mockLogger;
    }
    if (reqPath.includes('repositories/conversation.repository') || reqPath.includes('repositories/conversation.repository')) {
        return {
            findMessageById: async (id) => {
                console.log(`🔍 [STRESS-DB] Buscando: ${id}`);
                return mockDb[id] || null;
            }
        };
    }
    if (reqPath.includes('s3.service') || reqPath.includes('./s3.service')) {
        return {
            downloadFile: async (key) => {
                console.log(`☁️ [STRESS-S3] Descargando: ${key}`);
                if (key.includes('s3.jpg')) return Buffer.from('DATA_FROM_S3');
                return null;
            },
            uploadFile: async () => ({})
        };
    }
    if (reqPath === '@whiskeysockets/baileys') {
        const originalBaileys = originalRequire.apply(this, arguments);
        return {
            ...originalBaileys,
            downloadMediaMessage: async (msg) => {
                console.log(`📱 [STRESS-WA] Intentando descarga: ${msg?.key?.id}`);
                if (msg?.key?.id === 'WA_REF') return Buffer.from('DATA_FROM_WHATSAPP');
                if (msg?.key?.id === 'WA_BAD') throw new Error('Bad MAC');
                return null;
            }
        };
    }
    if (reqPath.endsWith('/config') || reqPath.endsWith('../config') || reqPath === './config') {
        // Solo interceptar si parece ser el config del proyecto
        const config = originalRequire.apply(this, arguments);
        return {
            ...config,
            s3: { ...config.s3, enabled: true },
            media: { ...config.media, uploadDir: './stress-test-uploads' }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Cargar servicio DESPUÉS de los mocks
const mediaStorageService = require('./src/services/media-storage.service');
const logger = require('./src/utils/logger');

// Simular inyección de socket
mediaStorageService.setWhatsAppSocket({ updateMediaMessage: async () => ({}) });

async function runScenario(name, messageId, expectedContent, description) {
    console.log(`\n🔹 [ESCENARIO] ${name}: ${description}`);
    try {
        const buffer = await mediaStorageService.getMediaBuffer(messageId);
        if (buffer) {
            const content = buffer.toString();
            if (content === expectedContent) {
                console.log(`✅ EXITO: Recuperado correctamente ("${content}")`);
                return true;
            } else {
                console.error(`❌ ERROR: Contenido inesperado. Esperado "${expectedContent}", recibido "${content}"`);
            }
        } else {
            if (expectedContent === null) {
                console.log(`✅ EXITO: Fallo controlado (retornó null como se esperaba)`);
                return true;
            } else {
                console.error(`❌ ERROR: Se esperaba contenido "${expectedContent}" pero retornó null`);
            }
        }
    } catch (e) {
        console.error(`💥 EXCEPCION: ${e.message}`);
    }
    return false;
}

async function startStressTest() {
    console.log('=====================================================');
    console.log('    TEST DE INTENSIDAD: RECUPERACIÓN DE MEDIA       ');
    console.log('=====================================================');

    // Preparar entorno
    if (!fs.existsSync('./stress-test-uploads')) fs.mkdirSync('./stress-test-uploads');

    // Escenario 1: Local (Primero creamos el archivo para simular hit)
    const localPath = path.join('./stress-test-uploads', 'user1', 'user1_MSG_LOCAL_OK.jpg');
    if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, 'DATA_LOCAL');
    await runScenario('HIT_LOCAL', 'MSG_LOCAL_OK', 'DATA_LOCAL', 'Archivo existe en disco');

    // Escenario 2: S3 Fallback
    await runScenario('FALLBACK_S3', 'MSG_S3_OK', 'DATA_FROM_S3', 'No está en disco, pero sí en S3');

    // Escenario 3: WhatsApp Fallback (Límite de la cadena)
    await runScenario('FALLBACK_WA', 'MSG_WA_OK', 'DATA_FROM_WHATSAPP', 'No está en disco ni S3, descarga de WhatsApp');

    // Escenario 4: Bad MAC (Error de cifrado de WhatsApp)
    await runScenario('FAIL_BAD_MAC', 'MSG_WA_BAD_MAC', null, 'Falla descarga de WhatsApp por Bad MAC');

    // Escenario 5: Fallo Total
    await runScenario('FAIL_TOTAL', 'MSG_TOTAL_FAIL', null, 'No tiene S3Key ni metadatos de WhatsApp');

    // --- TEST DE CONCURRENCIA ---
    console.log('\n🔹 [ESCENARIO] CONCURRENCIA: Múltiples peticiones simultáneas');
    const start = Date.now();
    const promises = Array(10).fill('MSG_WA_OK').map(id => mediaStorageService.getMediaBuffer(id));
    const results = await Promise.all(promises);
    const allOk = results.every(b => b && b.toString() === 'DATA_FROM_WHATSAPP');
    console.log(`⏱️  10 peticiones procesadas en ${Date.now() - start}ms`);
    if (allOk) {
        console.log('✅ EXITO: Todas las peticiones concurrentes retornaron datos consistentes');
    } else {
        console.error('❌ ERROR: Alguna petición concurrente falló');
    }

    console.log('\n=====================================================');
    console.log('        RESULTADO FINAL: PRUEBAS COMPLETADAS        ');
    console.log('=====================================================');

    // Limpieza
    try {
        // Podríamos borrar stress-test-uploads pero mejor dejarlo para inspección manual si se desea
        console.log('Inspecciona ./stress-test-uploads para ver la caché restaurada.');
    } catch (e) { }
}

startStressTest();
