# ✅ CHECKLIST DE NUEVO DESPLIEGUE

## Pre-requisitos

- [ ] Cuenta AWS activa
- [ ] Node.js >= 18.0.0 instalado
- [ ] npm >= 8.x instalado
- [ ] API Key de OpenAI (o Groq)
- [ ] Teléfono con WhatsApp disponible para escanear QR
- [ ] Dominio configurado (opcional, para producción)

---

## 1. Configuración AWS

### IAM
- [ ] Crear usuario IAM (`chatbot-service-user`)
- [ ] Generar Access Key y Secret Access Key
- [ ] Aplicar política inline desde `aws-iam-policy.json`
- [ ] Reemplazar placeholders en la política (REGION, ACCOUNT_ID, TABLE_NAMES, BUCKET)
- [ ] Guardar credenciales de forma segura

### DynamoDB
- [ ] Crear tabla de conversaciones (`DYNAMODB_CONVERSATIONS_TABLE`)
- [ ] Crear tabla de mensajes (`DYNAMODB_MESSAGES_TABLE`) con GSI `participantId-timestamp-index`
- [ ] Crear tabla de festivos (`DYNAMODB_HOLIDAYS_TABLE`)
- [ ] (Opcional) Crear tablas de envío masivo:
  - [ ] Contact lists
  - [ ] Contacts
  - [ ] Bulk campaigns
  - [ ] Bulk messages
  - [ ] Message templates

### S3
- [ ] Crear bucket S3 para almacenamiento multimedia
- [ ] Verificar que la región coincida con `AWS_REGION`
- [ ] Confirmar que el usuario IAM tiene acceso al bucket

---

## 2. Configuración del Proyecto

### Backend
- [ ] Copiar `.env.example` a `.env`
- [ ] Configurar `AWS_REGION`
- [ ] Configurar `AWS_ACCESS_KEY_ID`
- [ ] Configurar `AWS_SECRET_ACCESS_KEY`
- [ ] Configurar nombres de todas las tablas DynamoDB
- [ ] Configurar `AWS_S3_BUCKET`
- [ ] Configurar `OPENAI_API_KEY`
- [ ] Configurar `JWT_SECRET` (generar uno seguro con `openssl rand -hex 32`)
- [ ] Configurar `CORS_ALLOWED_ORIGINS` (URLs del frontend en producción)
- [ ] Instalar dependencias: `npm install`

### Frontend
- [ ] Copiar `frontend/.env.example` a `frontend/.env`
- [ ] Configurar `VITE_API_URL` (si es necesario)
- [ ] Instalar dependencias: `cd frontend && npm install`

---

## 3. Personalización del Chatbot

- [ ] Editar `PreguntasRespuestas.txt` con la base de conocimiento del nuevo cliente
- [ ] Editar `src/config/openai.config.js` → Cambiar system prompts
- [ ] Editar `src/config/auth.config.js` → Cambiar usuarios y contraseñas
- [ ] Editar `src/services/welcome-config.service.js` → Mensajes de bienvenida
- [ ] Editar `src/services/context-detector.service.js` → Keywords del contexto
- [ ] Editar `src/services/message-processor.service.js` → Mensajes de escalación
- [ ] Editar `src/flows/norboy-menu.flow.js` → Flujo del menú
- [ ] Reemplazar `public/LOGO.jpeg` con el logo del nuevo cliente
- [ ] Editar `frontend/index.html` → Cambiar título y meta description

---

## 4. Verificación Local

- [ ] Ejecutar `node setup-dynamodb.js` → Tablas creadas correctamente
- [ ] Ejecutar `npm start` → Servidor inicia sin errores
- [ ] Ejecutar `cd frontend && npm run dev` → Frontend carga correctamente
- [ ] Login funciona con las credenciales configuradas
- [ ] QR se genera correctamente
- [ ] Escanear QR y verificar conexión a WhatsApp
- [ ] Enviar mensaje de prueba → Bot responde correctamente
- [ ] Verificar que los mensajes se guardan en DynamoDB
- [ ] Enviar imagen de prueba → Media se sube a S3 (si configurado)
- [ ] Dashboard muestra conversaciones correctamente

---

## 5. Despliegue en Producción

### Servidor
- [ ] Copiar proyecto al servidor
- [ ] Instalar dependencias en servidor
- [ ] Configurar `.env` con valores de producción (`NODE_ENV=production`)
- [ ] Configurar PM2: `pm2 start ecosystem.config.js`
- [ ] Verificar que PM2 auto-reinicia si el proceso falla

### Frontend (build de producción)
- [ ] Ejecutar `cd frontend && npm run build`
- [ ] Copiar `frontend/dist/` al directorio de archivos estáticos del servidor web
- [ ] Configurar nginx/Apache/CloudFront para servir el frontend

### DNS y SSL
- [ ] Configurar dominio DNS apuntando al servidor
- [ ] Configurar certificado SSL (Let's Encrypt o similar)
- [ ] Actualizar `CORS_ALLOWED_ORIGINS` con el dominio de producción

### Monitoreo
- [ ] Verificar logs: `pm2 logs whatsapp-chatbot`
- [ ] Configurar alertas de AWS CloudWatch (opcional)
- [ ] Verificar que `keep-alive.sh` está configurado si se usa

---

## 6. Post-Despliegue

- [ ] Enviar mensaje de prueba al número de WhatsApp
- [ ] Verificar respuesta del bot
- [ ] Verificar acceso al dashboard desde el dominio
- [ ] Verificar que las conversaciones se persisten tras reinicio
- [ ] Documentar credenciales y configuración en lugar seguro
- [ ] Rotar las Access Keys de IAM periódicamente

---

## Solución de Problemas Comunes

| Problema | Solución |
|---|---|
| `AccessDeniedException` en DynamoDB | Verificar política IAM del usuario |
| Bot no responde | Verificar QR escaneado y conexión activa |
| Frontend no carga | Verificar `CORS_ALLOWED_ORIGINS` y proxy config |
| Media no se sube | Verificar `AWS_S3_BUCKET` y permisos S3 |
| JWT inválido | Verificar `JWT_SECRET` y que no se cambió después de login |
