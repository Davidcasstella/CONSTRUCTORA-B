require('dotenv').config();
const OpenAI = require('openai');
const config = require('./src/config');

async function test() {
  const message = "mañana a las 3pm";
  const recentMessages = `Usuario: si quiero
Asistente: ¡Perfecto! Estás muy cerca de cumplir este sueño. ¿Para qué fecha y hora te gustaría agendar tu visita?`;

  const systemPrompt = `Eres un clasificador de intenciones para un chatbot de una constructora colombiana.
Tu ÚNICA tarea es clasificar el mensaje del usuario en UNA de estas categorías:

- book   → el usuario quiere AGENDAR, programar, pedir, sacar o crear una nueva cita/reunión/visita
- view   → el usuario quiere CONSULTAR, ver, saber o revisar sus citas o reuniones existentes
- cancel → el usuario quiere CANCELAR, eliminar, quitar o anular una cita o reunión existente
- other  → cualquier otro tema (preguntas, saludos, quejas, información, etc.)

REGLA CRÍTICA: Si el mensaje del usuario es una respuesta corta afirmativa (como "sí", "claro", "ok") y el asistente en el mensaje anterior le dio a elegir entre MÚLTIPLES opciones (ejemplo: "precios o agendar visita"), DEBES clasificarlo como "other". Esto permite que el chat principal responda ambas cosas. Solo clasifícalo como "book" si el usuario lo pide explícitamente ("quiero agendar", "sí, quiero ir a ver") o si la pregunta anterior era ÚNICAMENTE sobre agendar.

Responde ÚNICAMENTE con una de las 4 palabras: book, view, cancel, other
No expliques. No uses puntos. Solo la palabra.`;

  const userPrompt = `Conversación previa (contexto):
${recentMessages}

Mensaje actual del usuario:
"${message}"

Clasifica la intención del mensaje actual:`;

  const openai = new OpenAI({ apiKey: config.openai.apiKey });
  
  console.log("Calling OpenAI classifier...");
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0,
    max_tokens: 5
  });

  console.log("RESPONSE:", response.choices[0].message.content);
}

test().catch(console.error);
