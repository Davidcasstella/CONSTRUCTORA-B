/**
 * ===========================================
 * SCRIPT PARA CREAR TABLAS DE DYNAMODB
 * ===========================================
 * 
 * Este script crea las tablas necesarias en DynamoDB
 * SOLO ejecutar si las tablas NO existen
 */

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const logger = require('./src/utils/logger');

// Configuración de AWS
const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * Verifica si una tabla existe
 */
async function tableExists(tableName) {
    try {
        const command = new DescribeTableCommand({ TableName: tableName });
        await dynamoClient.send(command);
        return true;
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            return false;
        }
        throw error;
    }
}

/**
 * Crea la tabla de conversaciones
 */
async function createConversationsTable() {
    const tableName = process.env.DYNAMODB_CONVERSATIONS_TABLE || 'chatbot-conversations';

    if (await tableExists(tableName)) {
        logger.info(`✅ Tabla ${tableName} ya existe`);
        return;
    }

    logger.info(`📋 Creando tabla ${tableName}...`);

    const command = new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
            { AttributeName: 'participantId', AttributeType: 'S' },     // Partition Key
            { AttributeName: 'lastInteraction', AttributeType: 'N' }    // Para ordenar por tiempo
        ],
        KeySchema: [
            { AttributeName: 'participantId', KeyType: 'HASH' }         // Partition Key
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'lastInteraction-index',
                KeySchema: [
                    { AttributeName: 'lastInteraction', KeyType: 'HASH' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        BillingMode: 'PAY_PER_REQUEST',  // On-demand pricing (más conveniente)
        Tags: [
            { Key: 'Project', Value: 'Chatbot' },
            { Key: 'Environment', Value: 'production' }
        ]
    });

    try {
        await dynamoClient.send(command);
        logger.info(`✅ Tabla ${tableName} creada exitosamente`);
    } catch (error) {
        logger.error(`❌ Error creando tabla ${tableName}:`, error);
        throw error;
    }
}

/**
 * Crea la tabla de mensajes
 */
async function createMessagesTable() {
    const tableName = process.env.DYNAMODB_MESSAGES_TABLE || 'chatbot-messages';

    if (await tableExists(tableName)) {
        logger.info(`✅ Tabla ${tableName} ya existe`);
        return;
    }

    logger.info(`📋 Creando tabla ${tableName}...`);

    const command = new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
            { AttributeName: 'messageId', AttributeType: 'S' },         // Partition Key
            { AttributeName: 'participantId', AttributeType: 'S' },     // Para GSI
            { AttributeName: 'timestamp', AttributeType: 'N' }          // Sort Key para GSI
        ],
        KeySchema: [
            { AttributeName: 'messageId', KeyType: 'HASH' }             // Partition Key
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'participantId-timestamp-index',
                KeySchema: [
                    { AttributeName: 'participantId', KeyType: 'HASH' },
                    { AttributeName: 'timestamp', KeyType: 'RANGE' }
                ],
                Projection: { ProjectionType: 'ALL' },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        BillingMode: 'PAY_PER_REQUEST',  // On-demand pricing
        Tags: [
            { Key: 'Project', Value: 'Chatbot' },
            { Key: 'Environment', Value: 'production' }
        ]
    });

    try {
        await dynamoClient.send(command);
        logger.info(`✅ Tabla ${tableName} creada exitosamente`);
    } catch (error) {
        logger.error(`❌ Error creando tabla ${tableName}:`, error);
        throw error;
    }
}

/**
 * Ejecutar creación de tablas
 */
async function main() {
    try {
        logger.info('🚀 Iniciando creación de tablas DynamoDB...');

        // Verificar credenciales
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('❌ Credenciales de AWS no configuradas en .env');
        }

        await createConversationsTable();
        await createMessagesTable();

        logger.info('✅ Todas las tablas están listas');
        logger.info('');
        logger.info('📋 PRÓXIMO PASO: Aplicar política de IAM');
        logger.info('   1. Ve a AWS Console → IAM → Users');
        logger.info('   2. Find the IAM user for this chatbot');
        logger.info('   3. Apply the policy from: aws-iam-policy.json');

    } catch (error) {
        logger.error('❌ Error en el proceso:', error);
        process.exit(1);
    }
}

// Ejecutar
main();
