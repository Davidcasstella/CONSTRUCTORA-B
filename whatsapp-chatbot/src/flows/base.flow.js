/**
 * ===========================================
 * CLASE BASE PARA FLUJOS
 * ===========================================
 *
 * Responsabilidades:
 * - Definir estructura común de un flujo
 * - Manejar pasos y transiciones
 * - Validar inputs
 * - Almacenar datos recolectados
 *
 * PATRÓN: Template Method + State Machine
 *
 * EJEMPLO DE USO:
 *
 * class RegistrationFlow extends BaseFlow {
 *   constructor(context) {
 *     super(context);
 *     this.steps = ['name', 'email', 'confirm'];
 *   }
 *
 *   async handleName(input) {
 *     this.data.name = input;
 *     return this.nextStep('Por favor, ingresa tu email:');
 *   }
 * }
 */

const logger = require('../utils/logger');

class BaseFlow {
  constructor(context = {}) {
    // Contexto (userId, datos iniciales, etc.)
    this.context = context;

    // Pasos del flujo (definir en subclases)
    this.steps = [];

    // Paso actual (índice)
    this.currentStepIndex = 0;

    // Datos recolectados durante el flujo
    this.data = {};

    // Estado del flujo
    this.status = 'pending'; // pending, active, completed, cancelled

    // Metadata
    this.startedAt = null;
    this.completedAt = null;
  }

  // ===========================================
  // CICLO DE VIDA DEL FLUJO
  // ===========================================

  /**
   * Inicia el flujo
   * @returns {Promise<Object>} Mensaje inicial
   */
  async start() {
    this.status = 'active';
    this.startedAt = new Date();

    logger.debug(`Flujo iniciado: ${this.constructor.name}`);

    // Llamar al método del primer paso
    return await this.executeCurrentStep(null, true);
  }

  /**
   * Procesa input del usuario
   * @param {string} input - Input del usuario
   * @returns {Promise<Object>} Respuesta del flujo
   */
  async handleInput(input) {
    if (this.status !== 'active') {
      throw new Error('Flujo no está activo');
    }

    return await this.executeCurrentStep(input, false);
  }

  /**
   * Ejecuta el paso actual
   * @param {string|null} input - Input del usuario (null si es inicio de paso)
   * @param {boolean} isStart - Si es el inicio del paso
   */
  async executeCurrentStep(input, isStart = false) {
    const stepName = this.currentStep;

    if (!stepName) {
      return this.complete();
    }

    // Nombre del método: handle{StepName}
    const methodName = `handle${this._capitalize(stepName)}`;

    if (typeof this[methodName] !== 'function') {
      throw new Error(`Método no implementado: ${methodName}`);
    }

    // Llamar al método del paso
    const result = await this[methodName](input, isStart);

    return result;
  }

  // ===========================================
  // NAVEGACIÓN
  // ===========================================

  /**
   * Avanza al siguiente paso
   * @param {string} message - Mensaje a mostrar
   * @param {Object} options - Opciones adicionales
   * @returns {Object}
   */
  nextStep(message, options = {}) {
    this.currentStepIndex++;

    return {
      message,
      step: this.currentStep,
      totalSteps: this.steps.length,
      currentStep: this.currentStepIndex,
      ...options
    };
  }

  /**
   * Retrocede al paso anterior
   * @param {string} message - Mensaje a mostrar
   * @returns {Object}
   */
  previousStep(message) {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
    }

    return {
      message,
      step: this.currentStep,
      totalSteps: this.steps.length,
      currentStep: this.currentStepIndex
    };
  }

  /**
   * Salta a un paso específico
   * @param {string} stepName - Nombre del paso
   * @param {string} message - Mensaje a mostrar
   * @returns {Object}
   */
  goToStep(stepName, message) {
    const index = this.steps.indexOf(stepName);

    if (index === -1) {
      throw new Error(`Paso no encontrado: ${stepName}`);
    }

    this.currentStepIndex = index;

    return {
      message,
      step: this.currentStep,
      totalSteps: this.steps.length,
      currentStep: this.currentStepIndex
    };
  }

  /**
   * Repite el paso actual (por error de validación)
   * @param {string} errorMessage - Mensaje de error
   * @returns {Object}
   */
  repeatStep(errorMessage) {
    return {
      message: errorMessage,
      step: this.currentStep,
      isError: true
    };
  }

  // ===========================================
  // FINALIZACIÓN
  // ===========================================

  /**
   * Completa el flujo exitosamente
   * @param {string} message - Mensaje final
   * @returns {Object}
   */
  complete(message = 'Proceso completado.') {
    this.status = 'completed';
    this.completedAt = new Date();

    logger.debug(`Flujo completado: ${this.constructor.name}`, {
      data: this.data
    });

    return {
      message,
      isCompleted: true,
      data: this.data
    };
  }

  /**
   * Cancela el flujo
   * @param {string} message - Mensaje de cancelación
   * @returns {Object}
   */
  cancel(message = 'Proceso cancelado.') {
    this.status = 'cancelled';
    this.completedAt = new Date();

    logger.debug(`Flujo cancelado: ${this.constructor.name}`);

    return {
      message,
      isCancelled: true
    };
  }

  // ===========================================
  // GETTERS
  // ===========================================

  /**
   * Obtiene el nombre del paso actual
   */
  get currentStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  /**
   * Verifica si el flujo está completado
   */
  isCompleted() {
    return this.status === 'completed' || this.status === 'cancelled';
  }

  /**
   * Obtiene el estado actual del flujo
   */
  getState() {
    return {
      currentStepIndex: this.currentStepIndex,
      currentStep: this.currentStep,
      data: this.data,
      status: this.status
    };
  }

  /**
   * Restaura el estado del flujo
   */
  restoreState(state) {
    this.currentStepIndex = state.currentStepIndex || 0;
    this.data = state.data || {};
    this.status = state.status || 'active';
  }

  // ===========================================
  // UTILIDADES
  // ===========================================

  /**
   * Capitaliza la primera letra
   */
  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Valida que el input no esté vacío
   */
  validateNotEmpty(input, errorMessage = 'Este campo es requerido.') {
    if (!input || input.trim() === '') {
      return { isValid: false, error: errorMessage };
    }
    return { isValid: true };
  }

  /**
   * Verifica si el input es un comando de cancelación
   */
  isCancelCommand(input) {
    const cancelCommands = ['/cancelar', '/cancel', 'cancelar', 'salir', 'exit'];
    return cancelCommands.includes(input?.toLowerCase?.());
  }
}

module.exports = BaseFlow;
