/**
 * ===========================================
 * SCRIPT PARA CREAR TABLAS EN DYNAMODB
 * ===========================================
 * 
 * Ejecutar con: node scripts/setup-dynamodb.js
 */

require('dotenv').config();
const {
    CreateTableCommand,
    DescribeTableCommand,
    waitUntilTableExists
} = require('@aws-sdk/client-dynamodb');
const { dynamoDBClient, TABLES } = require('../src/providers/dynamodb.provider');

async function createConversationsTable() {
    const params = {
        TableName: TABLES.CONVERSATIONS,
        KeySchema: [
            { AttributeName: 'participantId', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'participantId', AttributeType: 'S' },
            { AttributeName: 'lastInteraction', AttributeType: 'N' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'lastInteraction-index',
                KeySchema: [
                    { AttributeName: 'lastInteraction', KeyType: 'HASH' }
                ],
                Projection: {
                    ProjectionType: 'ALL'
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        BillingMode: 'PROVISIONED',
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        console.log(`📦 Creando tabla: ${TABLES.CONVERSATIONS}...`);
        const command = new CreateTableCommand(params);
        await dynamoDBClient.send(command);

        // Esperar a que la tabla se active
        await waitUntilTableExists(
            { client: dynamoDBClient, maxWaitTime: 60 },
            { TableName: TABLES.CONVERSATIONS }
        );

        console.log(`✅ Tabla creada: ${TABLES.CONVERSATIONS}`);
        return true;
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️  Tabla ${TABLES.CONVERSATIONS} ya existe`);
            return true;
        }
        console.error(`❌ Error creando tabla ${TABLES.CONVERSATIONS}:`, error.message);
        return false;
    }
}

async function createMessagesTable() {
    const params = {
        TableName: TABLES.MESSAGES,
        KeySchema: [
            { AttributeName: 'messageId', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'messageId', AttributeType: 'S' },
            { AttributeName: 'participantId', AttributeType: 'S' },
            { AttributeName: 'timestamp', AttributeType: 'N' }
        ],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'participantId-timestamp-index',
                KeySchema: [
                    { AttributeName: 'participantId', KeyType: 'HASH' },
                    { AttributeName: 'timestamp', KeyType: 'RANGE' }
                ],
                Projection: {
                    ProjectionType: 'ALL'
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ],
        BillingMode: 'PROVISIONED',
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        console.log(`📦 Creando tabla: ${TABLES.MESSAGES}...`);
        const command = new CreateTableCommand(params);
        await dynamoDBClient.send(command);

        // Esperar a que la tabla se active
        await waitUntilTableExists(
            { client: dynamoDBClient, maxWaitTime: 60 },
            { TableName: TABLES.MESSAGES }
        );

        console.log(`✅ Tabla creada: ${TABLES.MESSAGES}`);
        return true;
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`ℹ️  Tabla ${TABLES.MESSAGES} ya existe`);
            return true;
        }
        console.error(`❌ Error creando tabla ${TABLES.MESSAGES}:`, error.message);
        return false;
    }
}

async function verifyTables() {
    console.log('\n📊 Verificando tablas...\n');

    for (const tableName of Object.values(TABLES)) {
        try {
            const command = new DescribeTableCommand({ TableName: tableName });
            const response = await dynamoDBClient.send(command);

            console.log(`✅ ${tableName}:`);
            console.log(`   Estado: ${response.Table.TableStatus}`);
            console.log(`   Items: ${response.Table.ItemCount}`);
            console.log(`   Tamaño: ${(response.Table.TableSizeBytes / 1024).toFixed(2)} KB`);
            console.log('');
        } catch (error) {
            console.error(`❌ Error verificando tabla ${tableName}:`, error.message);
        }
    }
}

async function main() {
    console.log('===========================================');
    console.log('CONFIGURACIÓN DE DYNAMODB - NORBOY CHATBOT');
    console.log('===========================================\n');

    console.log(`Región: ${process.env.AWS_REGION}`);
    console.log(`Access Key: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 10)}...`);
    console.log('');

    // Crear tablas
    const conversationsCreated = await createConversationsTable();
    const messagesCreated = await createMessagesTable();

    if (conversationsCreated && messagesCreated) {
        console.log('\n✅ Todas las tablas están listas\n');
        await verifyTables();
        console.log('🎉 Configuración completada exitosamente');
        process.exit(0);
    } else {
        console.error('\n❌ Hubo errores en la configuración');
        process.exit(1);
    }
}

// Ejecutar
main().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
