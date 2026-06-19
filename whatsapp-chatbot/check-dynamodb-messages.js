/**
 * Script para verificar mensajes en DynamoDB
 */

require('dotenv').config();
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

console.log('🔍 Verificando mensajes en DynamoDB...\n');

const dynamoDBClient = new DynamoDBClient({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

async function checkMessages() {
    try {
        // Verificar tabla de mensajes
        console.log('📊 TABLA: norboy-messages');
        console.log('='.repeat(60));

        const { ScanCommand: DocScanCommand } = require('@aws-sdk/lib-dynamodb');
        const messagesCommand = new DocScanCommand({
            TableName: 'norboy-messages',
            Limit: 20
        });

        const messagesResponse = await docClient.send(messagesCommand);

        console.log(`\n✅ Mensajes encontrados: ${messagesResponse.Items.length}`);
        console.log();

        if (messagesResponse.Items.length === 0) {
            console.log('⚠️  No hay mensajes en la tabla');
        } else {
            console.log('Últimos mensajes:\n');
            messagesResponse.Items.forEach((msg, index) => {
                const timestamp = msg.timestamp || msg.createdAt;
                const date = timestamp ? new Date(typeof timestamp === 'number' ? timestamp : timestamp).toLocaleString() : 'N/A';
                console.log(`${index + 1}. ID: ${msg.messageId || msg.id}`);
                console.log(`   Participant: ${msg.participantId}`);
                console.log(`   Direction: ${msg.direction}`);
                console.log(`   Content: ${msg.content?.text?.substring(0, 50) || '[No text]'}`);
                console.log(`   Timestamp: ${date}`);
                console.log();
            });
        }

        // Verificar tabla de conversaciones
        console.log('\n📊 TABLA: norboy-conversations');
        console.log('='.repeat(60));

        const conversationsCommand = new DocScanCommand({
            TableName: 'norboy-conversations',
            Limit: 20
        });

        const conversationsResponse = await docClient.send(conversationsCommand);

        console.log(`\n✅ Conversaciones encontradas: ${conversationsResponse.Items.length}`);
        console.log();

        if (conversationsResponse.Items.length === 0) {
            console.log('⚠️  No hay conversaciones en la tabla');
        } else {
            console.log('Conversaciones activas:\n');
            conversationsResponse.Items.forEach((conv, index) => {
                console.log(`${index + 1}. Participant: ${conv.participantId}`);
                console.log(`   Name: ${conv.participantName || conv.whatsappName || 'Sin nombre'}`);
                console.log(`   Status: ${conv.status}`);
                console.log(`   Last message: ${conv.lastMessage?.substring(0, 50) || 'N/A'}`);
                console.log();
            });
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        if (error.$metadata) {
            console.error(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
        }
    }
}

checkMessages();
