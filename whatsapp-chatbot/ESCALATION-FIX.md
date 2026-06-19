# CORRECCIÓN CRÍTICA: ESCALACIÓN Y DETECCIÓN DE CONTEXTO

## PROBLEMAS CORREGIDOS

### Problema 1: Sistema inventaba respuestas
**Antes**: Cuando no había info, llamaba a IA sin restricciones → inventaba
**Ahora**: Score bajo o sin info → ESCALA inmediatamente, NO llama a IA

### Problema 2: Respondía preguntas fuera de contexto
**Antes**: "qué es el agua" → IA respondía con conocimiento general
**Ahora**: Detecta contexto ANTES de RAG → mensaje restrictivo

---

## ARCHIVOS MODIFICADOS

### 1. `src/services/context-detector.service.js` (NUEVO)
- Detecta si pregunta es sobre NORBOY
- Keywords de NORBOY vs fuera de contexto
- Se ejecuta ANTES de buscar en RAG

### 2. `src/services/chat.service.js`
- Integra detector de contexto al inicio
- Elimina función `getGenericResponse` que inventaba
- Escalación automática cuando:
  - `contextQuality === 'very_low'`
  - `contextQuality === 'none'`
  - `searchResults.length === 0`
  - `topScore < 15` (keywords)
  - `topSimilarity < 0.45` (embeddings)

### 3. `src/services/rag-optimized.service.js`
- Umbrales más estrictos:
  - `escalate: 0.45` (antes 0.35)
- `evaluateEscalation()` mejorada

---

## NUEVO FLUJO DE DECISIÓN

```
Usuario envía mensaje
        │
        ▼
┌─────────────────────────────┐
│ DETECTAR CONTEXTO (NUEVO)   │
│ ¿Es sobre NORBOY?           │
└─────────────────────────────┘
        │
    NO ─┼─── SI
        │       │
        ▼       ▼
┌───────────┐ ┌─────────────────┐
│ Mensaje   │ │ Buscar en RAG   │
│ restrictiv│ │ (15 chunks)     │
│ "Solo     │ └─────────────────┘
│ NORBOY"   │         │
└───────────┘         ▼
                ┌───────────────┐
                │ ¿Score > 0.45?│
                └───────────────┘
                      │
               NO ────┼──── SI
                      │       │
                      ▼       ▼
               ┌───────────┐ ┌─────────────┐
               │ ESCALAR   │ │ Re-ranking  │
               │ (no IA)   │ │ → 7 chunks  │
               └───────────┘ └─────────────┘
                                    │
                                    ▼
                             ┌─────────────┐
                             │ Llamar IA   │
                             │ con contexto│
                             └─────────────┘
```

---

## MENSAJES DE RESPUESTA

### Fuera de contexto:
```
Sumercé, solo puedo ayudarle con información sobre las elecciones
de delegados de NORBOY y el proceso "Elegimos Juntos 2026-2029".

¿Tiene alguna pregunta relacionada con el proceso electoral? 👍
```

### Sin información (escalación):
```
Comprendo, sumercé. 👩‍💼

No tengo información específica sobre eso en mis documentos.

El asesor de NORBOY encargado de este tema le atenderá en breve...
```

### Baja confianza (escalación):
```
Sumercé, no encontré información precisa sobre esa pregunta
en los documentos disponibles.

Un asesor de NORBOY podrá ayudarle mejor. Le atenderán en breve... 👩‍💼
```

---

## UMBRALES FINALES

### Para embeddings (similitud 0-1):
| Calidad | Similitud | Acción |
|---------|-----------|--------|
| Alta | ≥ 0.65 | Responder con confianza |
| Media | ≥ 0.50 | Responder con contexto |
| Baja | ≥ 0.45 | **ESCALAR** |
| Muy baja | < 0.45 | **ESCALAR** |

### Para keywords (score 0-100):
| Calidad | Score | Acción |
|---------|-------|--------|
| Alta | ≥ 50 | Responder |
| Media | ≥ 30 | Responder |
| Baja | ≥ 15 | **ESCALAR** |
| Muy baja | < 15 | **ESCALAR** |

---

## CASOS DE PRUEBA

### Caso 1: "que es el agua"
```
Input: "que es el agua"
Contexto: ❌ NO es NORBOY (keyword "agua" en OUT_OF_CONTEXT)
RAG: NO SE EJECUTA
Output: Mensaje restrictivo
IA: ❌ NO SE LLAMA
```

### Caso 2: "Los ganadores en votos"
```
Input: "Los ganadores en votos"
Contexto: ✅ ES NORBOY (keywords: "ganador", "votos")
RAG: Ejecutado, score BAJO (0.35)
Output: ESCALACIÓN
IA: ❌ NO SE LLAMA
```

### Caso 3: "cuando puedo votar"
```
Input: "cuando puedo votar"
Contexto: ✅ ES NORBOY (keywords: "cuando", "votar")
RAG: Ejecutado, score ALTO (0.72)
Output: Respuesta con info de documentos
IA: ✅ SE LLAMA con contexto
```

---

## VERIFICACIÓN

Busca estos logs para confirmar que funciona:

### Pregunta fuera de contexto:
```
🔍 Contexto detectado: out_of_scope (NORBOY: false)
❌ Pregunta FUERA DE CONTEXTO: "..."
   Razón: Pregunta no relacionada con NORBOY
```

### Escalación por score bajo:
```
⚠️ ESCALACIÓN REQUERIDA: similarity_below_threshold
   ❌ NO se llamará a IA - Score insuficiente
```

### Respuesta exitosa:
```
📊 Calidad: HIGH (top: 0.7234, avg: 0.6521)
🎯 Chunks: 15 → 7 (con re-ranking)
✅ Respuesta: OpenAI con documentos
```

---

## REINICIAR SERVIDOR

```bash
npm run dev
```

El sistema ahora:
1. ✅ Detecta contexto ANTES de buscar
2. ✅ NO inventa respuestas
3. ✅ Escala cuando score es bajo
4. ✅ Solo llama a IA con buen contexto
