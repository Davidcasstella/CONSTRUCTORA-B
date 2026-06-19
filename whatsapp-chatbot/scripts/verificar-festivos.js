/**
 * Script para verificar el sistema de festivos
 * Prueba si hoy es festivo y muestra el mensaje que se enviaría
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const holidaysService = require('../src/services/holidays.service');

async function verificarFestivos() {
  console.log('🔍 Verificando sistema de festivos...\n');

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  console.log(`📅 Fecha de hoy: ${todayStr}\n`);

  // Verificar si hoy es festivo
  const isTodayHoliday = await holidaysService.isTodayHoliday();

  if (isTodayHoliday) {
    const holidayName = await holidaysService.getHolidayName(today);
    console.log(`✅ HOY ES DÍA FESTIVO: ${holidayName}`);
    console.log('\n📝 Mensaje que se enviará a los clientes:');
    console.log('━'.repeat(50));
    console.log(`🎉 Hoy es ${holidayName}

Nuestro horario de atención es:

📅 Lunes a Viernes: 8:00 AM - 4:30 PM
📅 Sábados: 9:00 AM - 12:00 PM

Su mensaje será atendido en el siguiente día hábil. Gracias por su comprensión.`);
    console.log('━'.repeat(50));
    console.log('\n✅ El bot NO responderá automáticamente hoy.');
  } else {
    console.log('❌ Hoy NO es día festivo');
    console.log('✅ El bot responderá normalmente.');
  }

  console.log('\n📊 Festivos cargados en caché:');
  const holidays = await holidaysService.getHolidays();
  console.log(`   Total: ${holidays.length} festivos activos`);

  // Mostrar próximos 5 festivos
  console.log('\n📆 Próximos festivos:');
  const upcomingHolidays = holidays
    .filter(h => {
      if (h.recurring) {
        const holidayMonth = parseInt(h.date.substring(5, 7));
        const holidayDay = parseInt(h.date.substring(8, 10));
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        // Si es mismo mes pero día posterior, o mes posterior
        if (holidayMonth > currentMonth) return true;
        if (holidayMonth === currentMonth && holidayDay >= currentDay) return true;
        return false;
      } else {
        return new Date(h.date) >= today;
      }
    })
    .sort((a, b) => {
      const monthA = parseInt(a.date.substring(5, 7));
      const dayA = parseInt(a.date.substring(8, 10));
      const monthB = parseInt(b.date.substring(5, 7));
      const dayB = parseInt(b.date.substring(8, 10));
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    })
    .slice(0, 5);

  if (upcomingHolidays.length > 0) {
    upcomingHolidays.forEach(h => {
      console.log(`   📌 ${h.date} - ${h.name} ${h.recurring ? '(recurrente)' : ''}`);
    });
  } else {
    console.log('   (No hay más festivos este año)');
  }

  console.log('\n✅ Verificación completada.');
  process.exit(0);
}

verificarFestivos().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
