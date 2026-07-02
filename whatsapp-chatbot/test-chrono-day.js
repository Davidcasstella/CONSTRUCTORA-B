const chrono = require('chrono-node');

const input = 'mañana a las 3pm';
const parsedResults = chrono.es.parse(input, new Date(), { forwardDate: true });

console.log("Parsed results:", JSON.stringify(parsedResults, null, 2));
console.log("Is day certain?", parsedResults[0].start.isCertain('day'));
console.log("Is weekday certain?", parsedResults[0].start.isCertain('weekday'));
