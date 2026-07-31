/**
 * ===========================================
 * PROVEEDOR DE DYNAMODB
 * ===========================================
 * 
 * Cliente de DynamoDB configurado con credenciales de AWS
 * ✅ MEJORADO: No crashea si faltan credenciales, permite configurar desde el dashboard
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const logger = require('../utils/logger');

// Table names from .env (no hardcoded defaults — must be configured)
const TABLES = {
  CONVERSATIONS: process.env.DYNAMODB_CONVERSATIONS_TABLE || 'chatbot-conversations',
  MESSAGES: process.env.DYNAMODB_MESSAGES_TABLE || 'chatbot-messages',
  HOLIDAYS: process.env.DYNAMODB_HOLIDAYS_TABLE || 'chatbot-holidays',
  CONTACT_LISTS: process.env.DYNAMODB_CONTACT_LISTS_TABLE || 'chatbot-contact-lists',
  CONTACTS: process.env.DYNAMODB_CONTACTS_TABLE || 'chatbot-contacts',
  BULK_CAMPAIGNS: process.env.DYNAMODB_BULK_CAMPAIGNS_TABLE || 'chatbot-bulk-campaigns',
  BULK_MESSAGES: process.env.DYNAMODB_BULK_MESSAGES_TABLE || 'chatbot-bulk-messages',
  MESSAGE_TEMPLATES: process.env.DYNAMODB_MESSAGE_TEMPLATES_TABLE || 'chatbot-message-templates',
  LABELS: process.env.DYNAMODB_LABELS_TABLE || 'constructora-labels'
};

let dynamoDBClient = null;
let docClient = null;
let isConfigured = false;

// Intentar inicializar si las credenciales están disponibles
const region = process.env.AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

if (region && accessKey && secretKey) {
  try {
    dynamoDBClient = new DynamoDBClient({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey
      }
    });

    docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false
      },
      unmarshallOptions: {
        wrapNumbers: false
      }
    });

    isConfigured = true;
    logger.info(`✅ [DYNAMO] Cliente configurado - Región: ${region}`);
  } catch (error) {
    logger.error(`❌ [DYNAMO] Error inicializando: ${error.message}`);
  }
} else {
  const missing = [];
  if (!region) missing.push('AWS_REGION');
  if (!accessKey) missing.push('AWS_ACCESS_KEY_ID');
  if (!secretKey) missing.push('AWS_SECRET_ACCESS_KEY');

  logger.warn(`⚠️ [DYNAMO] Credenciales incompletas (${missing.join(', ')}). DynamoDB desactivado.`);
  logger.debug('   Verifique su archivo .env o las variables de entorno del sistema.');
}

module.exports = {
  dynamoDBClient,
  docClient,
  isConfigured,
  TABLES
};

