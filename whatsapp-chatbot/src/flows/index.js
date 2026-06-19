/**
 * ===========================================
 * GESTOR DE FLUJOS DE CONVERSACIÓN
 * ===========================================
 *
 * Responsabilidades:
 * - Registrar flujos disponibles
 * - Activar/desactivar flujos por conversación
 * - Dirigir mensajes al flujo activo
 * - Manejar transiciones entre flujos
 *
 * CONCEPTO:
 * Un "flujo" es una secuencia de pasos en una conversación,
 * como un formulario multi-paso o un proceso de compra.
 * Implementa el patrón State Machine.
 *
 * USO:
 * const flowManager = require('./flows');
 * await flowManager.startFlow(userId, 'registration');
 * const response = await flowManager.handleInput(userId, input);
 */

const logger = require('../utils/logger');
const BaseFlow = require('./base.flow');
// const conversationRepository = require('../repositories/conversation.repository');

// ===========================================
// REGISTRO DE FLUJOS
// ===========================================

const flowRegistry = new Map();

/**
 * Registra un nuevo flujo
 * @param {string} name - Nombre único del flujo
 * @param {BaseFlow} FlowClass - Clase del flujo
 */
const registerFlow = (name, FlowClass) => {
  if (!(FlowClass.prototype instanceof BaseFlow)) {
    throw new Error('FlowClass debe extender BaseFlow');
  }

  flowRegistry.set(name, FlowClass);
  logger.debug(`Flujo registrado: ${name}`);
};

/**
 * Obtiene una instancia de flujo
 * @param {string} name - Nombre del flujo
 * @param {Object} context - Contexto inicial
 * @returns {BaseFlow|null}
 */
const getFlow = (name, context = {}) => {
  const FlowClass = flowRegistry.get(name);

  if (!FlowClass) {
    logger.warn(`Flujo no encontrado: ${name}`);
    return null;
  }

  return new FlowClass(context);
};

/**
 * Lista todos los flujos registrados
 * @returns {Array<string>}
 */
const listFlows = () => {
  return Array.from(flowRegistry.keys());
};

// ===========================================
// GESTIÓN DE FLUJOS ACTIVOS
// ===========================================

// Cache en memoria de flujos activos (mover a Redis en producción)
const activeFlows = new Map();

/**
 * Inicia un flujo para un usuario
 * @param {string} userId - ID del usuario
 * @param {string} flowName - Nombre del flujo
 * @param {Object} initialData - Datos iniciales
 * @returns {Promise<Object>} Primer mensaje del flujo
 */
const startFlow = async (userId, flowName, initialData = {}) => {
  const flow = getFlow(flowName, { userId, ...initialData });

  if (!flow) {
    throw new Error(`Flujo no encontrado: ${flowName}`);
  }

  // Guardar flujo activo
  activeFlows.set(userId, {
    name: flowName,
    instance: flow,
    startedAt: new Date()
  });

  // TODO: Persistir en conversación
  // await conversationRepository.update(userId, {
  //   activeFlow: flowName,
  //   flowState: flow.getState()
  // });

  logger.info(`Flujo iniciado: ${flowName} para ${userId}`);

  // Obtener mensaje inicial del flujo
  return await flow.start();
};

/**
 * Procesa input del usuario en el flujo activo
 * @param {string} userId - ID del usuario
 * @param {string} input - Input del usuario
 * @returns {Promise<Object|null>} Respuesta del flujo o null si no hay flujo
 */
const handleInput = async (userId, input) => {
  const activeFlow = activeFlows.get(userId);

  if (!activeFlow) {
    return null;
  }

  const { instance: flow, name: flowName } = activeFlow;

  try {
    const result = await flow.handleInput(input);

    // Si el flujo terminó
    if (flow.isCompleted()) {
      await endFlow(userId);
      logger.info(`Flujo completado: ${flowName} para ${userId}`);
    }

    // TODO: Actualizar estado en DB
    // await conversationRepository.update(userId, {
    //   flowState: flow.getState()
    // });

    return result;

  } catch (error) {
    logger.error(`Error en flujo ${flowName}:`, error);
    await endFlow(userId);
    throw error;
  }
};

/**
 * Termina el flujo activo de un usuario
 * @param {string} userId - ID del usuario
 */
const endFlow = async (userId) => {
  activeFlows.delete(userId);

  // TODO: Limpiar en DB
  // await conversationRepository.update(userId, {
  //   activeFlow: null,
  //   flowState: {}
  // });

  logger.debug(`Flujo terminado para ${userId}`);
};

/**
 * Verifica si el usuario tiene un flujo activo
 * @param {string} userId - ID del usuario
 * @returns {boolean}
 */
const hasActiveFlow = (userId) => {
  return activeFlows.has(userId);
};

/**
 * Obtiene información del flujo activo
 * @param {string} userId - ID del usuario
 * @returns {Object|null}
 */
const getActiveFlowInfo = (userId) => {
  const flow = activeFlows.get(userId);
  if (!flow) return null;

  return {
    name: flow.name,
    step: flow.instance.currentStep,
    startedAt: flow.startedAt
  };
};

// ===========================================
// REGISTRAR FLUJOS PREDEFINIDOS
// ===========================================

// ✅ NUEVO: Flujo de menú principal NORBOY
const NorboyMenuFlow = require('./norboy-menu.flow');
registerFlow('norboy-menu', NorboyMenuFlow);

// TODO: Importar y registrar flujos adicionales cuando se implementen
// const RegistrationFlow = require('./registration.flow');
// registerFlow('registration', RegistrationFlow);

module.exports = {
  registerFlow,
  getFlow,
  listFlows,
  startFlow,
  handleInput,
  endFlow,
  hasActiveFlow,
  getActiveFlowInfo
};
