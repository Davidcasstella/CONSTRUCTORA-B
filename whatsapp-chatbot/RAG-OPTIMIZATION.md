# OPTIMIZACIÓN DEL SISTEMA RAG - NORBOY

## RESUMEN DE CAMBIOS

### DIAGNÓSTICO REALIZADO

| Problema | Impacto | Solución |
|----------|---------|----------|
| Modelo `all-MiniLM-L6-v2` optimizado para inglés | Scores bajos (0.44-0.60) | Umbrales ajustados + búsqueda híbrida |
| Solo 5 chunks recuperados | Contexto insuficiente | Aumentado a 15 inicial → 7 final |
| Sin re-ranking | Chunks menos relevantes pasaban | Re-ranking implementado |
| Sin búsqueda híbrida | Dependía solo de similitud vectorial | BM25 + vectorial |
| Duplicados en documentos | 523 chunks (muchos redundantes) | Script de limpieza |
| Chunking fragmentado | Q&A divididos incorrectamente | Chunking semántico |

---

## ARCHIVOS CREADOS/MODIFICADOS

### Nuevos archivos:

1. **`src/services/rag-optimized.service.js`**
   - Servicio de RAG con todas las optimizaciones
   - Re-ranking con múltiples señales
   - Búsqueda híbrida (vectorial + BM25)
   - Cache de queries (5 min TTL)
   - Umbrales dinámicos ajustados

2. **`scripts/cleanup-duplicates.js`**
   - Detecta y elimina archivos duplicados
   - Limpia archivos huérfanos

3. **`scripts/optimize-chunks.js`**
   - Reprocesa documentos con chunking semántico
   - Preserva pares Q&A intactos
   - Añade overlap entre chunks

4. **`scripts/regenerate-embeddings.js`**
   - Regenera embeddings después de optimizar chunks

### Archivos modificados:

- **`src/services/embeddings.service.js`** - Default limit: 5 → 15
- **`src/services/chat.service.js`** - Integración con RAG optimizado

---

## UMBRALES OPTIMIZADOS

### Para `all-MiniLM-L6-v2` (modelo actual):

| Calidad | Similitud | Antes | Ahora |
|---------|-----------|-------|-------|
| Alta | ≥ 0.65 | 0.80 | 0.65 |
| Media | ≥ 0.50 | 0.60 | 0.50 |
| Baja | ≥ 0.40 | 0.45 | 0.40 |
| Escalar | < 0.35 | 0.40 | 0.35 |

> **Nota**: El modelo `all-MiniLM-L6-v2` tiene scores inherentemente más bajos para español. Los umbrales se ajustaron en consecuencia.

---

## INSTRUCCIONES DE EJECUCIÓN

### Paso 1: Limpiar duplicados (opcional pero recomendado)

```bash
# Ver qué se eliminaría (sin ejecutar)
node scripts/cleanup-duplicates.js --dry-run

# Ejecutar limpieza
node scripts/cleanup-duplicates.js
```

### Paso 2: Optimizar chunking (opcional)

```bash
# Ver cambios
node scripts/optimize-chunks.js --dry-run

# Aplicar optimización
node scripts/optimize-chunks.js
```

### Paso 3: Regenerar embeddings

```bash
node scripts/regenerate-embeddings.js
```

### Paso 4: Reiniciar el servidor

```bash
npm run dev
# o
node server.js
```

---

## CONFIGURACIÓN RECOMENDADA

```javascript
// En src/services/rag-optimized.service.js

const RAG_CONFIG = {
  retrieval: {
    topK_initial: 15,    // Recuperación amplia
    topK_final: 7,       // Después de re-ranking
    minSimilarity: 0.35, // Umbral mínimo
  },

  hybrid: {
    enabled: true,
    vectorWeight: 0.7,   // 70% vectorial
    bm25Weight: 0.3,     // 30% keywords
  },

  reranking: {
    enabled: true,
    qaBoost: 1.2,        // +20% para Q&A
    keywordBoost: 0.15,  // +15% por keywords
  },

  thresholds: {
    high: 0.65,
    medium: 0.50,
    low: 0.40,
    escalate: 0.35,
  }
};
```

---

## MEJORAS FUTURAS RECOMENDADAS

### 1. Modelo de embeddings multilingüe (ALTO IMPACTO)

Cambiar a un modelo optimizado para español:

```javascript
// En embeddings.service.js, cambiar:
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
```

**Pros**: +15-20% mejora en scores
**Cons**: +100MB memoria, +200ms inicialización

### 2. Cross-encoder para re-ranking (MEDIO IMPACTO)

Usar un cross-encoder real en lugar del re-ranking heurístico:

```javascript
// Modelo recomendado:
'cross-encoder/ms-marco-MiniLM-L-6-v2'
```

### 3. Query expansion (MEDIO IMPACTO)

Expandir queries con sinónimos antes de búsqueda:

```javascript
// "cuándo voto" → ["cuándo voto", "fecha votación", "día elección"]
```

### 4. Feedback loop (BAJO IMPACTO INICIAL)

Registrar qué respuestas fueron útiles para mejorar el modelo.

---

## MÉTRICAS DE ÉXITO

Después de aplicar las optimizaciones, deberías ver:

| Métrica | Antes | Esperado |
|---------|-------|----------|
| Top similarity promedio | 0.55-0.60 | 0.58-0.65 |
| Escalaciones automáticas | Alta | Reducida 30% |
| Cache hits | 0% | 40-60% |
| Chunks recuperados | 5 | 7 (más contexto) |

---

## PREGUNTAS FRECUENTES

### ¿Por qué no cambiar el modelo de embeddings directamente?

El modelo `all-MiniLM-L6-v2` es rápido y ligero. Cambiar a un modelo multilingüe requiere:
- Regenerar TODOS los embeddings
- Más memoria RAM
- Tiempo de carga inicial mayor

Las optimizaciones actuales (re-ranking, híbrido, umbrales) mejoran significativamente sin esos costos.

### ¿Qué pasa si los scores siguen bajos?

1. Verificar que los chunks estén bien estructurados (ver archivo _data.json)
2. Verificar que no hay duplicados
3. Considerar upgrade a modelo multilingüe

### ¿Cómo sé si el cache está funcionando?

Busca en logs:
```
📦 Cache hit para: "pregunta..."
```

### ¿Puedo deshabilitar el re-ranking o búsqueda híbrida?

Sí, en `rag-optimized.service.js`:
```javascript
RAG_CONFIG.reranking.enabled = false;
RAG_CONFIG.hybrid.enabled = false;
```

---

## CONTACTO

Si tienes problemas con la optimización:
1. Revisa los logs del servidor
2. Ejecuta los scripts con `--dry-run` primero
3. Verifica que los archivos _data.json contengan embeddings válidos
