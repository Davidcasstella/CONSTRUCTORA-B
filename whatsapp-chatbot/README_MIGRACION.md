# Migración a Baileys - Instrucciones de Uso

## ✅ Cambios Realizadoss

El bot ha sido migrado exitosamente de `whatsapp-web.js` (requiere Chrome/Puppeteer) a `@whiskeysockets/baileys` (WebSocket directo).

### Archivos Modificados
1. **[baileys.provider.js](src/providers/whatsapp/baileys.provider.js)** - Nuevo provider basado en CHAT-BOT-WIMPY
2. **[server.js](server.js)** - Actualizado para usar Baileys
3. **[package.json](package.json)** - Dependencias actualizadas
4. **[.env](.env)** - Configuración actualizada

## 🚀 Cómo Usar el Bot

### 1. Iniciar el Servidor
```bash
cd AUTOMATIZACION/whatsapp-chatbot
npm start
```

### 2. Escanear el QR Code
- Abre http://localhost:3001 en tu navegador
- El QR code se mostrará tanto en la terminal como en la web
- Escanea el QR con WhatsApp en tu teléfono:
  1. Abre WhatsApp
  2. Toca los 3 puntos menú
  3. Selecciona "Aparatos vinculados"
  4. Toca "Vincular un aparato"
  5. Escanea el QR code

### 3. Verificar Conexión
- Cuando esté conectado verás: `✅ ¡Conectado a WhatsApp con Baileys!`
- Tu número de teléfono aparecerá en la terminal

### 4. Probar el Bot
- Envía "Hola" desde WhatsApp al número del bot
- El bot responderá usando IA (Groq/OpenAI)
- También puedes hacer preguntas sobre el knowledge base

## 🔧 Configuración

### Cambiar Puerto (si hay conflicto)
Edita `.env`:
```bash
PORT=3001  # Cambia este valor si 3001 está ocupado
```

### Cambiar Provider
En `.env`:
```bash
# Para usar Baileys (recomendado):
WHATSAPP_PROVIDER=baileys

# Para volver a whatsapp-web.js (no recomendado):
WHATSAPP_PROVIDER=web
```

## 📁 Carpetas Importantes

- **baileys_auth/** - Sesión de WhatsApp (NO borrar si quieres mantener la sesión)
- **logs/** - Logs del servidor
- **uploads/** - Archivos subidos (PDFs, imágenes, etc.)
- **PreguntasRespuestas.txt** - Base de conocimiento

## ✨ Ventajas de Baileys

✅ **Sin Chrome/Puppeteer** - No requiere navegador
✅ **Más rápido** - Conexión WebSocket directa
✅ **Más estable** - Menos propenso a desconexiones
✅ **Menos recursos** - Consume menos memoria y CPU
✅ **Auto-reconexión** - Se reconecta automáticamente si se desconecta
✅ **Mismo modelo que Wimpy** - Bot probado y funcional

## 🐛 Solución de Problemas

### El servidor no inicia
```bash
# Eliminar node_modules y reinstalar
rm -rf node_modules
npm install
npm start
```

### El QR no aparece
- Verifica que el puerto 3001 esté disponible
- Revisa los logs en `logs/server.log`
- Asegúrate de que el firewall no bloquee el puerto

### Necesitas nuevo QR
```bash
# Eliminar la carpeta de sesión
rm -rf baileys_auth
# Reiniciar el servidor
npm start
```

### El bot no responde
- Verifica que WHATSAPP_PROVIDER=baileys en `.env`
- Revisa los logs para ver errores
- Asegúrate de que Groq/OpenAI API keys sean válidas

## 📊 Comparación con Wimpy

| Característica | Wimpy | Automatizaciones (ahora) |
|---------------|-------|--------------------------|
| Biblioteca | Baileys | Baileys ✅ |
| IA | No | Sí (Groq + OpenAI) |
| Knowledge Base | Estática | Dinámica (PDFs, TXT) |
| Puerto | 3000 | 3001 |
| Menús | Personalizado | IA + Preguntas/Respuestas |

## 🎯 Próximos Pasos (Opcionales)

1. **Probar en producción** - Dejar corriendo 24/7
2. **Monitorear** - Revisar logs regularmente
3. **Mejorar knowledge base** - Agregar más Q&A a PreguntasRespuestas.txt
4. **Personalizar respuestas** - Editar `chat.service.js`

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en `logs/server.log`
2. Verifica que todas las dependencias estén instaladas
3. Asegúrate de que `.env` esté configurado correctamente

---
**Migración completada**: 2026-01-28
**Basado en**: CHAT-BOT-WIMPY (modelo funcional)
**Provider**: @whiskeysockets/baileys v7.0.0-rc.9
