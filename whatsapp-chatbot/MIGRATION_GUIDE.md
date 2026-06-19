# 🚀 GUÍA DE MIGRACIÓN - Chatbot WhatsApp

## Introducción

Esta guía explica cómo conectar este proyecto a una cuenta AWS **completamente nueva** y desplegarlo como un chatbot independiente.

---

## 1. Requisitos Previos

- **Node.js** >= 18.0.0
- **npm** >= 8.x
- **Cuenta AWS** activa con acceso a la consola
- **API Key de OpenAI** (o Groq como alternativa)
- **Teléfono** con WhatsApp para escanear QR

---

## 2. Tablas DynamoDB Necesarias

El proyecto utiliza **8 tablas DynamoDB**. Los nombres son configurables via `.env`.

| Variable de Entorno | Descripción | Uso |
|---|---|---|
| `DYNAMODB_CONVERSATIONS_TABLE` | Conversaciones activas | Partition Key: `participantId` (String) |
| `DYNAMODB_MESSAGES_TABLE` | Historial de mensajes | Partition Key: `messageId` (String), GSI: `participantId-timestamp-index` |
| `DYNAMODB_HOLIDAYS_TABLE` | Días festivos | Partition Key: `id` (String) |
| `DYNAMODB_CONTACT_LISTS_TABLE` | Listas de contactos | Para envíos masivos |
| `DYNAMODB_CONTACTS_TABLE` | Contactos individuales | Para envíos masivos |
| `DYNAMODB_BULK_CAMPAIGNS_TABLE` | Campañas de envío masivo | Para envíos masivos |
| `DYNAMODB_BULK_MESSAGES_TABLE` | Mensajes de campañas | Para envíos masivos |
| `DYNAMODB_MESSAGE_TEMPLATES_TABLE` | Plantillas de mensajes | Para envíos masivos |

### Crear tablas automáticamente

```bash
# Configurar .env primero, luego:
node setup-dynamodb.js
node scripts/crear-tabla-holidays.js
node create-bulk-tables.js
```

### Esquema de tabla CONVERSATIONS

```json
{
  "TableName": "TU-PREFIJO-conversations",
  "KeySchema": [
    { "AttributeName": "participantId", "KeyType": "HASH" }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

### Esquema de tabla MESSAGES

```json
{
  "TableName": "TU-PREFIJO-messages",
  "KeySchema": [
    { "AttributeName": "messageId", "KeyType": "HASH" }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "participantId-timestamp-index",
      "KeySchema": [
        { "AttributeName": "participantId", "KeyType": "HASH" },
        { "AttributeName": "timestamp", "KeyType": "RANGE" }
      ],
      "Projection": { "ProjectionType": "ALL" }
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

---

## 3. Bucket S3 Necesario

Se necesita **1 bucket S3** para almacenar multimedia (imágenes, audios, videos, documentos).

| Variable | Descripción |
|---|---|
| `AWS_S3_BUCKET` | Nombre del bucket S3 para media |

### Configuración del bucket

1. Crear bucket en la región deseada
2. **No** habilitar acceso público (se accede via SDK)
3. Opcional: configurar CORS si se necesita acceso directo desde el frontend

---

## 4. Permisos IAM Necesarios

Crear un usuario IAM con las siguientes políticas (ver `aws-iam-policy.json`):

### DynamoDB
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:Query`
- `dynamodb:Scan`
- `dynamodb:BatchWriteItem`
- `dynamodb:BatchGetItem`
- `dynamodb:DescribeTable`
- `dynamodb:ListTables`

### S3
- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`

### Alcance de los recursos

- Tablas DynamoDB: `arn:aws:dynamodb:REGION:ACCOUNT:table/TU-TABLA*`
- Bucket S3: `arn:aws:s3:::TU-BUCKET` y `arn:aws:s3:::TU-BUCKET/*`

---

## 5. Variables de Entorno

### Backend (`.env`)

```env
# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=TU_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=TU_SECRET_KEY

# DynamoDB Tables
DYNAMODB_CONVERSATIONS_TABLE=mi-chatbot-conversations
DYNAMODB_MESSAGES_TABLE=mi-chatbot-messages
DYNAMODB_HOLIDAYS_TABLE=mi-chatbot-holidays
DYNAMODB_CONTACT_LISTS_TABLE=mi-chatbot-contact-lists
DYNAMODB_CONTACTS_TABLE=mi-chatbot-contacts
DYNAMODB_BULK_CAMPAIGNS_TABLE=mi-chatbot-bulk-campaigns
DYNAMODB_BULK_MESSAGES_TABLE=mi-chatbot-bulk-messages
DYNAMODB_MESSAGE_TEMPLATES_TABLE=mi-chatbot-message-templates

# S3
AWS_S3_BUCKET=mi-chatbot-media-bucket

# OpenAI
OPENAI_API_KEY=sk-...

# JWT (generar un secreto seguro)
JWT_SECRET=mi-secreto-jwt-seguro-cambiar-en-produccion

# CORS (URLs de tu frontend en producción, separadas por comas)
CORS_ALLOWED_ORIGINS=https://mi-dominio.com,https://www.mi-dominio.com
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=
```

---

## 6. Pasos para Conectar una Nueva Cuenta AWS

### Paso 1: Crear usuario IAM
1. Ir a AWS Console → IAM → Users → Create User
2. Nombre: `chatbot-service-user`
3. Acceso: **Programmatic access**
4. Aplicar política inline copiando `aws-iam-policy.json` (reemplazar placeholders)
5. Generar Access Keys y guardarlas

### Paso 2: Crear tablas DynamoDB
```bash
cp .env.example .env
# Editar .env con tus credenciales y nombres de tabla
node setup-dynamodb.js
node scripts/crear-tabla-holidays.js
```

### Paso 3: Crear bucket S3
1. AWS Console → S3 → Create bucket
2. Nombre: el que configuraste en `AWS_S3_BUCKET`
3. Región: la misma que `AWS_REGION`

### Paso 4: Configurar el proyecto
```bash
npm install
cd frontend && npm install && cd ..
```

### Paso 5: Iniciar
```bash
# Backend
npm start
# o con nodemon para desarrollo:
npm run dev

# Frontend (en otra terminal)
cd frontend && npm run dev
```

### Paso 6: Escanear QR
1. Abrir http://localhost:3001 o http://localhost:5173
2. Login con usuario/contraseña
3. Escanear el QR con WhatsApp

---

## 7. Personalización

### Cambiar la identidad del chatbot

Los textos de identidad del chatbot se encuentran en:
- `src/config/openai.config.js` → System prompts
- `src/services/welcome-config.service.js` → Mensajes de bienvenida
- `src/services/message-processor.service.js` → Mensajes de escalación
- `src/services/context-detector.service.js` → Keywords de contexto
- `src/flows/norboy-menu.flow.js` → Flujo del menú
- `PreguntasRespuestas.txt` → Base de conocimiento

### Cambiar usuarios y contraseñas

Editar `src/config/auth.config.js`:
- Modificar el objeto `USERS` para agregar/eliminar usuarios
- Cambiar el `PASSWORD_HASH` con bcrypt
- Configurar `JWT_SECRET` en `.env`

---

## 8. Notas Importantes

- **DynamoDB** funciona en modo `PAY_PER_REQUEST` (solo pagas por lo que usas)
- **S3** es opcional — si no configuras `AWS_S3_BUCKET`, los archivos se guardan solo localmente
- El proyecto **no requiere** servicios como Lambda, API Gateway, CloudFront, Cognito, SES, SNS ni SQS
- Si no necesitas los envíos masivos (bulk), solo necesitas 3 tablas: conversations, messages, holidays
