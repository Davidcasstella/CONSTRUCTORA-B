/**
 * ===========================================
 * PROVEEDOR DE IA - GROQ
 * ===========================================
 *
 * Groq ofrece inferencia ultra-rápida con modelos
 * como Llama, Mixtral, etc.
 *
 * API compatible con OpenAI.
 */

const OpenAI = require('openai');
const logger = require('../../utils/logger');

class GroqProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY;
    this.model = config.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    this.maxTokens = config.maxTokens || 500;

    // Groq usa API compatible con OpenAI
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });

    logger.info(`Groq Provider inicializado con modelo: ${this.model}`);
  }

  /**
   * Genera una respuesta de chat
   */
  async chat(messages, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: messages,
        max_tokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || 0.7
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Respuesta vacía de Groq');
      }

      logger.debug('Respuesta generada con Groq');
      return content;

    } catch (error) {
      logger.error('Error en Groq chat:', error.message);
      throw error;
    }
  }

  /**
   * Verifica si el proveedor está disponible
   */
  async isAvailable() {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = GroqProvider;
