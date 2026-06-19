/**
 * ===========================================
 * SCRIPT DE DIAGNÓSTICO
 * ===========================================
 *
 * Ejecutar: node diagnostico.js
 *
 * Verifica:
 * - Estado de la conexión con DynamoDB
 * - Mensajes guardados en DynamoDB
 * - Conversaciones en memoria
 * - Números en lista de control
 */

// Cargar variables de entorno PRIMERO
require('dotenv').config();

const conversationStateService = require('./src/services/conversation-state.service');
const numberControlService = require('./src/services/number-control.service');
const conversationRepository = require('./src/repositories/conversation.repository');

async function diagnostic() {
  console.log('\n====================================');
  console.log('🔍 DIAGNÓSTICO DEL SISTEMA');
  console.log('====================================\n');

  // 1. Conversaciones en memoria
  console.log('1️⃣ CONVERSACIONES EN MEMORIA:');
  const allConversations = conversationStateService.getAllConversations();
  console.log(`   Total: ${allConversations.length}`);

  if (allConversations.length > 0) {
    console.log('\n   Últimas 5 conversaciones:');
    allConversations.slice(0, 5).forEach(conv => {
      const msgCount = conv.messages?.length || 0;
      console.log(`   - ${conv.phoneNumber} (${conv.whatsappName || 'Sin nombre'}): ${msgCount} mensajes`);
      console.log(`     Bot activo: ${conv.bot_active}, Estado: ${conv.status}`);
    });
  } else {
    console.log('   ⚠️ No hay conversaciones en memoria');
  }

  // 2. Números en lista de control
  console.log('\n2️⃣ NÚMEROS EN LISTA DE CONTROL:');
  const controlledNumbers = numberControlService.getAllControlledNumbers();
  console.log(`   Total: ${controlledNumbers.length}`);

  if (controlledNumbers.length > 0) {
    controlledNumbers.forEach(num => {
      console.log(`   - ${num.phoneNumber}: IA=${num.iaActive ? '✅' : '❌'} (${num.reason || 'Sin motivo'})`);
    });
  } else {
    console.log('   ✅ No hay números en lista de control');
  }

  // 3. Verificar DynamoDB
  console.log('\n3️⃣ CONEXIÓN CON DYNAMODB:');
  try {
    // Intentar obtener conversaciones desde DynamoDB
    const dbConversations = await conversationRepository.findActive({ limit: 5 });
    console.log(`   ✅ DynamoDB conectado`);
    console.log(`   Conversaciones activas: ${dbConversations.length}`);

    if (dbConversations.length > 0) {
      console.log('\n   Conversaciones en DynamoDB:');
      for (const conv of dbConversations) {
        const data = conv.toObject ? conv.toObject() : conv;
        console.log(`   - ${data.participantId || data.userId}: ${data.status || 'active'}`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error conectando a DynamoDB:`);
    console.log(`   ${error.message}`);
  }

  // 4. Verificar mensajes en DynamoDB
  console.log('\n4️⃣ MENSAJES EN DYNAMODB:');
  if (allConversations.length > 0) {
    const firstConv = allConversations[0];
    try {
      const history = await conversationRepository.getHistory(firstConv.userId, { limit: 10 });
      console.log(`   ✅ ${history.length} mensajes encontrados para ${firstConv.phoneNumber}`);

      if (history.length > 0) {
        console.log('\n   Últimos mensajes:');
        history.slice(0, 5).forEach(msg => {
          const data = msg.toObject ? msg.toObject() : msg;
          const direction = data.direction === 'incoming' ? '←' : '→';
          const text = data.content?.text || '[Sin texto]';
          const date = new Date(data.createdAt || Date.now()).toLocaleString();
          console.log(`   ${direction} ${date}: "${text.substring(0, 40)}..."`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Error obteniendo mensajes: ${error.message}`);
    }
  }

  console.log('\n====================================');
  console.log('✅ Diagnóstico completado');
  console.log('====================================\n');

  process.exit(0);
}

diagnostic().catch(err => {
  console.error('Error en diagnóstico:', err);
  process.exit(1);
});
