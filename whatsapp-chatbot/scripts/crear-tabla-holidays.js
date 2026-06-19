/**
 * Script para crear la tabla de holidays en DynamoDB
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function crearTabla() {
  const tableName = process.env.DYNAMODB_HOLIDAYS_TABLE || 'chatbot-holidays';
  console.log(`📊 Creando tabla ${tableName} en DynamoDB...\n`);

  const params = {
    TableName: tableName,
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'S'
      }
    ],
    KeySchema: [
      {
        AttributeName: 'id',
        KeyType: 'HASH'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  };

  try {
    const command = new CreateTableCommand(params);
    await client.send(command);
    console.log(`✅ Tabla ${tableName} creada exitosamente!`);
    console.log('⏳ Esperando a que la tabla esté activa...');

    // Esperar a que la tabla esté activa
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Tabla lista para usar!');
    process.exit(0);
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('✅ La tabla ya existe!');
      process.exit(0);
    }
    console.error('❌ Error creando tabla:', error.message);
    process.exit(1);
  }
}

crearTabla();
