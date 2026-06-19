/**
 * Script de diagnóstico de DynamoDB
 * Verifica conectividad, tablas, y operaciones básicas
 */

require('dotenv').config();
const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

console.log('='.repeat(60));
console.log('🔍 DIAGNÓSTICO DE DYNAMODB');
console.log('='.repeat(60));
console.log();

// Validar credenciales
console.log('📋 CONFIGURACIÓN:');
console.log(`   Región: ${REGION}`);
console.log(`   Access Key ID: ${ACCESS_KEY_ID ? `${ACCESS_KEY_ID.substring(0, 10)}...` : 'NO CONFIGURADO'}`);
console.log(`   Secret Access Key: ${SECRET_ACCESS_KEY ? `${SECRET_ACCESS_KEY.substring(0, 10)}...` : 'NO CONFIGURADO'}`);
console.log();

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.error('❌ ERROR: Credenciales de AWS no configuradas en .env');
    process.exit(1);
}

// Crear cliente
const dynamoDBClient = new DynamoDBClient({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
    marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false
    }
});

async function runDiagnostics() {
    try {
        // 1. Listar tablas
        console.log('📊 PASO 1: Listando tablas en DynamoDB...');
        const listTablesCommand = new ListTablesCommand({});
        const tablesResponse = await dynamoDBClient.send(listTablesCommand);

        console.log(`✅ Conexión exitosa! Tablas encontradas (${tablesResponse.TableNames.length}):`);
        tablesResponse.TableNames.forEach(tableName => {
            console.log(`   - ${tableName}`);
        });
        console.log();

        // 2. Verificar tablas necesarias
        console.log('📊 PASO 2: Verificando tablas necesarias...');
        const requiredTables = ['norboy-conversations', 'norboy-messages'];
        const missingTables = [];

        for (const tableName of requiredTables) {
            const exists = tablesResponse.TableNames.includes(tableName);
            if (exists) {
                console.log(`✅ Tabla encontrada: ${tableName}`);
            } else {
                console.log(`❌ Tabla NO encontrada: ${tableName}`);
                missingTables.push(tableName);
            }
        }
        console.log();

        if (missingTables.length > 0) {
            console.log('⚠️  ADVERTENCIA: Faltan tablas. Ejecuta el script de creación:');
            console.log('   node scripts/setup-dynamodb.js');
            console.log();
        }

        // 3. Probar escritura en tabla de mensajes (si existe)
        if (tablesResponse.TableNames.includes('norboy-messages')) {
            console.log('📊 PASO 3: Probando escritura en norboy-messages...');

            const testMessage = {
                messageId: `test_${Date.now()}`,
                participantId: '573000000000@s.whatsapp.net',
                conversationId: '573000000000@s.whatsapp.net',
                direction: 'outgoing',
                type: 'text',
                content: { text: 'Test message' },
                status: 'delivered',
                timestamp: Date.now(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const putCommand = new PutCommand({
                TableName: 'norboy-messages',
                Item: testMessage
            });

            try {
                await docClient.send(putCommand);
                console.log(`✅ Mensaje de prueba guardado exitosamente`);
                console.log(`   ID: ${testMessage.messageId}`);

                // Intentar leer el mensaje
                const getCommand = new GetCommand({
                    TableName: 'norboy-messages',
                    Key: {
                        messageId: testMessage.messageId,
                        participantId: testMessage.participantId
                    }
                });

                const getResponse = await docClient.send(getCommand);
                if (getResponse.Item) {
                    console.log(`✅ Mensaje de prueba leído exitosamente`);
                } else {
                    console.log(`⚠️  Mensaje guardado pero no se pudo leer (posible problema con claves)`);
                }
            } catch (error) {
                console.error(`❌ Error guardando mensaje de prueba:`);
                console.error(`   Código: ${error.name}`);
                console.error(`   Mensaje: ${error.message}`);
                if (error.$metadata) {
                    console.error(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
                }
            }
            console.log();
        }

        // 4. Probar escritura en tabla de conversaciones (si existe)
        if (tablesResponse.TableNames.includes('norboy-conversations')) {
            console.log('📊 PASO 4: Probando escritura en norboy-conversations...');

            const testConversation = {
                participantId: '573000000000@s.whatsapp.net',
                participantName: 'Test User',
                status: 'active',
                bot_active: true,
                consentStatus: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastInteraction: Date.now()
            };

            const putCommand = new PutCommand({
                TableName: 'norboy-conversations',
                Item: testConversation
            });

            try {
                await docClient.send(putCommand);
                console.log(`✅ Conversación de prueba guardada exitosamente`);
                console.log(`   Participant ID: ${testConversation.participantId}`);

                // Intentar leer la conversación
                const getCommand = new GetCommand({
                    TableName: 'norboy-conversations',
                    Key: {
                        participantId: testConversation.participantId
                    }
                });

                const getResponse = await docClient.send(getCommand);
                if (getResponse.Item) {
                    console.log(`✅ Conversación de prueba leída exitosamente`);
                } else {
                    console.log(`⚠️  Conversación guardada pero no se pudo leer (posible problema con claves)`);
                }
            } catch (error) {
                console.error(`❌ Error guardando conversación de prueba:`);
                console.error(`   Código: ${error.name}`);
                console.error(`   Mensaje: ${error.message}`);
                if (error.$metadata) {
                    console.error(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
                }
            }
            console.log();
        }

        console.log('='.repeat(60));
        console.log('✅ DIAGNÓSTICO COMPLETO');
        console.log('='.repeat(60));

    } catch (error) {
        console.error();
        console.error('❌ ERROR FATAL:');
        console.error(`   Código: ${error.name}`);
        console.error(`   Mensaje: ${error.message}`);
        if (error.$metadata) {
            console.error(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
        }
        console.error();
        console.error('Stack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

runDiagnostics();
