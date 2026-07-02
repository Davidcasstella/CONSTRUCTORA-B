const contextDetector = require('./src/services/context-detector.service');

const result = contextDetector.detectContext('si quiero');
console.log('Result for "si quiero":', result);

const result2 = contextDetector.detectContext('quiero agendar');
console.log('Result for "quiero agendar":', result2);
