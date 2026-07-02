const chrono = require('chrono-node');

const sabadoParsed = chrono.es.parse('sabado', new Date(), { forwardDate: true })[0].start.date();
console.log("Sabado Date:", sabadoParsed);

const input = 'a las 3pm';
const parsedResults = chrono.es.parse(input, sabadoParsed, { forwardDate: false });

console.log("Parsed combined result:", parsedResults[0].start.date());
