const chrono = require('chrono-node');

const input = 'sabado';
const parsedResults = chrono.es.parse(input, new Date(), { forwardDate: true });

console.log("Parsed results:", JSON.stringify(parsedResults, null, 2));
console.log("Is hour certain?", parsedResults[0].start.isCertain('hour'));
