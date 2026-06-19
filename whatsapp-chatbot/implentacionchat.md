# 📋 PLAN DE IMPLEMENTACIÓN - NORBOY CHATBOT WHATSAPP

## Fecha: Febrero 2026

---

## 1. VISIÓN GENERAL

NORBOY Chatbot es un sistema de atención automatizada por WhatsApp para la cooperativa NORBOY. Permite:
- Atención 24/7 con IA (ChatGPT)
- Escalamiento a asesores humanos
- Dashboard de administración web
- Persistencia de mensajes en DynamoDB

---

## 2. ARQUITECTURA DEL SISTEMA

```
┌─────────────────────────────────────────────────────────┐
│                    SERVIDOR (server.js)                  │
│                    Express + Socket.IO                   │
├─────────────────┬───────────────────┬───────────────────┤
│   WHATSAPP      │     SERVICIOS     │    DASHBOARD      │
│   (Baileys)     │                   │    (Frontend)     │
│                 │  - chat           │                   │
│  ← Mensajes →  │  - embeddings     │  index.html       │
│  ← Audio →     │  - RAG            │  chat.html        │
│  ← Archivos →  │  - spam-control   │  CSS/JS           │
│                 │  - escalation     │                   │
│                 │  - conversation   │  ← Socket.IO →    │
│                 │  - settings       │                   │
├─────────────────┼───────────────────┼───────────────────┤
│   PROVIDERS     │   PERSISTENCIA    │   IA PROVIDERS    │
│                 │                   │                   │
│  - Baileys      │  - DynamoDB       │  - OpenAI (GPT)   │
│  - (Meta API)   │    messages       │  - Groq (backup)  │
│  - (Twilio)     │    conversations  │                   │
│  - (Web.js)     │  - localStorage   │  Embeddings:      │
│                 │  - settings.json  │  text-embedding-  │
│                 │                   │  3-small           │
└─────────────────┴───────────────────┴───────────────────┘
```

---

## 3. COMPONENTES PRINCIPALES

### 3.1 Servidor (`server.js`)
- **Puerto**: 3001
- **Funciones**: API REST + WebSocket + WhatsApp
- **Eventos**: QR, autenticación, mensajes entrantes, desconexión

### 3.2 Servicios (`src/services/`)

| Servicio | Archivo | Función |
|----------|---------|---------|
| **Chat** | `chat.service.js` (35KB) | Lógica principal de IA, consentimiento, generación de respuestas |
| **Message Processor** | `message-processor.service.js` (44KB) | Procesamiento central de mensajes entrantes |
| **Embeddings** | `embeddings.service.js` (16KB) | Búsqueda vectorial con OpenAI embeddings |
| **RAG Optimizado** | `rag-optimized.service.js` (18KB) | Retrieval-Augmented Generation optimizado |
| **Knowledge Upload** | `knowledge-upload.service.js` (26KB) | Carga y procesamiento de documentos |
| **Spam Control** | `spam-control.service.js` (16KB) | Anti-spam con detección de repetición |
| **Number Control** | `number-control.service.js` (9KB) | Bloqueo/desbloqueo de números |
| **Escalation** | `escalation.service.js` (16KB) | Escalamiento a asesores humanos |
| **Advisor Control** | `advisor-control.service.js` (20KB) | Control de intervención de asesores |
| **Conversation State** | `conversation-state.service.js` (19KB) | Estado de conversaciones activas |
| **Settings** | `settings.service.js` (11KB) | Configuración dinámica (API keys, modelos) |
| **Holidays** | `holidays.service.js` (13KB) | Gestión de horarios y festivos |
| **Media** | `media.service.js` (10KB) | Procesamiento de archivos multimedia |
| **Stages** | `stages.service.js` (9KB) | Etapas del flujo conversacional |
| **Context Detector** | `context-detector.service.js` (11KB) | Detección de contexto del mensaje |
| **Message** | `message.service.js` (7KB) | CRUD de mensajes |
| **Time Simulation** | `time-simulation.service.js` (5KB) | Simulación de zona horaria |

### 3.3 Flujos (`src/flows/`)

| Flujo | Archivo | Descripción |
|-------|---------|-------------|
| **Base** | `base.flow.js` | Clase base para flujos |
| **Menú NORBOY** | `norboy-menu.flow.js` | Flujo principal: saludo → menú → consentimiento → proceso |
| **Index** | `index.js` | Registro de flujos |

### 3.4 Handlers (`src/handlers/`)

| Handler | Archivo | Tipo de mensaje |
|---------|---------|-----------------|
| **Texto** | `text.handler.js` | Mensajes de texto |
| **Audio** | `audio.handler.js` | Mensajes de audio |
| **Imagen** | `image.handler.js` | Fotos e imágenes |
| **Documento** | `document.handler.js` | PDFs, documentos |
| **Video** | `video.handler.js` | Videos |

### 3.5 Providers

**WhatsApp** (`src/providers/whatsapp/`):
- `baileys.provider.js` (39KB) — **ACTIVO** - Conexión vía QR
- `meta.provider.js` — Cloud API (no usado)
- `twilio.provider.js` — (no usado)
- `web.provider.js` — whatsapp-web.js (alternativo)

**IA** (`src/providers/ai/`):
- `openai.provider.js` — ChatGPT GPT-4o-mini (**ACTIVO**)
- `groq.provider.js` — Llama 3.3 70B (desactivado)

**Base de datos**:
- `dynamodb.provider.js` — AWS DynamoDB

### 3.6 Frontend Dashboard (`public/`)

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `index.html` | 321KB | Dashboard principal (monolítico) |
| `chat.html` | 14KB | Vista de chat independiente |
| `css/whatsapp-chat-style.css` | Estilo WhatsApp |
| `css/chat-fixed.css` | Correcciones de chat |
| `css/dark-mode.css` | Modo oscuro |
| `js/chat-complete.js` | Funcionalidad completa del chat |
| `js/whatsapp-chat-functionality.js` | Chat WhatsApp |

---

## 4. FLUJO CONVERSACIONAL

```
Usuario envía mensaje a WhatsApp
        ↓
┌─── ¿Es grupo (@g.us)? ───┐
│  SÍ → Ignorar             │
│  NO ↓                      │
├─── ¿Primer mensaje? ──────┤
│  SÍ → Saludo + Menú       │
│       "Hola! Aquí NORBOY"  │
│       Opciones 1-4         │
│  NO ↓                      │
├─── Selección de opción ───┤
│  → Solicitar consentimiento│
│     (datos personales)     │
│  ↓                         │
├─── ¿Acepta? ──────────────┤
│  NO → Finalizar            │
│  SÍ ↓                      │
├─── Procesar opción ───────┤
│  Opción 1: IA + RAG       │
│    (Elegimos Juntos)       │
│  Opción 2: Asesor humano  │
│    (Crédito)               │
│  Opción 3: Asesor humano  │
│    (Ahorro)                │
│  Opción 4: Asesor humano  │
│    (Otras consultas)       │
└────────────────────────────┘
```

### 4.1 Opciones del Menú

| # | Opción | Acción |
|---|--------|--------|
| 1 | Elegimos Juntos 2026-2029 | Respuesta automática con IA + RAG |
| 2 | Servicio de crédito | Escalamiento a asesor humano |
| 3 | Cuentas de ahorro | Escalamiento a asesor humano |
| 4 | Otras consultas | Escalamiento a asesor humano |

---

## 5. SISTEMA DE IA + RAG

### 5.1 Pipeline de Respuesta

```
Pregunta del usuario
    ↓
Generar embedding de la pregunta
(OpenAI text-embedding-3-small)
    ↓
Comparar con 494 embeddings de documentos
(similitud coseno, 100% local)
    ↓
Top 5 chunks más relevantes (~2,000 tokens)
    ↓
Enviar contexto + pregunta a ChatGPT
(GPT-4o-mini)
    ↓
Respuesta generada → Enviar por WhatsApp
```

### 5.2 Documentos de Conocimiento
- Carpeta: `knowledge_files/` (22 archivos)
- Archivos: PDFs y textos con información de NORBOY
- Embeddings: Pre-generados con `reprocess-embeddings.js`

### 5.3 Configuración de IA

| Parámetro | Valor |
|-----------|-------|
| **Proveedor activo** | OpenAI (ChatGPT) |
| **Modelo** | gpt-4o-mini |
| **Embedding model** | text-embedding-3-small |
| **Batch size** | 100 chunks/llamada |
| **Chunks por consulta** | Top 5 |
| **Tokens promedio** | ~2,000 (reducido de 12,904) |

---

## 6. PERSISTENCIA (DynamoDB)

### 6.1 Tablas

| Tabla | Clave | Contenido |
|-------|-------|-----------|
| `norboy-conversations` | userId | Estado de conversación, consentimiento, opción elegida |
| `norboy-messages` | messageId | Mensajes individuales (texto, tipo, timestamp) |

### 6.2 Configuración AWS

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<configurar>
AWS_SECRET_ACCESS_KEY=<configurar>
```

---

## 7. ANTI-SPAM Y CONTROL

### 7.1 Control Anti-Spam
- Máximo mensajes repetidos: 3
- Umbral de similitud: 0.9
- Historial: últimos 10 mensajes
- **Exclusiones**: Opciones del menú ("1", "2", etc.) no cuentan como spam

### 7.2 Control de Números
- Bloqueo automático por spam
- Desbloqueo manual desde dashboard

---

## 8. DASHBOARD WEB

### 8.1 Funcionalidades
- **Vista de conversaciones**: Lista de chats activos
- **Chat en tiempo real**: Interfaz estilo WhatsApp
- **Envío de mensajes**: Texto, audio, archivos, emojis
- **Configuración**: API keys, modelos, parámetros
- **Gestión de festivos**: Horarios y mensajes especiales
- **Control de asesores**: Activar/desactivar intervención
- **Modo oscuro**: Toggle claro/oscuro

### 8.2 Endpoints API

| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/conversations/:userId/whatsapp-messages` | Obtener mensajes |
| POST | `/api/conversations/:userId/send-message` | Enviar mensaje |
| POST | `/api/conversations/:userId/send-audio` | Enviar audio |
| POST | `/api/conversations/:userId/send-file` | Enviar archivo |
| GET | `/api/conversations/:userId/bot-status` | Estado del bot |

---

## 9. CONFIGURACIÓN

### 9.1 Variables de Entorno (`.env`)

| Variable | Descripción | Valor |
|----------|-------------|-------|
| `PORT` | Puerto del servidor | 3001 |
| `WHATSAPP_PROVIDER` | Proveedor WhatsApp | baileys |
| `OPENAI_API_KEY` | Clave OpenAI | sk-proj-... |
| `USE_EMBEDDINGS` | Usar búsqueda vectorial | true |
| `USE_NEW_MENU_FLOW` | Flujo de menú nuevo | true |
| `TIMEZONE` | Zona horaria | America/Bogota |
| `SPAM_MAX_REPEATED` | Máx repeticiones spam | 3 |

### 9.2 Settings Dinámicos (`settings.json`)

```json
{
  "provider": "openai",
  "openai": {
    "apiKey": "sk-proj-...",
    "model": "gpt-4o-mini",
    "enabled": true
  },
  "groq": {
    "enabled": false
  }
}
```

---

## 10. ESTADO ACTUAL ✅

### Implementado y Funcionando
- [x] Conexión WhatsApp vía Baileys (QR)
- [x] Flujo menú: saludo → menú → consentimiento → proceso
- [x] IA con ChatGPT exclusivamente (Groq desactivado)
- [x] RAG con embeddings (búsqueda vectorial)
- [x] Persistencia en DynamoDB
- [x] Dashboard web con chat estilo WhatsApp
- [x] Anti-spam con exclusiones para opciones de menú
- [x] Grabación y envío de audio
- [x] Envío de archivos e imágenes
- [x] Emoji picker funcional
- [x] Scroll automático en chat
- [x] Modo oscuro
- [x] Gestión de API keys desde dashboard
- [x] Control de asesores (intervención humana)
- [x] Gestión de festivos y horarios

### Problemas Resueltos Recientemente
- [x] ChatGPT como único proveedor IA (Grok desactivado)
- [x] Anti-spam no bloquea opciones válidas del menú
- [x] Mensajes persisten correctamente en DynamoDB
- [x] Frontend muestra mensajes del historial
- [x] Formato userId consistente entre backend y frontend

---

## 11. MEJORAS PENDIENTES / PRÓXIMOS PASOS

### Prioridad Alta
- [ ] **Tests automatizados**: Implementar tests unitarios e integración
- [ ] **Manejo de errores robusto**: Retry logic para API calls fallidas
- [ ] **Rate limiting**: Limitar llamadas API por usuario/minuto

### Prioridad Media
- [ ] **Refactorización frontend**: El `index.html` de 321KB es monolítico, separar en componentes
- [ ] **Logs centralizados**: Implementar sistema de logging estructurado
- [ ] **Métricas**: Dashboard con estadísticas de uso (mensajes/día, tiempo de respuesta)
- [ ] **Backup DynamoDB**: Configurar backups automáticos

### Prioridad Baja
- [ ] **Multi-idioma**: Soporte para inglés además de español
- [ ] **Integración CRM**: Conectar con sistema de gestión de clientes
- [ ] **Análisis de sentimiento**: Detectar usuarios frustrados

---

## 12. COMANDOS PRINCIPALES

```bash
# Instalar dependencias
npm install

# Iniciar servidor
npm start

# Iniciar en modo desarrollo (con nodemon)
npm run dev

# Generar embeddings
node reprocess-embeddings.js

# Ver estadísticas de embeddings
node reprocess-embeddings.js --stats

# Crear tablas DynamoDB
node create-dynamodb-tables.js

# Verificar permisos IAM
node verify-iam-permissions.js

# Diagnóstico DynamoDB
node diagnostico-dynamodb.js
```

---

## 13. TECNOLOGÍAS

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Node.js | ≥18.0.0 | Runtime |
| Express | 4.18.2 | API REST |
| Socket.IO | 4.7.2 | WebSocket tiempo real |
| Baileys | 7.0.0-rc.9 | WhatsApp Web (sin Chrome) |
| OpenAI SDK | 4.20.0 | ChatGPT + Embeddings |
| AWS SDK v3 | 3.985.0 | DynamoDB |
| Multer | 1.4.5 | Upload de archivos |
| Winston | 3.11.0 | Logging |
| bcryptjs | 2.4.3 | Autenticación |
| jsonwebtoken | 9.0.3 | JWT |

---

> **Última actualización**: Febrero 11, 2026
> **Equipo**: NORBOY Development Team