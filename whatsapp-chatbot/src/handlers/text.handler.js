/**
 * ===========================================
 * HANDLER DE MENSAJES DE TEXTO - NORBOY
 * ===========================================
 *
 * Procesa mensajes de texto entrantes para el chatbot
 * del proceso "Elegimos Juntos 2026-2029" de NORBOY.
 */

const logger = require('../utils/logger');
const chatService = require('../services/chat.service');
const conversationStateService = require('../services/conversation-state.service');
const messageProcessor = require('../services/message-processor.service');

// ✅ Verificar si el nuevo flujo de menú está habilitado
const USE_NEW_MENU_FLOW = process.env.USE_NEW_MENU_FLOW === 'true';

class TextHandler {
  constructor() {
    this.name = 'TextHandler';

    // Comandos especiales que no van a la IA
    // ✅ Cuando USE_NEW_MENU_FLOW está activo, 'hola' y '/hola' NO se interceptan
    // para que pasen por messageProcessor y activen el flujo de menú correctamente
    this.commands = {
      '/start': this.handleStart.bind(this),
      '/help': this.handleHelp.bind(this),
      '/ayuda': this.handleHelp.bind(this),
      'ayuda': this.handleHelp.bind(this),
      '/menu': this.handleMenu.bind(this),
      'menu': this.handleMenu.bind(this),
      '/categorias': this.handleCategories.bind(this),
      '/delegados': this.handleDelegados.bind(this),
      '/asamblea': this.handleAsamblea.bind(this),
      '/organos': this.handleOrganos.bind(this)
    };

    // Solo interceptar 'hola' como comando cuando NO se usa el nuevo flujo
    if (!USE_NEW_MENU_FLOW) {
      this.commands['/hola'] = this.handleStart.bind(this);
      this.commands['hola'] = this.handleStart.bind(this);
    }
  }

  /**
   * Procesa un mensaje de texto
   *
   * IMPORTANTE: Ahora usa messageProcessor que implementa todos los puntos de control:
   * - Punto 1: Verifica bot_active
   * - Punto 2: Desactivación por asesor
   * - Punto 3: Fallback obligatorio
   * - Punto 4: Control de horario (4:30 PM)
   * - Punto 5: Flujo general
   */
  async process(message) {
    try {
      const text = message.content?.text || '';
      const userId = message.from;

      // ✅ CORRECCIÓN: Obtener número real del contacto y nombre de WhatsApp
      const realPhoneNumber = message.realPhoneNumber || message.from;
      const pushName = message.pushName || null;

      logger.debug(`Procesando texto de ${userId}: ${text.substring(0, 50)}...`);

      // 1. Verificar si es un comando especial (estos sí se procesan directamente)
      const command = this._detectCommand(text);
      if (command) {
        return await command(message);
      }

      // 2. Detectar saludos simples
      // ✅ Cuando USE_NEW_MENU_FLOW está activo, los saludos pasan al messageProcessor
      // para que activen el flujo de menú (no se interceptan aquí)
      if (!USE_NEW_MENU_FLOW && this._isGreeting(text)) {
        return await this.handleStart(message);
      }

      // 3. Para cualquier otro mensaje, usar messageProcessor con todos los puntos de control
      // Esto implementa: bot_active check, horario 4:30 PM, fallback, etc.
      // ✅ CORRECCIÓN: Pasar número real y nombre de WhatsApp
      const response = await messageProcessor.processIncomingMessage(userId, text, {
        pushName: pushName,
        realPhoneNumber: realPhoneNumber
      });

      return response;

    } catch (error) {
      logger.error('Error en TextHandler:', error);
      return `Disculpa, tuve un problema procesando tu mensaje.

Puedes intentar de nuevo o escribir "menu" para ver las opciones disponibles.`;
    }
  }

  /**
   * Detecta si el texto es un comando
   */
  _detectCommand(text) {
    const normalizedText = text.trim().toLowerCase();

    for (const [cmd, handler] of Object.entries(this.commands)) {
      if (normalizedText === cmd || normalizedText.startsWith(cmd + ' ')) {
        return handler;
      }
    }

    return null;
  }

  /**
   * Detecta si es un saludo
   */
  _isGreeting(text) {
    const greetings = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches',
      'hey', 'hi', 'hello', 'saludos', 'que tal'];
    const normalized = text.toLowerCase().trim();
    return greetings.some(g => normalized === g || normalized.startsWith(g + ' '));
  }

  /**
   * Comando: /start o Hola
   */
  async handleStart(message) {
    const userId = message.from;

    // ✅ Si el nuevo flujo de menú está activo, delegar al messageProcessor
    // para que active el flujo de bienvenida + menú + consentimiento
    if (USE_NEW_MENU_FLOW) {
      logger.info(`🔄 handleStart: Delegando a messageProcessor (USE_NEW_MENU_FLOW=true)`);
      const pushName = message.pushName || null;
      const realPhoneNumber = message.realPhoneNumber || message.from;
      return await messageProcessor.processIncomingMessage(userId, message.content?.text || 'hola', {
        pushName,
        realPhoneNumber
      });
    }

    // Flujo antiguo: marcar bienvenida y responder directamente
    if (userId) {
      conversationStateService.markWelcomeSent(userId);
    }

    return `Hola! 👋 Bienvenido al asistente virtual de NORBOY.

Soy tu guía para el proceso *"Elegimos Juntos 2026-2029"*. Estoy aquí para resolver tus dudas sobre:

📋 Elección de delegados
🏛️ Asamblea General
⚖️ Órganos de administración y control
🗳️ Tu participación como asociado

Puedes preguntarme lo que necesites o escribir *menu* para ver las opciones.

En qué puedo ayudarte hoy?`;
  }

  /**
   * Comando: /help o /ayuda
   */
  async handleHelp(message) {
    return `*Cómo puedo ayudarte:*

📝 *Escríbeme tu pregunta* directamente y te responderé con información oficial de NORBOY.

*Comandos rápidos:*
• menu - Ver opciones principales
• delegados - Info sobre delegados
• asamblea - Info sobre Asamblea General
• organos - Órganos de administración

*Ejemplos de preguntas:*
• "Qué es un delegado?"
• "Quiénes participan en la elección?"
• "Qué hace el Consejo de Administración?"

También puedes enviarme notas de voz y las procesaré. 🎤`;
  }

  /**
   * Comando: /menu
   */
  async handleMenu(message) {
    return `*Menu Principal - Elegimos Juntos 2026-2029* 📋

Escribe el tema que te interesa:

1️⃣ *delegados* - Qué son y cómo se eligen
2️⃣ *asamblea* - Sobre la Asamblea General
3️⃣ *organos* - Consejo, Junta de Vigilancia, etc.
4️⃣ *proceso* - Fechas y etapas
5️⃣ *participar* - Cómo participar

O simplemente escríbeme tu pregunta y te ayudo!`;
  }

  /**
   * Comando: /categorias
   */
  async handleCategories(message) {
    const categories = chatService.getAvailableCategories();

    if (categories.length === 0) {
      return 'No hay categorías disponibles en este momento.';
    }

    return `*Temas disponibles:*

${categories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Escribe el nombre del tema o hazme una pregunta directa.`;
  }

  /**
   * Comando: /delegados
   */
  async handleDelegados(message) {
    return `*Sobre los Delegados* 🗳️

Los delegados son asociados elegidos para representar a otros asociados en la Asamblea General.

*Lo más importante:*
• Participan en la Asamblea y toman decisiones
• Son elegidos de manera democrática
• Su número depende del total de asociados
• Deben tener criterio, compromiso y responsabilidad

*Preguntas comunes:*
• "Qué hace un delegado?"
• "Cómo se eligen los delegados?"
• "Por qué es importante elegir bien?"

Qué más te gustaría saber sobre los delegados?`;
  }

  /**
   * Comando: /asamblea
   */
  async handleAsamblea(message) {
    return `*Sobre la Asamblea General* 🏛️

La Asamblea General es la máxima autoridad de NORBOY. Aquí se toman las decisiones más importantes para la cooperativa.

*Puntos clave:*
• Es el órgano de mayor jerarquía
• Participan los delegados elegidos
• Se analizan resultados e informes
• Sus decisiones son obligatorias (conforme a ley y Estatuto)

*Preguntas comunes:*
• "Qué se decide en la Asamblea?"
• "Quiénes participan?"
• "Qué informes se presentan?"

Tienes alguna pregunta específica sobre la Asamblea?`;
  }

  /**
   * Comando: /organos
   */
  async handleOrganos(message) {
    return `*Órganos de Administración y Control* ⚖️

NORBOY cuenta con los siguientes órganos:

📌 *Consejo de Administración*
Conoce y resuelve recursos y reclamaciones de asociados.

📌 *Junta de Vigilancia*
Ejerce control social y vela por el cumplimiento del Estatuto.

📌 *Revisor Fiscal*
Realiza control fiscal y emite opinión sobre gestión financiera.

📌 *Comité de Apelaciones*
Ejerce dirección estratégica y orientación general.

Sobre cuál órgano te gustaría saber más?`;
  }
}

module.exports = TextHandler;
