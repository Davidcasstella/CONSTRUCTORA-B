require('dotenv').config();
const OpenAI = require('openai');
const config = require('./src/config');
const aiRulesService = require('./src/services/ai-rules.service');

async function test() {
  const aiRulesContext = aiRulesService.buildAIRulesContext();
  
  const messages = [
    {
      role: 'system',
      content: `
PREGUNTA DEL USUARIO:
"si"

FRAGMENTOS RECUPERADOS DE LOS DOCUMENTOS:


INSTRUCCIONES:
- No se encontraron fragmentos de documentos específicos adicionales para esta consulta.
- Utiliza tus reglas base (AI Rules) y el historial de la conversación para entender el contexto y continuar la charla de manera natural.
- Si el usuario está respondiendo a una pregunta tuya anterior (por ejemplo, con un "sí", "claro", "no"), responde en consecuencia basándote en tu conocimiento general del proyecto.
- NO digas que no tienes información a menos que realmente te pregunten algo muy específico que no esté en tus reglas.
- REGLA DE ORO: Tus respuestas deben ser MUY BREVES, concisas y conversacionales, como un chat de WhatsApp. 
- Evita párrafos largos y viñetas interminables.
- Si la información es muy larga, resume solo lo más importante.`
    },
    {
      role: 'user',
      content: 'dame inf'
    },
    {
      role: 'assistant',
      content: 'La Urbanización Bellavista II es un proyecto VIP ubicado al sur de Tunja, junto al barrio Ciudad Jardín.\n\nOfrecemos apartamentos de aproximadamente 53 m², que cuentan con 3 habitaciones, 2 baños, sala-comedor con balcón, cocina y zona de ropas. Además, son ideales para acceder a subsidios como el Ecovivienda de la Alcaldía de Tunja.\n\nTe gustaría conocer los precios o agendar una visita al proyecto? 😊'
    },
    {
      role: 'system',
      content: `RECORDATORIO IMPORTANTE:
- Esta es la respuesta #2 en esta conversación (ya hubo 1 respuesta(s) anterior(es)).
- NO saludes ni te presentes de nuevo ("Hola", "¡Hola!", "Soy Ángela", etc.). Ya lo hiciste antes.
- NO repitas información que ya aparece en el historial (precios, subsidios, cuota inicial, etc.) a menos que el cliente lo pida explícitamente.
- Responde DIRECTAMENTE a lo que el cliente acaba de preguntar, de forma concisa y natural.`
    },
    {
      role: 'system',
      content: aiRulesContext
    },
    {
      role: 'user',
      content: 'si'
    }
  ];

  const openai = new OpenAI({ apiKey: config.openai.apiKey });
  
  console.log("Calling OpenAI...");
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages,
    temperature: 0.7,
    max_tokens: 500
  });

  console.log("RESPONSE:", response.choices[0].message.content);
}

test().catch(console.error);
