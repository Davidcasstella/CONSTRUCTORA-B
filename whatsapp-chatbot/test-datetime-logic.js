const chrono = require('chrono-node');

function simulate(inputs) {
  let pendingDateIso = null;
  let pendingHourIso = null;

  for (const input of inputs) {
    console.log(`\n--- Input: "${input}" ---`);
    let refDate = new Date();
    if (pendingDateIso) {
      refDate = new Date(pendingDateIso);
    }

    const parsedResults = chrono.es.parse(input, refDate, { forwardDate: true });
    if (parsedResults.length === 0) {
      console.log("No parse results.");
      continue;
    }

    const start = parsedResults[0].start;
    const parsedDate = start.date();
    
    const hasExplicitDay = start.isCertain('day') || start.isCertain('weekday') || !!pendingDateIso;
    const hasExplicitHour = start.isCertain('hour') || !!pendingHourIso;

    if (!hasExplicitDay) {
      pendingDateIso = parsedDate.toISOString();
      pendingHourIso = true;
      console.log(`[Ask Day] Entendido, a las ${parsedDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })}. ¿Pero qué día te gustaría asistir?`);
      continue;
    }

    if (!hasExplicitHour) {
      pendingDateIso = parsedDate.toISOString();
      console.log(`[Ask Hour] Perfecto, el ${parsedDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })}. ¿A qué hora te quedaría bien?`);
      continue;
    }

    console.log(`[Success] Final Date: ${parsedDate.toISOString()}`);
    pendingDateIso = null;
    pendingHourIso = null;
  }
}

simulate(["sabado", "a las 3pm"]);
simulate(["a las 10am", "mañana"]);
simulate(["el viernes a las 4pm"]);
