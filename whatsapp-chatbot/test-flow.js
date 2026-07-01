const flowManager = require('./src/flows/index.js');

async function test() {
  try {
    const msg = await flowManager.startFlow('test-user', 'appointment', { whatsappName: 'Test' });
    console.log('Result:', msg);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
