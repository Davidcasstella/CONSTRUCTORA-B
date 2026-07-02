const chrono = require('chrono-node');

const input = 'si quiero';
const parsedResults = chrono.es.parse(input, new Date(), { forwardDate: true });

console.log("Parsed results:", parsedResults);
