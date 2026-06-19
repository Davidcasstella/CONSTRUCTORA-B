# Forzar ChatGPT como Único Proveedor de IA

## Problema

Las respuestas del bot **no están usando ChatGPT**. En los logs se ve:

```
🔍 Detectando contexto: "y en que me sirve eso..."    
   ⚠️ Sin keywords reconocibles, asumiendo fuera de contexto
❌ Pregunta FUERA DE CONTEXTO: "y en que me sirve eso..."
✅ Respuesta generada: "Sumercé, solo puedo ayudarle con información sobre..."
```

La respuesta es un **texto hardcodeado** del [context-detector.service.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/context-detector.service.js) — ChatGPT **nunca es llamado**.

## Causa Raíz

Hay 3 problemas en el pipeline de generación:

### 1. Context Detector bloquea ANTES de llegar a ChatGPT

En [chat.service.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/chat.service.js) líneas 110-125:

```javascript
const contextResult = contextDetector.detectContext(message);
if (!contextResult.isNorboyRelated) {
  return { type: 'out_of_scope', text: contextDetector.MESSAGES.outOfScope };
  // ❌ ChatGPT NUNCA se llama
}
```

El [detectContext()](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/context-detector.service.js#224-329) en [context-detector.service.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/context-detector.service.js) línea 320 clasifica cualquier mensaje sin keywords de NORBOY como `unknown` → `isNorboyRelated: false`. Resultado: respuesta hardcodeada sin pasar por ChatGPT.

### 2. Fallback automático a Groq

En [index.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/providers/ai/index.js) líneas 117-139, si ChatGPT falla, automáticamente usa Groq como fallback. En [settings.json](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/settings.json) Groq ya está `enabled: false`, pero el código aún lo intenta.

### 3. System prompt verboso

El prompt en [openai.config.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/config/openai.config.js) dice "BREVE y DIRECTO" pero tiene demasiadas reglas largas. Necesita ser más estricto para respuestas cortas.

## Proposed Changes

### 1. Context Detector — Dejar que ChatGPT maneje "unknown"

#### [MODIFY] [context-detector.service.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/context-detector.service.js)

Cambiar línea 320: cuando no hay keywords reconocibles, marcar `isNorboyRelated: true` para que ChatGPT decida (en vez de responder con texto hardcodeado). ChatGPT ya tiene en su prompt la instrucción de responder solo sobre NORBOY.

### 2. AI Provider — Eliminar Groq fallback

#### [MODIFY] [index.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/providers/ai/index.js)

- Eliminar toda la lógica de fallback a Groq en la función [chat()](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/providers/ai/index.js#77-171)
- Si ChatGPT falla, lanzar error directamente (sin intentar Groq)
- Eliminar Caso B (usar Groq cuando ChatGPT está desactivado)

### 3. System Prompt — Más conciso y estricto

#### [MODIFY] [openai.config.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/config/openai.config.js)

Reescribir el `systemPrompts.default` para forzar respuestas:
- Cortas (1-2 oraciones máximo)
- Directas y profesionales
- Sin emojis innecesarios
- Sin explicaciones largas

## Estado Actual (ya correcto ✅)

- [settings.json](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/settings.json): `provider: "openai"`, Groq `enabled: false`, OpenAI `enabled: true` con API key válida
- El modelo activo es `gpt-4o-mini` ✅
- El [chat.service.js](file:///c:/Users/David/Desktop/NORBOY-CHAT/AUTOMATIZACION/whatsapp-chatbot/src/services/chat.service.js) llama `aiProvider.chat()` correctamente cuando llega al paso de IA

## Verification Plan

### Manual
1. Reiniciar server
2. Enviar "y en que me sirve eso" → Debe llegar a ChatGPT (no respuesta hardcodeada)
3. Verificar en logs: `🤖 Usando ChatGPT (proveedor primario)...`
4. Verificar que no aparece `Grok` en ningún log
