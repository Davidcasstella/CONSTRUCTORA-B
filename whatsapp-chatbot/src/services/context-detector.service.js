/**
 * ===========================================
 * DETECTOR DE CONTEXTO NORBOY
 * ===========================================
 *
 * Detecta si una pregunta está relacionada con NORBOY
 * y el proceso electoral, ANTES de buscar en RAG.
 *
 * REGLA PRINCIPAL:
 * - Si NO es sobre NORBOY → Mensaje restrictivo (no buscar en RAG)
 * - Si ES sobre NORBOY pero no hay info → ESCALAR (no inventar)
 */

const logger = require('../utils/logger');

// ===========================================
// KEYWORDS DE CONSTRUCTORA BELLAVISTA (apartamentos, ventas, construcción)
// ===========================================

const NORBOY_KEYWORDS = [
  // Proyecto y apartamentos
  'apartamento', 'apartamentos', 'apto', 'aptos', 'vivienda', 'viviendas',
  'proyecto', 'proyectos', 'bellavista', 'urbanizacion', 'conjunto',
  'constructora', 'construccion', 'obra', 'torre', 'torres',
  'inmueble', 'propiedad', 'inmobiliaria',

  // Precios y pagos
  'precio', 'precios', 'costo', 'costos', 'valor', 'cuanto', 'cuanta',
  'cuota', 'cuotas', 'inicial', 'pago', 'pagos', 'mensual', 'mensualidad',
  'separar', 'separacion', 'apartar', 'reserva', 'financiacion',
  'credito', 'hipotecario', 'hipoteca', 'prestamo', 'banco', 'bancos',

  // Subsidios
  'subsidio', 'subsidios', 'ecovivienda', 'caja', 'compensacion',
  'concurrente', 'fondo', 'ahorro', 'sisben', 'beneficio',

  // Características del apartamento
  'habitacion', 'habitaciones', 'cuarto', 'cuartos', 'bano', 'banos',
  'sala', 'comedor', 'balcon', 'cocina', 'ropas', 'metros', 'area',
  'acabados', 'obra gris', 'distribucion', 'medidas', 'tamano',

  // Ubicación
  'ubicacion', 'donde', 'tunja', 'ciudad jardin', 'soraca', 'bogota',
  'sur', 'barrio', 'sector', 'via', 'sala de ventas', 'oficina',
  'pila del mono', 'plazoleta',

  // Visitas y citas
  'visita', 'visitar', 'visitas', 'cita', 'citas', 'agendar', 'agenda',
  'cuando', 'horario', 'horarios', 'hora', 'horas', 'dia', 'dias',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  'manana', 'tarde', 'ximena', 'angela', 'asesora', 'asesor',

  // Requisitos
  'requisito', 'requisitos', 'aplica', 'aplicar', 'calificar',
  'reporte', 'central', 'riesgo', 'preaprobado', 'historial',
  'ingresos', 'empleado', 'independiente', 'informal',

  // Entrega y fechas
  'entrega', 'fecha', 'cuando', 'diciembre', '2027', 'plazo',
  'disponible', 'disponibles', 'listo',

  // Proceso de compra e intención del usuario
  'comprar', 'compra', 'adquirir', 'interesado', 'interesada',
  'informacion', 'info', 'detalles', 'brochure', 'catalogo',
  'documentos', 'contrato', 'promesa',
  'quiero', 'queria', 'quisiera', 'gustaria', 'interesa', 'mas', 'saber',
  'conocer', 'entender', 'explicar', 'explicame', 'dime', 'cuentame', 'cuéntame',
  // Common abbreviations used in WhatsApp chats
  'inf', 'infо', 'xq', 'xfa', 'pls', 'porfa', 'porfavor',

  // Zonas comunes
  'parqueadero', 'parqueaderos', 'ascensor', 'zona', 'zonas', 'comunes',
  'piscina', 'gimnasio', 'seguridad', 'porteria',

  // Fiduciaria y seguridad
  'fiduciaria', 'aval', 'seguridad', 'garantia', 'fideicomiso',

  // Preguntas comunes
  'como', 'cual', 'cuales', 'quien', 'quienes', 'cuanto', 'cuantos',
  'puedo', 'puede', 'debo', 'debe', 'necesito', 'necesita',
  'hay', 'tiene', 'tienen', 'incluye', 'incluyen',
  'ayuda', 'contacto', 'telefono', 'whatsapp', 'correo', 'email',
];

// ===========================================
// KEYWORDS FUERA DE CONTEXTO (NO NORBOY)
// ===========================================

const OUT_OF_CONTEXT_KEYWORDS = [
  // Ciencia y naturaleza
  'agua', 'aire', 'fuego', 'tierra', 'sol', 'luna', 'estrella',
  'planta', 'animal', 'celula', 'atomo', 'molecula',
  'quimica', 'fisica', 'biologia', 'matematica',
  'energia', 'electricidad', 'gravedad',

  // Clima y geografía
  'clima', 'tiempo', 'lluvia', 'nieve', 'viento', 'temperatura',
  'pais', 'continente', 'oceano', 'rio', 'montana', 'desierto',
  'ciudad', 'capital',

  // Comida y cocina
  'comida', 'receta', 'cocina', 'ingrediente', 'cocinar',
  'desayuno', 'almuerzo', 'cena', 'postre',

  // Entretenimiento
  'musica', 'pelicula', 'serie', 'libro', 'autor',
  'juego', 'videojuego', 'deporte', 'futbol', 'equipo',
  'cancion', 'artista', 'actor', 'actriz',

  // Historia y cultura
  'historia', 'guerra', 'rey', 'reina', 'imperio',
  'religion', 'dios', 'iglesia', 'biblia',

  // Tecnología general
  'computadora', 'internet', 'programa', 'aplicacion', 'app',
  'celular', 'telefono', 'redes', 'facebook', 'instagram', 'tiktok',

  // Salud general
  'enfermedad', 'medicina', 'doctor', 'hospital', 'pastilla',
  'sintoma', 'tratamiento', 'dieta', 'ejercicio',

  // Finanzas completamente ajenas (crypto, bolsa) — NOTE: banco/credito se permiten
  // porque la constructora trabaja con bancos para hipotecas
  'bitcoin', 'cripto', 'criptomoneda', 'blockchain',
  'accion', 'bolsa', 'bursatil',

  // Educación general
  'escuela', 'universidad', 'colegio', 'examen', 'tarea',
  'profesor', 'estudiante', 'clase', 'curso',

  // Otros temas no relacionados
  'amor', 'novio', 'novia', 'matrimonio', 'boda',
  'trabajo', 'empleo', 'salario', 'jefe', 'empresa',
  'viaje', 'vacaciones', 'hotel', 'avion', 'carro',
  'moda', 'ropa', 'zapato', 'vestido',
  'mascotas', 'perro', 'gato', 'pajaro',
];

// ===========================================
// SALUDOS Y MENSAJES GENÉRICOS
// ===========================================

const GREETING_PATTERNS = [
  /^hola$/i, /^holi$/i, /^hey$/i, /^hi$/i, /^hello$/i,
  /^buenos?\s*(dias?|tardes?|noches?)$/i,
  /^buenas$/i, /^saludos?$/i, /^que\s*tal$/i,
  /^como\s*esta/i, /^como\s*va/i,
];

const GRATITUDE_PATTERNS = [
  /^gracias?$/i, /^muchas\s*gracias$/i, /^ok$/i, /^vale$/i,
  /^entendido$/i, /^listo$/i, /^perfecto$/i, /^genial$/i,
];

// ===========================================
// INTENCIÓN DE AGENDAMIENTO
// ===========================================
const APPOINTMENT_PATTERNS = [
  // Direct appointment requests
  /quiero (una |una )?cita/i,
  /necesito (una )?cita/i,
  /pedir (una )?cita/i,
  /sacar (una )?cita/i,
  /hacer (una )?cita/i,
  /solicitar (una )?cita/i,
  /me gustaria (una )?cita/i,

  // Scheduling actions
  /agendar/i,
  /agendarme/i,
  /programar (una )?cita/i,
  /programar (una )?reunion/i,
  /reservar (una )?cita/i,

  // Meeting / appointment words
  /\bcita\b/i,
  /\breunion\b/i,
  /\breuni.n\b/i,

  // Colloquial Colombian expressions
  /vernos/i,
  /nos podemos ver/i,
  /cuando podemos (hablar|vernos|reunirnos)/i,

  // Calendar-related
  /calendario/i,
  /disponibilidad/i,
  /horario disponible/i,
  /cuando hay espacio/i,
];

// ===========================================
// VER CITAS AGENDADAS
// ===========================================
const VIEW_APPOINTMENTS_PATTERNS = [
  /mis citas/i,
  /ver (mis )?citas/i,
  /que citas (tengo|hay)/i,
  /citas (que tengo|agendadas|programadas|pendientes)/i,
  /cuando (es|tengo|son) (mi|las|la) cita/i,
  /proximas? citas/i,
  /mostrar (mis )?citas/i,
  /hay (alguna )?cita/i,
  /listar citas/i,
  /consultar citas/i,
  /tengo (alguna )?cita/i,
  /recordatorio de cita/i,
];

// ===========================================
// CANCELAR CITA EXISTENTE
// ===========================================
const CANCEL_APPOINTMENT_PATTERNS = [
  /cancelar (la |mi |una )?cita/i,
  /cancela (la |mi |una )?cita/i,
  /eliminar (la |mi |una )?cita/i,
  /quiero cancelar/i,
  /necesito cancelar/i,
  /borrar (la |mi |una )?cita/i,
  /no (voy a poder|puedo) (ir|asistir|ir a la cita)/i,
  /quitar (la |mi )?cita/i,
  /anular (la |mi )?cita/i,
];

// ===========================================
// FUNCIONES DE DETECCIÓN
// ===========================================

/**
 * Normaliza texto para comparación
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[¿?¡!.,;:'"]/g, '')    // Quitar puntuación
    .trim();
}

/**
 * Verifica si es un saludo
 */
function isGreeting(query) {
  const normalized = normalizeText(query);
  return GREETING_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Verifica si es agradecimiento
 */
function isGratitude(query) {
  const normalized = normalizeText(query);
  return GRATITUDE_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Verifica si es intención de AGENDAR (nueva cita)
 * NOTE: must NOT match cancel/view intents
 */
function isAppointmentIntent(query) {
  const normalized = normalizeText(query);
  // If it's a cancel or view intent, don't treat as new appointment
  if (isCancelAppointmentIntent(query) || isViewAppointmentsIntent(query)) return false;
  return APPOINTMENT_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Verifica si el usuario quiere VER sus citas
 */
function isViewAppointmentsIntent(query) {
  const normalized = normalizeText(query);
  return VIEW_APPOINTMENTS_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Verifica si el usuario quiere CANCELAR una cita
 */
function isCancelAppointmentIntent(query) {
  const normalized = normalizeText(query);
  return CANCEL_APPOINTMENT_PATTERNS.some(pattern => pattern.test(normalized));
}

// Keywords too generic to override an out-of-context match on their own
// NOTE: 'informacion', 'info', 'quiero', 'necesito' removed — in a real-estate
// chatbot these ARE topic-specific (user asking for project info).
const GENERIC_KEYWORDS = new Set([
  'como', 'cuando', 'donde', 'quien', 'quienes', 'cual', 'cuales',
  'cuanto', 'cuantos', 'puedo', 'puede', 'debo', 'debe',
  'hay', 'tiene', 'tienen', 'incluye', 'incluyen', 'ayuda',
]);

/**
 * Verifica si contiene keywords de la constructora/proyecto
 * Returns { found, keyword, type, isGeneric }
 */
function hasNorboyKeywords(query) {
  const normalized = normalizeText(query);
  const words = normalized.split(/\s+/);

  let genericMatch = null;

  for (const keyword of NORBOY_KEYWORDS) {
    const isExact    = words.includes(keyword);
    const isPartial  = !isExact && normalized.includes(keyword);

    if (isExact || isPartial) {
      const isGeneric = GENERIC_KEYWORDS.has(keyword);
      // Return immediately if it's a specific (non-generic) keyword
      if (!isGeneric) {
        return { found: true, keyword, type: isExact ? 'exact' : 'partial', isGeneric: false };
      }
      // Remember the first generic match but keep looking for a specific one
      if (!genericMatch) {
        genericMatch = { found: true, keyword, type: isExact ? 'exact' : 'partial', isGeneric: true };
      }
    }
  }

  // Only return generic match if no specific keyword was found
  return genericMatch || { found: false };
}

/**
 * Verifica si contiene keywords fuera de contexto
 */
function hasOutOfContextKeywords(query) {
  const normalized = normalizeText(query);
  const words = normalized.split(/\s+/);

  for (const keyword of OUT_OF_CONTEXT_KEYWORDS) {
    if (words.includes(keyword) || normalized.includes(keyword)) {
      return { found: true, keyword };
    }
  }

  return { found: false };
}

/**
 * FUNCIÓN PRINCIPAL: Detecta si la query está relacionada con NORBOY
 *
 * @param {string} query - Pregunta del usuario
 * @returns {Object} Resultado de detección
 */
function detectContext(query) {
  if (!query || typeof query !== 'string') {
    return {
      isNorboyRelated: false,
      type: 'invalid',
      reason: 'Query vacía o inválida',
      shouldProcess: false,
      shouldEscalate: false
    };
  }

  const normalized = normalizeText(query);

  // Log de inicio
  logger.debug(`🔍 Detectando contexto: "${query.substring(0, 50)}..."`);

  // 1. Verificar si es saludo
  if (isGreeting(query)) {
    logger.debug('   ✅ Detectado: Saludo');
    return {
      isNorboyRelated: true, // Saludos siempre se procesan
      type: 'greeting',
      reason: 'Saludo detectado',
      shouldProcess: true,
      shouldEscalate: false
    };
  }

  // 2. Verificar si es agradecimiento
  if (isGratitude(query)) {
    logger.debug('   ✅ Detectado: Agradecimiento');
    return {
      isNorboyRelated: true,
      type: 'gratitude',
      reason: 'Agradecimiento detectado',
      shouldProcess: true,
      shouldEscalate: false
    };
  }

  // 2.5 Verificar si es intención de agendar cita
  if (isAppointmentIntent(query)) {
    logger.debug('   ✅ Detectado: Intención de agendar cita');
    return {
      isNorboyRelated: true, // Lo marcamos related para no descartarlo
      type: 'appointment_intent',
      reason: 'Intención de agendar cita detectada',
      shouldProcess: true,
      shouldEscalate: false
    };
  }

  // 3. Verificar keywords fuera de contexto PRIMERO
  const outOfContext = hasOutOfContextKeywords(query);
  if (outOfContext.found) {
    // PERO verificar si también tiene keywords específicos del proyecto
    const norboyCheck = hasNorboyKeywords(query);

    if (!norboyCheck.found || norboyCheck.isGeneric) {
      // Out-of-context wins: no specific project keyword found (or only generic ones)
      logger.info(`   ❌ Fuera de contexto: keyword "${outOfContext.keyword}"`);
      return {
        isNorboyRelated: false,
        type: 'out_of_scope',
        reason: `Pregunta no relacionada con el proyecto (keyword: ${outOfContext.keyword})`,
        detectedKeyword: outOfContext.keyword,
        shouldProcess: false,
        shouldEscalate: false
      };
    }
    // Specific project keyword wins over out-of-context
    logger.debug(`   ⚠️ Tiene keyword fuera de contexto pero también keyword específico del proyecto`);
  }

  // 4. Verificar keywords de NORBOY
  const norboyCheck = hasNorboyKeywords(query);
  if (norboyCheck.found) {
    logger.info(`   ✅ Relacionado con NORBOY: keyword "${norboyCheck.keyword}" (${norboyCheck.type})`);
    return {
      isNorboyRelated: true,
      type: 'norboy_related',
      reason: `Keyword NORBOY detectado: ${norboyCheck.keyword}`,
      detectedKeyword: norboyCheck.keyword,
      matchType: norboyCheck.type,
      shouldProcess: true,
      shouldEscalate: false
    };
  }

  // 5. Query muy corta sin keywords reconocibles
  if (normalized.length < 10 && normalized.split(/\s+/).length < 3) {
    logger.debug('   ⚠️ Query muy corta, asumir relacionada');
    return {
      isNorboyRelated: true, // Dar beneficio de la duda
      type: 'short_query',
      reason: 'Query corta, procesando por defecto',
      shouldProcess: true,
      shouldEscalate: false
    };
  }

  // 6. Query sin keywords claros - PERMITIR BÚSQUEDA RAG
  // ✅ MODIFICADO: En lugar de asumir 'fuera de contexto' y bloquear,
  // delegar al sistema RAG para que busque si hay información en los documentos.
  logger.info(`   ⚠️ Sin keywords reconocibles, enviando al RAG para búsqueda general`);
  return {
    isNorboyRelated: true, // Dar el beneficio de la duda para que el RAG decida
    type: 'general_query',
    reason: 'Consulta general, delegando al sistema RAG',
    shouldProcess: true,
    shouldEscalate: false
  };
}

// ===========================================
// MENSAJES PREDEFINIDOS
// ===========================================

const MESSAGES = {
  outOfScope: `Con gusto te ayudo! Solo puedo orientarte sobre la Urbanizacion Bellavista II: apartamentos, precios, subsidios, requisitos y visitas al proyecto.

Tiene alguna pregunta sobre nuestros apartamentos? 🏗️`,

  noInformation: `Angela Quintana 👩‍💼, asesora del proyecto, te atenderá en breve con información personalizada.`,

  lowConfidence: `Angela Quintana 👩‍💼, asesora del proyecto, te atenderá en breve con información personalizada.`,
};

// ===========================================
// EXPORTS
// ===========================================

module.exports = {
  detectContext,
  isGreeting,
  isGratitude,
  isAppointmentIntent,
  isViewAppointmentsIntent,
  isCancelAppointmentIntent,
  hasNorboyKeywords,
  hasOutOfContextKeywords,
  normalizeText,
  MESSAGES,
  NORBOY_KEYWORDS,
  OUT_OF_CONTEXT_KEYWORDS,
};
