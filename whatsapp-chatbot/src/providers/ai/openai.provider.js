/**
 * ===========================================
 * PROVEEDOR OPENAI
 * ===========================================
 *
 * Responsabilidades:
 * - Comunicación con la API de OpenAI
 * - Chat completions (GPT-4, GPT-3.5)
 * - Vision (análisis de imágenes)
 * - Whisper (transcripción de audio)
 * - Embeddings (vectorización de texto)
 *
 * DOCUMENTACIÓN:
 * https://platform.openai.com/docs/api-reference
 */

const fs = require('fs');
const logger = require('../../utils/logger');
const { withRetry } = require('../../utils/retry');

class OpenAIProvider {
  constructor(config) {
    this.config = config;
    this.client = null;

    // Inicialización perezosa del cliente
    this._initClient();
  }

  /**
   * Inicializa el cliente de OpenAI
   */
  _initClient() {
    try {
      // Importar dinámicamente para evitar errores si no está instalado
      const OpenAI = require('openai');

      this.client = new OpenAI({
        apiKey: this.config.apiKey
      });

      logger.info('Cliente OpenAI inicializado');
    } catch (error) {
      logger.warn('openai no instalado o error de inicialización:', error.message);
      // Permitir que la app inicie sin OpenAI en desarrollo
    }
  }

  /**
   * Genera una respuesta de chat
   * @param {Array} messages - Mensajes en formato OpenAI
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<string>} Respuesta del modelo
   */
  async chat(messages, options = {}) {
    this._ensureClient();

    return withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: options.model || this.config.model,
          messages: messages,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          ...(options.stop && { stop: options.stop }),
          ...(options.functions && { functions: options.functions }),
          ...(options.function_call && { function_call: options.function_call })
        });

        const content = response.choices[0]?.message?.content || '';

        logger.debug('Respuesta de chat generada', {
          model: options.model || this.config.model,
          tokens: response.usage?.total_tokens
        });

        return content;
      } catch (error) {
        this._handleError('chat', error);
      }
    }, { operationName: 'OpenAI.chat', maxRetries: 3 });
  }

  /**
   * Analiza una imagen con GPT-4 Vision
   * @param {string} imageUrl - URL de la imagen
   * @param {string} prompt - Instrucción para el análisis
   * @returns {Promise<string>} Descripción/análisis
   */
  async analyzeImage(imageUrl, prompt = 'Describe esta imagen') {
    try {
      this._ensureClient();

      const response = await this.client.chat.completions.create({
        model: this.config.models.vision,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'auto' // 'low', 'high', o 'auto'
                }
              }
            ]
          }
        ],
        max_tokens: this.config.maxTokens
      });

      const content = response.choices[0]?.message?.content || '';

      logger.debug('Imagen analizada', { tokens: response.usage?.total_tokens });

      return content;

    } catch (error) {
      this._handleError('analyzeImage', error);
    }
  }

  /**
   * Transcribe un archivo de audio con Whisper
   * @param {string} audioPath - Path al archivo de audio
   * @returns {Promise<string>} Transcripción
   */
  async transcribeAudio(audioPath) {
    this._ensureClient();

    return withRetry(async () => {
      try {
        const audioFile = fs.createReadStream(audioPath);

        const response = await this.client.audio.transcriptions.create({
          model: this.config.models.audio,
          file: audioFile,
          language: 'es',
          response_format: 'text'
        });

        logger.debug('Audio transcrito', { path: audioPath });
        return response;
      } catch (error) {
        this._handleError('transcribeAudio', error);
      }
    }, { operationName: 'OpenAI.transcribeAudio', maxRetries: 2 });
  }

  /**
   * Genera embeddings para texto (útil para búsqueda semántica)
   * @param {string} text - Texto a vectorizar
   * @returns {Promise<Array>} Vector de embeddings
   */
  async createEmbedding(text) {
    this._ensureClient();

    return withRetry(async () => {
      try {
        const response = await this.client.embeddings.create({
          model: 'text-embedding-ada-002',
          input: text
        });

        return response.data[0].embedding;
      } catch (error) {
        this._handleError('createEmbedding', error);
      }
    }, { operationName: 'OpenAI.createEmbedding', maxRetries: 3 });
  }

  /**
   * Genera respuesta en streaming (para respuestas largas)
   * @param {Array} messages - Mensajes
   * @param {Function} onChunk - Callback para cada chunk
   */
  async chatStream(messages, onChunk) {
    try {
      this._ensureClient();

      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages,
        stream: true
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullContent += content;

        if (onChunk) {
          onChunk(content);
        }
      }

      return fullContent;

    } catch (error) {
      this._handleError('chatStream', error);
    }
  }

  /**
   * Verifica que el cliente esté inicializado
   */
  _ensureClient() {
    if (!this.client) {
      throw new Error('Cliente OpenAI no inicializado. Verifique OPENAI_API_KEY');
    }
  }

  /**
   * Maneja errores de la API de OpenAI
   */
  _handleError(method, error) {
    const errorType = error.constructor.name;

    logger.error(`Error en OpenAIProvider.${method}:`, {
      type: errorType,
      message: error.message,
      status: error.status,
      code: error.code
    });

    // Preservar el status code para que withRetry pueda distinguir errores recuperables
    const wrappedError = new Error(error.message || `Error en OpenAI.${method}`);
    wrappedError.status = error.status;
    wrappedError.statusCode = error.status;
    wrappedError.code = error.code;
    wrappedError.headers = error.headers;

    // Mensajes de error más amigables
    if (error.status === 401) {
      wrappedError.message = 'API Key de OpenAI inválida';
    } else if (error.status === 429) {
      wrappedError.message = 'Límite de tasa de OpenAI excedido. Reintentando...';
    } else if (error.status === 500) {
      wrappedError.message = 'Error interno de OpenAI. Reintentando...';
    }

    throw wrappedError;
  }
}

module.exports = OpenAIProvider;
