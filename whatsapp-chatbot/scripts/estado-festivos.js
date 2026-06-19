/**
 * Script para ver y activar el control de festivos
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const holidaysService = require('../src/services/holidays.service');

async function main() {
  console.log('🔍 Estado del control de festivos:\n');

  const status = holidaysService.getHolidayCheckStatus();
  console.log(`Verificación de festivos: ${status.enabled ? 'ACTIVADA ✅' : 'DESACTIVADA ❌'}`);

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  console.log(`Fecha de hoy: ${todayStr}`);

  // Verificar si hoy es festivo (según la configuración)
  const isTodayHoliday = await holidaysService.isTodayHoliday();
  console.log(`¿Hoy es festivo (según el bot)? ${isTodayHoliday ? 'SÍ ✅' : 'NO ❌'}`);

  if (isTodayHoliday) {
    const holidayName = await holidaysService.getHolidayName(new Date());
    console.log(`Nombre del festivo: ${holidayName}`);
    console.log('\n🎉 El bot NO debería responder automáticamente hoy.');
  } else {
    console.log('\n✅ El bot responderá normalmente hoy.');
  }

  console.log('\n' + '='.repeat(50));
  console.log('Para controlar esto desde el dashboard:');
  console.log('- Usa el botón "Control de Festivos"');
  console.log('- ✅ Activar: El bot verifica festivos');
  console.log('- ❌ Desactivar: El bot ignora festivos');

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
