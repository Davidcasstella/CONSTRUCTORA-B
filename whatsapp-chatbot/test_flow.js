const flowManager = require('./src/flows');
async function test() {
  const userId = 'test-user';
  // 1. Iniciar el flujo de citas SIN AWAIT (simulando message-processor)
  const startPromise = flowManager.startFlow(userId, 'appointment', {
    whatsappName: 'David',
    customName: null
  });
  
  // 2. Simular el delay de saveMessage
  await new Promise(r => setTimeout(r, 10));
  
  // 3. Procesar el mensaje inicial en el flujo
  const flowResponse = await flowManager.handleInput(userId, '');
  console.log('FLOW RESPONSE:', flowResponse);
}
test();
