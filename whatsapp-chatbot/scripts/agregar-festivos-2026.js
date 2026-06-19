/**
 * Script para agregar festivos de Colombia 2026
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const holidaysService = require('../src/services/holidays.service');

const festivos2026 = [
  // Enero
  { date: '2026-01-01', name: 'Año Nuevo' },
  { date: '2026-01-12', name: 'Día de los Reyes Magos' },
  // Febrero
  { date: '2026-02-08', name: 'Día de San Blas' },
  // Marzo
  { date: '2026-03-01', name: 'Día de San José' },
  { date: '2026-03-23', name: 'Día de la Ascensión' },
  // Abril
  { date: '2026-04-02', name: 'Jueves Santo' },
  { date: '2026-04-03', name: 'Viernes Santo' },
  { date: '2026-04-12', name: 'Día de la Amistad' },
  { date: '2026-04-19', name: 'Batalla de Boyacá' },
  { date: '2026-04-26', name: 'Día del Trabajo' },
  // Mayo
  { date: '2026-05-01', name: 'Día del Trabajo' },
  { date: '2026-05-10', name: 'Día de la Madre' },
  { date: '2026-05-18', name: 'Corpus Christi' },
  { date: '2026-05-24', name: 'Batalla de Pichincha' },
  // Junio
  { date: '2026-06-08', name: 'Sagrado Corazón' },
  { date: '2026-06-15', name: 'San Pedro y San Pablo' },
  { date: '2026-06-28', name: 'San Pedro' },
  { date: '2026-06-29', name: 'San Pablo' },
  // Julio
  { date: '2026-07-20', name: 'Día de la Independencia' },
  // Agosto
  { date: '2026-08-07', name: 'Batalla de Boyacá' },
  { date: '2026-08-17', name: 'Asunción de la Virgen' },
  // Septiembre
  { date: '2026-09-20', name: 'Día del Amor y la Amistad' },
  // Octubre
  { date: '2026-10-04', name: 'Día de la Raza' },
  { date: '2026-10-11', name: 'Día de la Democracia' },
  { date: '2026-10-12', name: 'Día de la Hispanidad' },
  { date: '2026-10-18', name: 'Día de las Mujeres' },
  // Noviembre
  { date: '2026-11-02', name: 'Día de los Difuntos' },
  { date: '2026-11-16', name: 'Independencia de Cartagena' },
  { date: '2026-11-29', name: 'Día de la mujer Afrocolombiana' },
  // Diciembre
  { date: '2026-12-08', name: 'Inmaculada Concepción' },
  { date: '2026-12-13', name: 'Día de las Velitas' },
  { date: '2026-12-25', name: 'Navidad' }
];

async function agregarFestivos() {
  console.log('📅 Agregando festivos de Colombia 2026...\n');

  for (const festivo of festivos2026) {
    try {
      await holidaysService.createHoliday({
        date: festivo.date,
        name: festivo.name,
        recurring: false // No recurrentes, específicos para 2026
      });
      console.log(`✅ ${festivo.date} - ${festivo.name}`);
    } catch (error) {
      console.log(`⚠️ ${festivo.date} - ${festivo.name}: ${error.message}`);
    }
  }

  console.log('\n✨ Festivos agregados exitosamente!');
  process.exit(0);
}

agregarFestivos().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
