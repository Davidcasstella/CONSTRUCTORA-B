/**
 * Script para simular un mensaje entrante en día festivo
 * Verifica que el bot no responda cuando es festivo
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const messageProcessor = require('../src/services/message-processor.service');

async function simularMensaje() {
  console.log('🧪 Simulando mensaje entrante en día festivo...\n');

  // Datos de prueba
  const testUserId = 'test_' + Date.now();
  const testMessage = 'Hola, necesito ayuda con un pedido';

  console.log(`📱 Usuario: ${testUserId}`);
  console.log(`💬 Mensaje: "${testMessage}"`);
  console.log('');

  // Verificar primero si estamos fuera de horario (por festivo)
  const isOutOfHours = await messageProcessor.isOutOfHours();
  console.log(`⏰ ¿Fuera de horario (festivo)? ${isOutOfHours ? 'SÍ' : 'NO'}`);
  console.log('');

  if (isOutOfHours) {
    const outOfHoursMsg = await messageProcessor.getOutOfHoursMessage();
    console.log('📩 Mensaje que se enviará:');
    console.log('━'.repeat(50));
    console.log(outOfHoursMsg);
    console.log('━'.repeat(50));
    console.log('');
    console.log('✅ El bot NO generará respuesta automática.');
    console.log('✅ El mensaje del usuario se guardará para que el asesor lo vea.');
  } else {
    console.log('✅ El bot responderá normalmente (dentro de horario).');
  }

  console.log('\n✅ Simulación completada.');
  process.exit(0);
}

simularMensaje().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
