/**
 * ===========================================
 * ÍNDICE DE PROVEEDORES DE IA
 * ===========================================
 *
 * ✅ MODIFICADO: Sistema con prioridad fija:
 * 1. ChatGPT (OpenAI) - SIEMPRE es el proveedor primario
 * 2. Grok - Solo como fallback cuando ChatGPT falla
 *
 * Escenarios:
 * - ChatGPT activo: Usar ChatGPT, si falla → usar Grok
 * - ChatGPT desactivado: Usar Grok directamente
 * - Ambos desactivados: Error, no generar respuesta
 */

const GroqProvider = require('./groq.provider');
const OpenAIProvider = require('./openai.provider');
const config = require('../../config');
const settingsService = require('../../services/settings.service');
const logger = require('../../utils/logger');

// ===========================================
// INSTANCIAS DE PROVEEDORES
// ===========================================

let groqProvider = null;
let openaiProvider = null;

/**
 * ✅ NUEVO: Reinicializa los proveedores con las API keys actuales
 * Se llama cuando cambia la configuración sin reiniciar el servidor
 */
const reinitializeProviders = () => {
  const currentSettings = settingsService.getApiKeys();

  // Reinicializar Groq
  if (currentSettings.groq.apiKey) {
    groqProvider = new GroqProvider({
      apiKey: currentSettings.groq.apiKey,
      model: currentSettings.groq.model || 'llama-3.3-70b-versatile'
    });
    logger.info('✅ Groq Provider reinicializado');
  } else {
    groqProvider = null;
  }

  // Reinicializar OpenAI
  if (currentSettings.openai.apiKey) {
    openaiProvider = new OpenAIProvider({
      apiKey: currentSettings.openai.apiKey,
      model: currentSettings.openai.model || 'gpt-4o-mini'
    });
    logger.info('✅ OpenAI Provider reinicializado');
  } else {
    openaiProvider = null;
  }
};

// Inicializar proveedores al cargar el módulo
if (process.env.GROQ_API_KEY) {
  groqProvider = new GroqProvider({
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  });
  logger.info('Groq Provider disponible');
}

if (config.openai?.apiKey) {
  openaiProvider = new OpenAIProvider(config.openai);
  logger.info('OpenAI Provider disponible');
}

// ===========================================
// FUNCIONES CON FALLBACK INTELIGENTE
// ===========================================

/**
 * ✅ MODIFICADO: Genera una respuesta de chat con lógica de prioridad fija
 *
 * PRIORIDAD FIJA:
 * 1️⃣ ChatGPT (OpenAI) SIEMPRE es el primario
 * 2️⃣ Grok solo actúa como fallback
 */
const chat = async (messages, options = {}) => {
  // Obtener configuración actual (se lee en cada llamada para cambios dinámicos)
  const currentSettings = settingsService.getApiKeys();

  const chatGPTEnabled = currentSettings.openai.enabled && currentSettings.openai.apiKey;
  const grokEnabled = currentSettings.groq.enabled && currentSettings.groq.apiKey;

  logger.debug(`🤖 Estado proveedores: ChatGPT=${chatGPTEnabled ? 'ON' : 'OFF'}, Grok=${grokEnabled ? 'ON' : 'OFF'}`);

  // ❌ Caso C: Ambos desactivados
  if (!chatGPTEnabled && !grokEnabled) {
    logger.error('❌ AMBOS proveedores de IA están desactivados');
    throw new Error('No hay proveedores de IA disponibles. Active ChatGPT o Grok en la configuración.');
  }

  // ✅ Caso A: ChatGPT activo (primario)
  if (chatGPTEnabled) {
    // Asegurar que el provider existe
    if (!openaiProvider && currentSettings.openai.apiKey) {
      openaiProvider = new OpenAIProvider({
        apiKey: currentSettings.openai.apiKey,
        model: currentSettings.openai.model || 'gpt-4o-mini'
      });
    }

    if (openaiProvider) {
      try {
        logger.info('🤖 Usando ChatGPT (proveedor primario)...');
        const response = await openaiProvider.chat(messages, options);
        return response;
      } catch (error) {
        logger.warn(`⚠️ Error con ChatGPT: ${error.message}`);

        // Intentar fallback a Grok si está habilitado
        if (grokEnabled) {
          logger.info('🔄 Fallback a Grok...');

          // Asegurar que el provider existe
          if (!groqProvider && currentSettings.groq.apiKey) {
            groqProvider = new GroqProvider({
              apiKey: currentSettings.groq.apiKey,
              model: currentSettings.groq.model || 'llama-3.3-70b-versatile'
            });
          }

          if (groqProvider) {
            try {
              const fallbackResponse = await groqProvider.chat(messages, options);
              logger.info('✅ Respuesta obtenida desde Grok (fallback)');
              return fallbackResponse;
            } catch (fallbackError) {
              logger.error(`❌ Error también con Grok: ${fallbackError.message}`);
              throw new Error('Ambos proveedores de IA fallaron. ChatGPT: ' + error.message + ' | Grok: ' + fallbackError.message);
            }
          }
        }

        // Si no hay fallback disponible, lanzar el error original
        throw error;
      }
    }
  }

  // ✅ Caso B: ChatGPT desactivado, usar Grok directamente
  if (grokEnabled) {
    // Asegurar que el provider existe
    if (!groqProvider && currentSettings.groq.apiKey) {
      groqProvider = new GroqProvider({
        apiKey: currentSettings.groq.apiKey,
        model: currentSettings.groq.model || 'llama-3.3-70b-versatile'
      });
    }

    if (groqProvider) {
      try {
        logger.info('🤖 Usando Grok (ChatGPT desactivado)...');
        return await groqProvider.chat(messages, options);
      } catch (error) {
        logger.error(`❌ Error con Grok: ${error.message}`);
        throw error;
      }
    }
  }

  // Si llegamos aquí, algo salió mal
  throw new Error('No se pudo inicializar ningún proveedor de IA');
};

/**
 * Analiza una imagen (solo OpenAI soporta esto)
 */
const analyzeImage = async (imageUrl, prompt) => {
  if (openaiProvider) {
    return await openaiProvider.analyzeImage(imageUrl, prompt);
  }
  throw new Error('Análisis de imágenes requiere OpenAI');
};

/**
 * Transcribe audio (solo OpenAI Whisper)
 */
const transcribeAudio = async (audioPath) => {
  if (openaiProvider) {
    return await openaiProvider.transcribeAudio(audioPath);
  }
  throw new Error('Transcripción de audio requiere OpenAI');
};

/**
 * Genera embeddings (solo OpenAI)
 */
const createEmbedding = async (text) => {
  if (openaiProvider) {
    return await openaiProvider.createEmbedding(text);
  }
  throw new Error('Embeddings requiere OpenAI');
};

// ===========================================
// EXPORTAR
// ===========================================

module.exports = {
  chat,
  analyzeImage,
  transcribeAudio,
  createEmbedding,
  reinitializeProviders,
  groqProvider,
  openaiProvider
};
