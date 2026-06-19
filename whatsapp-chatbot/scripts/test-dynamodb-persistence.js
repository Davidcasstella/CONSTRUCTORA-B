/**
 * ===========================================
 * SCRIPT DE PRUEBA - PERSISTENCIA DYNAMODB
 * ===========================================
 * 
 * Ejecutar con: node scripts/test-dynamodb-persistence.js
 */

require('dotenv').config();
const conversationRepository = require('../src/repositories/conversation.repository');
const { Message, MessageDirection, MessageType } = require('../src/models/message.model');
const { Conversation } = require('../src/models/conversation.model');
const logger = require('../src/utils/logger');

async function testPersistence() {
    console.log('===========================================');
    console.log('PRUEBA DE PERSISTENCIA - DYNAMODB');
    console.log('===========================================\n');

    const testPhoneNumber = '+573001234567@s.whatsapp.net';

    try {
        // 1. Crear una conversación de prueba
        console.log('1️⃣  Creando conversación de prueba...');
        const conversation = await conversationRepository.findOrCreate(testPhoneNumber);
        console.log(`   ✅ Conversación creada: ${conversation.participantId}`);

        // 2. Guardar un mensaje entrante
        console.log('\n2️⃣  Guardando mensaje entrante...');
        const incomingMsg = new Message({
            from: testPhoneNumber,
            direction: MessageDirection.INCOMING,
            type: MessageType.TEXT,
            content: { text: 'Hola, mensaje de prueba' },
            createdAt: new Date()
        });
        await conversationRepository.saveMessage(incomingMsg);
        console.log(`   ✅ Mensaje guardado: ${incomingMsg.id}`);

        // 3. Guardar un mensaje saliente
        console.log('\n3️⃣  Guardando mensaje saliente...');
        const outgoingMsg = new Message({
            to: testPhoneNumber,
            direction: MessageDirection.OUTGOING,
            type: MessageType.TEXT,
            content: { text: 'Respuesta del bot de prueba' },
            createdAt: new Date()
        });
        await conversationRepository.saveMessage(outgoingMsg);
        console.log(`   ✅ Mensaje guardado: ${outgoingMsg.id}`);

        // 4. Recuperar historial
        console.log('\n4️⃣  Recuperando historial...');
        const history = await conversationRepository.getHistory(testPhoneNumber, { limit: 10 });
        console.log(`   ✅ Historial recuperado: ${history.length} mensajes`);

        // Mostrar mensajes
        history.forEach((msg, idx) => {
            const direction = msg.direction === 'incoming' ? '👤 Usuario' : '🤖 Bot';
            console.log(`      ${idx + 1}. ${direction}: ${msg.content.text}`);
        });

        // 5. Verificar estadísticas
        console.log('\n5️⃣  Verificando estadísticas...');
        const stats = await conversationRepository.getStats();
        console.log(`   Total conversaciones: ${stats.totalConversations}`);
        console.log(`   Conversaciones activas: ${stats.activeConversations}`);
        console.log(`   Total mensajes: ${stats.totalMessages}`);

        console.log('\n✅ ✅ ✅ TODAS LAS PRUEBAS PASARON ✅ ✅ ✅\n');
        console.log('🎉 La persistencia con DynamoDB funciona correctamente!\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR EN LAS PRUEBAS:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testPersistence();
