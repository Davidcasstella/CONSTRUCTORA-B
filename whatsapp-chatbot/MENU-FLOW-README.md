# Flujode Menú Principal NORBOY

## 📋 Descripción

El **Flujo de Menú Principal NORBOY** es un nuevo sistema de interacción que guía a los usuarios a través de un menú estructurado antes de procesar sus consultas.

## 🔄 Flujo Conversacional

### Paso 1: Primer Mensaje - Saludo y Menú

Al recibir el primer mensaje de un usuario, el bot responde con dos mensajes:

**Mensaje 1:**
```
Hola! Aquí el equipo NORBOY 👋
```

**Mensaje 2:**
```
Escribe el número de la opción 👇

*1.* Elegimos Juntos 2026-2029
*2.* Servicio de crédito
*3.* Cuentas de ahorro
*4.* Otras consultas
```

### Paso 2: Segundo Mensaje - Consentimiento

Después de que el usuario selecciona una opción, se solicita el consentimiento:

```
👋 ¡Gracias por escribirnos!

Para poder asesorarte mejor, te solicitamos autorizar el tratamiento de tus datos personales.

👉 Conócenos aquí:
https://norboy.coop/

📄 Consulta nuestras políticas:
🔒 Política de Protección de Datos Personales:
https://norboy.coop/proteccion-de-datos-personales/

💬 Uso de WhatsApp:
https://www.whatsapp.com/legal

━━━━━━━━━━━━━━━━━━
⚠️ IMPORTANTE

¿Aceptas las políticas de tratamiento de datos personales?

Por favor, digita:

1. Si
 
2. No
```

### Paso 3: Procesamiento según Opción Elegida

#### Si el usuario acepta (Si):

```
En qué le podemos servir?
```

**Opción 1 - Elegimos Juntos 2026-2029:**
- ✅ Procesa la consulta usando el sistema RAG + API activa
- Responde normalmente con la información correspondiente

**Opción 2 - Servicio de crédito:**
```
Comprendo, sumercé. 👩‍💼
El asesor de NORBOY encargado de este tema le atenderá en breve...
```
- 🔄 Redirige a asesor humano

**Opción 3 - Cuentas de ahorro:**
```
Comprendo, sumercé. 👩‍💼
El asesor de NORBOY encargado de este tema le atenderá en breve...
```
- 🔄 Redirige a asesor humano

**Opción 4 - Otras consultas:**
```
Comprendo, sumercé. 👩‍💼
El asesor de NORBOY encargado de este tema le atenderá en breve...
```
- 🔄 Redirige a asesor humano

#### Si el usuario rechaza (No):

```
Entendido, sumercé. Su decisión ha sido registrada.

Si cambia de opinión, puede escribirnos nuevamente.
```

- ❌ No continúa la conversación
- ❌ No procesa ninguna consulta

## ⚙️ Configuración

### Habilitar/Deshabilitar el Nuevo Flujo

El flujo de menú se controla mediante la variable de entorno `USE_NEW_MENU_FLOW` en el archivo `.env`:

```env
# Habilita el nuevo flujo de menú NORBOY
# true: Usa el nuevo flujo (saludo + menú + consentimiento)
# false: Usa el flujo original (saludo simple + consentimiento)
USE_NEW_MENU_FLOW=true
```

### Cambiar entre Flujos

**Para usar el NUEVO flujo de menú:**
```env
USE_NEW_MENU_FLOW=true
```

**Para usar el flujo ORIGINAL:**
```env
USE_NEW_MENU_FLOW=false
```

> **Nota:** Debes reiniciar el servidor después de cambiar esta configuración.

## 📂 Archivos Modificados

1. **[src/flows/norboy-menu.flow.js](src/flows/norboy-menu.flow.js)** - Nuevo flujo de menú
2. **[src/flows/index.js](src/flows/index.js)** - Registro del nuevo flujo
3. **[src/services/message-processor.service.js](src/services/message-processor.service.js)** - Integración del flujo
4. **[.env](.env)** - Configuración `USE_NEW_MENU_FLOW`

## 🔧 Arquitectura

### Clase: NorboyMenuFlow

Extiende de `BaseFlow` e implementa:

- **Pasos:** `['welcome', 'consent', 'process']`
- **Métodos:**
  - `handleWelcome(input, isStart)` - Maneja saludo y selección de menú
  - `handleConsent(input, isStart)` - Maneja consentimiento de datos
  - `handleProcess(input, isStart)` - Procesa según opción elegida

### Estados del Flujo

```javascript
{
  selectedOption: 1,          // Opción seleccionada (1-4)
  consentGiven: true,         // Estado del consentimiento
  originalQuery: null         // Consulta original del usuario
}
```

## 📊 Comportamiento según Opción

| Opción | Descripción | Acción |
|--------|-------------|--------|
| 1 | Elegimos Juntos 2026-2029 | Procesar con RAG + IA |
| 2 | Servicio de crédito | Redirigir a asesor |
| 3 | Cuentas de ahorro | Redirigir a asesor |
| 4 | Otras consultas | Redirigir a asesor |

## 🔍 Validaciones

### Selección de Menú

El sistema acepta:
- Números: `1`, `2`, `3`, `4`
- Números en texto: `uno`, `dos`, `tres`, `cuatro`
- Palabras clave: `elegimos`, `crédito`, `ahorro`, `otras`

### Respuesta de Consentimiento

El sistema acepta:
- `Si`, `sí`, `1`, `acept`, `acepto`, `aceptar`
- `No`, `2`, `rechaz`, `rechazo`, `rechazar`

## 🚀 Uso del Sistema

### Inicio Automático

El flujo se inicia automáticamente cuando:
1. Un usuario envía su primer mensaje
2. La variable `USE_NEW_MENU_FLOW=true`
3. No hay un flujo activo previo

### Continuación del Flujo

El flujo continúa procesando mensajes hasta:
1. El usuario completa todos los pasos
2. El usuario rechaza el consentimiento
3. El sistema detecta un error y finaliza el flujo

## 🛡️ Seguridad

### Consentimiento de Datos

- **Requerido:** El usuario debe aceptar para continuar
- **Persistente:** Se guarda en el estado de la conversación
- **Respetado:** Si rechaza, no se procesan más mensajes

### Protección de Datos

El flujo cumple con las políticas de:
- 🔒 [Política de Protección de Datos Personales](https://norboy.coop/proteccion-de-datos-personales/)
- 💬 [Uso de WhatsApp](https://www.whatsapp.com/legal)

## 📝 Reglas de Negocio

### Reglas Obligatorias

1. **Siempre enviar saludo y menú primero** - No responder preguntas antes
2. **Siempre enviar consentimiento después del menú** - Sin excepciones
3. **No procesar si el usuario rechaza** - Finalizar conversación
4. **Solo la opción 1 se procesa automáticamente** - Las otras redirigen a asesor
5. **No modificar los textos definidos** - Mensajes exactos según especificación

### Flujo de Decisión

```
Usuario envía mensaje
       ↓
¿Es primer mensaje?
       Sí → Enviar Saludo + Menú
       ↓
Usuario selecciona opción
       ↓
Enviar Consentimiento
       ↓
¿Usuario acepta?
       Sí → Procesar según opción
              ↓
         ¿Opción 1?
              Sí → Usar RAG + IA
              No → Redirigir a asesor
       No → Finalizar conversación
```

## 🐛 Solución de Problemas

### El flujo no se inicia

1. Verifica que `USE_NEW_MENU_FLOW=true` en `.env`
2. Reinicia el servidor
3. Revisa los logs en `logs/`

### El flujo se repite infinitamente

1. Verifica que `conversation.welcomeSent` se está actualizando
2. Revisa los logs para ver si hay errores en el flujo
3. Deshabilita temporalmente: `USE_NEW_MENU_FLOW=false`

### Las opciones no se reconocen

1. Verifica que el input del usuario está normalizado
2. Revisa los patrones de coincidencia en `norboy-menu.flow.js`
3. Añade más variaciones si es necesario

## 📞 Soporte

Si encuentras algún problema con el nuevo flujo de menú:

1. Revisa los logs en `logs/`
2. Verifica la configuración en `.env`
3. Contacta al equipo de desarrollo

---

**Versión:** 1.0.0
**Fecha:** Febrero 2026
**Autor:** NORBOY Development Team
