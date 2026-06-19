/**
 * ===========================================
 * CONFIGURACIÓN DE WHATSAPP
 * ===========================================
 *
 * Responsabilidades:
 * - Definir qué proveedor usar (Meta o Twilio)
 * - Configurar credenciales según el proveedor
 * - Centralizar URLs de API
 *
 * PATRÓN: La aplicación usará UN SOLO proveedor a la vez,
 * seleccionado por la variable WHATSAPP_PROVIDER
 */

// Proveedor activo: 'meta' o 'twilio'
const provider = process.env.WHATSAPP_PROVIDER || 'meta';

// ===========================================
// CONFIGURACIÓN META (Cloud API)
// ===========================================
const meta = {
  accessToken: process.env.META_ACCESS_TOKEN,
  phoneNumberId: process.env.META_PHONE_NUMBER_ID,
  webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
  apiVersion: process.env.META_API_VERSION || 'v18.0',

  // URL base de la API
  get baseUrl() {
    return `https://graph.facebook.com/${this.apiVersion}`;
  },

  // URL para enviar mensajes
  get messagesUrl() {
    return `${this.baseUrl}/${this.phoneNumberId}/messages`;
  }
};

// ===========================================
// CONFIGURACIÓN TWILIO
// ===========================================
const twilio = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,

  // URL base de la API
  baseUrl: 'https://api.twilio.com/2010-04-01'
};

// ===========================================
// EXPORTAR CONFIGURACIÓN
// ===========================================
module.exports = {
  provider,    // 'meta' o 'twilio'
  meta,
  twilio,

  // Método helper para obtener config del proveedor activo
  getActiveConfig() {
    return provider === 'meta' ? meta : twilio;
  }
};
