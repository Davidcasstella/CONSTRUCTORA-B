/**
 * Script para crear la tabla DynamoDB de etiquetas (labels) en CONSTRUCTORA
 * Uso: node create-labels-table.js
 */

require('dotenv').config();

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const region    = process.env.AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const tableName = process.env.DYNAMODB_LABELS_TABLE || 'constructora-labels';

if (!region || !accessKey || !secretKey) {
  console.error('ERROR: Configura AWS_REGION, AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en .env');
  process.exit(1);
}

const client = new DynamoDBClient({
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
});

async function createTable() {
  console.log(`Creando tabla: ${tableName} en region ${region}`);

  // Check if already exists
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`La tabla ${tableName} ya existe.`);
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }

  const params = {
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  };

  try {
    const result = await client.send(new CreateTableCommand(params));
    console.log(`Tabla ${tableName} creada exitosamente!`);
    console.log('TableArn:', result.TableDescription.TableArn);
  } catch (err) {
    console.error('Error creando tabla:', err.message);
    throw err;
  }
}

createTable()
  .then(() => { console.log('Listo!'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
