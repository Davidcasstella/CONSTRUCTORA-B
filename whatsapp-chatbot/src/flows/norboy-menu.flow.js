/**
 * ===========================================
 * FLUJO DE MENÚ PRINCIPAL NORBOY
 * ===========================================
 *
 * Responsabilidades:
 * - Mostrar menú con 4 opciones en el primer mensaje
 * - Solicitar consentimiento de datos después del menú
 * - Manejar respuesta de consentimiento
 * - Procesar consulta según opción elegida (solo opción 1)
 * - Redirigir a asesor humano (opciones 2, 3, 4)
 *
 * Flujo:
 * 1. Primer mensaje → Saludo + Menú de 4 opciones
 * 2. Segundo mensaje → Consentimiento de datos
 * 3. Si acepta (Si):
 *    - Opción 1: Procesar consulta con RAG
 *    - Opciones 2,3,4: Redirigir a asesor
 * 4. Si rechaza (No): Finalizar conversación
 */

const BaseFlow = require('./base.flow');
const logger = require('../utils/logger');
const chatService = require('../services/chat.service');

class NorboyMenuFlow extends BaseFlow {
  constructor(context = {}) {
    super(context);

    // Pasos del flujo
    this.steps = ['welcome', 'consent', 'process'];

    // Datos recolectados
    this.data = {
      selectedOption: null,
      consentGiven: null,
      originalQuery: null
    };

    // Estado interno
    this.waitingForMenuSelection = false;
    this.waitingForConsent = false;
  }

  // ===========================================
  // PASO 1: BIENVENIDA + MENÚ
  // ===========================================

  /**
   * Maneja el paso de bienvenida (primer mensaje)
   * @param {string} input - Input del usuario
   * @param {boolean} isStart - Si es el inicio del flujo
   * @returns {Object} Respuesta del flujo
   */
  async handleWelcome(input, isStart = false) {
    // Si es el inicio, enviar saludo + menú
    if (isStart || !this.welcomeSent) {
      this.welcomeSent = true;
      this.waitingForMenuSelection = true;

      logger.info(`📋 Iniciando flujo NORBOY para ${this.context.userId}`);

      // Mensaje 1: Saludo
      const userName = this.context.userName || null;
      const message1 = userName
        ? `Hola, ${userName}, soy AntonIA Santos, su asesor en línea`
        : `Hola, soy AntonIA Santos, su asesor en línea`;

      // Mensaje 2: Menú de opciones enumerados con negrilla
      const message2 = `Escribe el número de la opción 👇

*1.* Servicio de crédito

*2.* Cuentas de ahorro

*3.* Otras consultas`;

      return {
        message: message1,
        followUpMessage: message2,
        step: 'welcome',
        waitingForInput: true,
        inputType: 'menu_selection'
      };
    }

    // Si el usuario responde al menú, validar la opción
    const normalizedInput = input?.toLowerCase().trim();

    // Opciones válidas: 1, 2 o texto que coincida
    // Internally maps: display 1 → selectedOption 2, display 2 → selectedOption 4
    let selectedOption = null;

    // Verificar respuesta numérica
    if (normalizedInput === '1' || normalizedInput === 'uno') {
      selectedOption = 2; // Servicio de crédito
    } else if (normalizedInput === '2' || normalizedInput === 'dos') {
      selectedOption = 3; // Cuentas de ahorro
    } else if (normalizedInput === '3' || normalizedInput === 'tres') {
      selectedOption = 4; // Otras consultas
    }
    // Verificar respuesta textual
    else if (normalizedInput.includes('crédito') || normalizedInput.includes('credito')) {
      selectedOption = 2;
    } else if (normalizedInput.includes('ahorro') || normalizedInput.includes('cuenta')) {
      selectedOption = 3;
    } else if (normalizedInput.includes('otras') || normalizedInput.includes('consulta')) {
      selectedOption = 4;
    }

    if (selectedOption === null) {
      // ✅ MEJORADO: Toda entrada de texto libre se trata como pregunta
      // No importa la longitud, si no es un número válido, se trata como pregunta libre
      const isFreeQuestion = input && input.trim().length > 1;

      if (isFreeQuestion) {
        // Tratar como consulta libre → retornar flag especial para que message-processor
        // envíe consentimiento informativo + respuesta IA inmediata
        logger.info(`💬 Pregunta libre detectada: "${input}". Enviando datos personales + respuesta inmediata.`);
        this.data.selectedOption = 1; // Tratar como opción IA/RAG
        this.data.originalQuery = input; // Guardar pregunta original para responder después
        this.data.isFreeQuestion = true;
        this.waitingForMenuSelection = false;

        // ✅ NUEVO: Retornar resultado especial para que message-processor maneje todo
        return {
          message: null,
          step: 'welcome',
          freeQuestionDetected: true,
          originalQuery: input,
          selectedOption: 1
        };
      }

      // Input muy corto (1 carácter) y no es número válido → reenviar menú sin mensaje de error
      logger.info(`🔄 Input no reconocido: "${input}". Reenviando menú.`);

      return {
        message: `Escribe el número de la opción 👇

*1.* Servicio de crédito

*2.* Cuentas de ahorro

*3.* Otras consultas`,
        step: 'welcome',
        waitingForInput: true,
        inputType: 'menu_selection'
      };
    }

    // Opción válida seleccionada
    this.data.selectedOption = selectedOption;
    this.waitingForMenuSelection = false;

    logger.info(`✅ Usuario ${this.context.userId} seleccionó opción ${selectedOption}`);

    // ✅ Skip consent step — send data policy as informational and go directly to process
    this.data.consentGiven = true;
    this.waitingForConsent = false;
    this.currentStepIndex = 2; // Jump directly to 'process' step

    // Execute process step directly
    return await this.handleProcess(null, true);
  }

  // ===========================================
  // PASO 2: CONSENTIMIENTO
  // ===========================================

  /**
   * Maneja el paso de consentimiento
   * @param {string} input - Input del usuario
   * @param {boolean} isStart - Si es el inicio del paso
   * @returns {Object} Respuesta del flujo
   */
  async handleConsent(input, isStart = false) {
    // ✅ Consent is now informational only — no Si/No question
    // Send data policy message and proceed directly to process step
    if (isStart) {
      const consentMessage = `👋 ¡Gracias por escribirnos!

📄 Consulte nuestras políticas de manejo de datos:
🔒 Política de Protección de Datos Personales:
https://norboy.coop/proteccion-de-datos-personales/

💬 Uso de WhatsApp:
https://www.whatsapp.com/legal
Gracias por contactarnos.`;

      // Auto-accept and move to process
      this.data.consentGiven = true;
      this.waitingForConsent = false;
      this.currentStepIndex = 2;

      return {
        message: consentMessage,
        step: 'consent',
        waitingForInput: false // Don't wait — proceed immediately
      };
    }

    // If somehow called with input, treat as acceptance and proceed
    this.data.consentGiven = true;
    this.waitingForConsent = false;
    this.currentStepIndex = 2;
    return await this.handleProcess(null, true);
  }

  // ===========================================
  // PASO 3: PROCESAR SEGÚN OPCIÓN
  // ===========================================

  /**
   * Maneja el paso de procesamiento según opción elegida
   * @param {string} input - Input del usuario
   * @param {boolean} isStart - Si es el inicio del paso
   * @returns {Object} Respuesta del flujo
   */
  async handleProcess(input, isStart = false) {
    if (isStart) {
      logger.info(`⏳ Procesando consulta para ${this.context.userId}, opción ${this.data.selectedOption}`);

      // Message 1: Data policy (informational)
      const dataPolicyMessage = `👋 ¡Gracias por escribirnos!\n\n📄 Consulte nuestras políticas de manejo de datos:\n🔒 Política de Protección de Datos Personales:\nhttps://norboy.coop/proteccion-de-datos-personales/\n\n💬 Uso de WhatsApp:\nhttps://www.whatsapp.com/legal\nGracias por contactarnos.`;

      // Message 2: Ask what they need help with
      const followUpMessage = `¿Qué duda tiene sumercé?`;

      return {
        message: dataPolicyMessage,
        followUpMessage: followUpMessage,
        step: 'process',
        isFinalStep: true,
        actionRequired: true,
        selectedOption: this.data.selectedOption
      };
    }

    // Si llegamos aquí, el flujo está completo
    return this.complete();
  }

  // ===========================================
  // MÉTODOS AUXILIARES
  // ===========================================

  /**
   * Obtiene el mensaje a mostrar según la opción elegida
   * @returns {string} Mensaje correspondiente
   */
  getResponseForOption() {
    // All options now go through AI first
    return null;
  }

  /**
   * Verifica si la respuesta requiere intervención humana
   * @returns {boolean}
   */
  requiresHumanAdvisor() {
    // All options now go through AI first; escalation happens automatically if AI can't answer
    return false;
  }

  /**
   * Verifica si el usuario debe responder el menú
   * @returns {boolean}
   */
  isWaitingForMenuSelection() {
    return this.waitingForMenuSelection;
  }

  /**
   * Verifica si el usuario debe responder consentimiento
   * @returns {boolean}
   */
  isWaitingForConsent() {
    return this.waitingForConsent;
  }

  /**
   * Obtiene la opción seleccionada
   * @returns {number|null}
   */
  getSelectedOption() {
    return this.data.selectedOption;
  }

  /**
   * Obtiene el estado de consentimiento
   * @returns {boolean|null}
   */
  getConsentStatus() {
    return this.data.consentGiven;
  }
}

module.exports = NorboyMenuFlow;
