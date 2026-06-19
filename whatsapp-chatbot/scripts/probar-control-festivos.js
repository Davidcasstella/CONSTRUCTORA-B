/**
 * Script para probar el control de días festivos
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const holidaysService = require('../src/services/holidays.service');

async function probarControlFestivos() {
  console.log('🧪 Probando control de días festivos...\n');

  // 1. Verificar estado inicial
  console.log('1. Estado inicial:');
  const status1 = holidaysService.getHolidayCheckStatus();
  console.log(`   ¿Verificación activada? ${status1.enabled ? 'SÍ' : 'NO'}`);
  console.log('');

  // 2. Verificar si hoy es festivo (con el estado inicial)
  console.log('2. ¿Hoy es festivo?');
  const isHoliday1 = await holidaysService.isTodayHoliday();
  console.log(`   ${isHoliday1 ? 'SÍ' : 'NO'}`);
  console.log('');

  // 3. Desactivar verificación de festivos
  console.log('3. Desactivando verificación de festivos...');
  const result1 = holidaysService.setHolidayCheck(false);
  console.log(`   Resultado: ${result1.message}`);
  console.log('');

  // 4. Verificar si hoy es festivo (ahora debe retornar false siempre)
  console.log('4. ¿Hoy es festivo? (con verificación DESACTIVADA)');
  const isHoliday2 = await holidaysService.isTodayHoliday();
  console.log(`   ${isHoliday2 ? 'SÍ' : 'NO'} (debe ser NO por la verificación desactivada)`);
  console.log('');

  // 5. Reactivar verificación de festivos
  console.log('5. Reactivando verificación de festivos...');
  const result2 = holidaysService.setHolidayCheck(true);
  console.log(`   Resultado: ${result2.message}`);
  console.log('');

  // 6. Verificar nuevamente si hoy es festivo
  console.log('6. ¿Hoy es festivo? (con verificación REACTIVADA)');
  const isHoliday3 = await holidaysService.isTodayHoliday();
  console.log(`   ${isHoliday3 ? 'SÍ' : 'NO'} (debe coincidir con el estado real)`);
  console.log('');

  console.log('✅ Prueba completada.');
  process.exit(0);
}

probarControlFestivos().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
