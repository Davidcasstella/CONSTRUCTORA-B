const chrono = require('chrono-node');

const sabadoParsed = chrono.es.parse('sabado', new Date(), { forwardDate: true })[0].start.date();
const input = 'a las 3pm';
const parsedResults = chrono.es.parse(input, sabadoParsed, { forwardDate: true });

console.log("Parsed results:", JSON.stringify(parsedResults, null, 2));
console.log("Is day certain?", parsedResults[0].start.isCertain('day'));
console.log("Is hour certain?", parsedResults[0].start.isCertain('hour'));
