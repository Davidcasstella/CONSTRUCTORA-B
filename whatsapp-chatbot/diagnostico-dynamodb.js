/**
 * ===========================================
 * SCRIPT DE DIAGNÓSTICO DYNAMODB
 * ===========================================
 *
 * Ejecutar: node diagnostico-dynamodb.js
 *
 * Verifica DIRECTAMENTE en DynamoDB:
 * - Tabla de conversaciones
 * - Tabla de mensajes
 * - Índices GSI
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, DescribeTableCommand } = require('@aws-sdk/lib-dynamodb');

const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`)
};

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const CONVERSATIONS_TABLE = process.env.DYNAMODB_CONVERSATIONS_TABLE || 'chatbot-conversations';
const MESSAGES_TABLE = process.env.DYNAMODB_MESSAGES_TABLE || 'chatbot-messages';

async function describeTable(tableName) {
  try {
    const command = new DescribeTableCommand({ TableName: tableName });
    const response = await docClient.send(command);
    return response.Table;
  } catch (error) {
    logger.error(`Error describiendo tabla ${tableName}: ${error.message}`);
    return null;
  }
}

async function scanConversations() {
  console.log('\n====================================');
  console.log('📋 ESCANEANDO TABLA CONVERSATIONS');
  console.log(`   Tabla: ${CONVERSATIONS_TABLE}`);
  console.log('====================================\n');

  try {
    // Primero describir la tabla
    const tableInfo = await describeTable(CONVERSATIONS_TABLE);
    if (tableInfo) {
      console.log(`📊 Estado: ${tableInfo.TableStatus}`);
      console.log(`📊 ItemCount: ${tableInfo.ItemCount}`);
      console.log(`📊 SizeBytes: ${tableInfo.TableSizeBytes}`);
    }

    // Scan completo sin filtros
    const command = new ScanCommand({
      TableName: CONVERSATIONS_TABLE,
      Limit: 10
    });

    const response = await docClient.send(command);

    console.log(`\n✅ Scan ejecutado correctamente`);
    console.log(`📊 Items encontrados: ${response.Items?.length || 0}`);
    console.log(`📊 ConsumedCapacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);

    if (response.Items && response.Items.length > 0) {
      console.log('\n📝 Primeros items:');
      response.Items.forEach((item, idx) => {
        console.log(`   ${idx + 1}. participantId: ${item.participantId || 'N/A'}`);
        console.log(`      status: ${item.status || 'N/A'}`);
        console.log(`      lastInteraction: ${item.lastInteraction || 'N/A'}`);
        console.log(`      updatedAt: ${item.updatedAt || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  La tabla está VACÍA');
    }

    return response.Items || [];
  } catch (error) {
    logger.error(`Error escaneando conversaciones: ${error.message}`);
    console.error(`   Código: ${error.$metadata?.httpStatusCode}`);
    console.error(`   Tipo: ${error.name}`);
    return [];
  }
}

async function queryMessages() {
  console.log('\n====================================');
  console.log('📋 CONSULTANDO TABLA MESSAGES');
  console.log(`   Tabla: ${MESSAGES_TABLE}`);
  console.log('====================================\n');

  try {
    // Primero describir la tabla
    const tableInfo = await describeTable(MESSAGES_TABLE);
    if (tableInfo) {
      console.log(`📊 Estado: ${tableInfo.TableStatus}`);
      console.log(`📊 ItemCount: ${tableInfo.ItemCount}`);
      console.log(`📊 SizeBytes: ${tableInfo.TableSizeBytes}`);
    }

    // Query para obtener mensajes usando el GSI
    const command = new QueryCommand({
      TableName: MESSAGES_TABLE,
      IndexName: 'participantId-timestamp-index',
      KeyConditionExpression: 'participantId = :participantId',
      ExpressionAttributeValues: {
        ':participantId': '573028599105@s.whatsapp.net'
      },
      Limit: 10,
      ScanIndexForward: false
    });

    const response = await docClient.send(command);

    console.log(`\n✅ Query ejecutada correctamente`);
    console.log(`📊 Mensajes encontrados: ${response.Items?.length || 0}`);

    if (response.Items && response.Items.length > 0) {
      console.log('\n📝 Mensajes:');
      response.Items.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. messageId: ${msg.messageId || msg.id || 'N/A'}`);
        console.log(`      participantId: ${msg.participantId || 'N/A'}`);
        console.log(`      direction: ${msg.direction || 'N/A'}`);
        console.log(`      timestamp: ${msg.timestamp || 'N/A'}`);
        console.log(`      content: "${msg.content?.text || '[Sin texto]'}"`);
      });

      // Obtener participantIds únicos para sugerir conversaciones
      const uniqueParticipants = [...new Set(response.Items.map(m => m.participantId))];
      console.log(`\n💡 Se encontraron mensajes para ${uniqueParticipants.length} participante(s):`);
      uniqueParticipants.forEach(p => console.log(`   - ${p}`));
    } else {
      console.log('\n⚠️  No se encontraron mensajes');
    }

    return response.Items || [];
  } catch (error) {
    logger.error(`Error consultando mensajes: ${error.message}`);
    console.error(`   Código: ${error.$metadata?.httpStatusCode}`);
    console.error(`   Tipo: ${error.name}`);
    return [];
  }
}

async function scanMessages() {
  console.log('\n====================================');
  console.log('📋 ESCANEANDO TABLA MESSAGES');
  console.log(`   Tabla: ${MESSAGES_TABLE}`);
  console.log('====================================\n');

  try {
    const command = new ScanCommand({
      TableName: MESSAGES_TABLE,
      Limit: 20
    });

    const response = await docClient.send(command);

    console.log(`📊 Items encontrados: ${response.Items?.length || 0}`);

    if (response.Items && response.Items.length > 0) {
      console.log('\n📝 Mensajes (scan):');
      response.Items.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. participantId: ${msg.participantId || 'N/A'}`);
        console.log(`      direction: ${msg.direction || 'N/A'}`);
        console.log(`      content: "${msg.content?.text || '[Multimedia]'}"`);
      });

      // Obtener participantIds únicos
      const uniqueParticipants = [...new Set(response.Items.map(m => m.participantId).filter(Boolean))];
      console.log(`\n💡 Participantes únicos encontrados: ${uniqueParticipants.length}`);
      uniqueParticipants.slice(0, 5).forEach(p => console.log(`   - ${p}`));
    }

    return response.Items || [];
  } catch (error) {
    logger.error(`Error escaneando mensajes: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   🔍 DIAGNÓSTICO DYNAMODB          ║');
  console.log('╚══════════════════════════════════════╝');

  console.log(`\n📍 Región: ${process.env.AWS_REGION}`);
  console.log(`📍 Tabla Conversations: ${CONVERSATIONS_TABLE}`);
  console.log(`📍 Tabla Messages: ${MESSAGES_TABLE}`);

  // 1. Escanear conversaciones
  await scanConversations();

  // 2. Consultar mensajes con GSI
  await queryMessages();

  // 3. Escanear mensajes
  await scanMessages();

  console.log('\n====================================');
  console.log('✅ Diagnóstico completado');
  console.log('====================================\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
