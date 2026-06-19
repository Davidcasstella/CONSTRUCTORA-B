/**
 * ================================================
 * SCRIPT DE VERIFICACIÓN - POST IAM SETUP
 * ================================================
 * 
 * Ejecuta este script DESPUÉS de aplicar la política IAM
 * para verificar que todo funciona correctamente
 */

require('dotenv').config();
const logger = require('./src/utils/logger');
const { docClient, TABLES } = require('./src/providers/dynamodb.provider');
const { DescribeTableCommand, ListTablesCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');

// Cliente DynamoDB básico para DescribeTable
const dynamoClient = new DynamoDB({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function verificarPermisosIAM() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 VERIFICACIÓN DE PERMISOS AWS IAM');
    console.log('='.repeat(60) + '\n');

    let todoBien = true;

    // Test 1: ListTables
    try {
        console.log('📋 Test 1/4: ListTables (listar tablas)...');
        const listCommand = new ListTablesCommand({});
        const result = await docClient.send(listCommand);
        console.log(`   ✅ ÉXITO - Tablas encontradas: ${result.TableNames.join(', ')}`);
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        todoBien = false;
    }

    // Test 2: DescribeTable (norboy-conversations)
    try {
        console.log('\n📊 Test 2/4: DescribeTable (describir tabla conversations)...');
        const describeCommand = new DescribeTableCommand({ TableName: TABLES.CONVERSATIONS });
        const result = await dynamoClient.send(describeCommand);
        console.log(`   ✅ ÉXITO - Tabla: ${result.Table.TableName}`);
        console.log(`   📊 Estado: ${result.Table.TableStatus}`);
        console.log(`   🔑 Partition Key: ${result.Table.KeySchema[0].AttributeName}`);
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        if (error.name === 'ResourceNotFoundException') {
            console.log('   ℹ️  La tabla no existe - necesitas crearla');
        }
        todoBien = false;
    }

    // Test 3: DescribeTable (norboy-messages)
    try {
        console.log('\n📨 Test 3/4: DescribeTable (describir tabla messages)...');
        const describeCommand = new DescribeTableCommand({ TableName: TABLES.MESSAGES });
        const result = await dynamoClient.send(describeCommand);
        console.log(`   ✅ ÉXITO - Tabla: ${result.Table.TableName}`);
        console.log(`   📊 Estado: ${result.Table.TableStatus}`);
        console.log(`   🔑 Partition Key: ${result.Table.KeySchema[0].AttributeName}`);

        // Verificar GSI
        if (result.Table.GlobalSecondaryIndexes) {
            const gsi = result.Table.GlobalSecondaryIndexes.find(
                idx => idx.IndexName === 'participantId-timestamp-index'
            );
            if (gsi) {
                console.log(`   ✅ GSI encontrado: ${gsi.IndexName}`);
            } else {
                console.log(`   ⚠️  GSI 'participantId-timestamp-index' NO encontrado`);
                todoBien = false;
            }
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        if (error.name === 'ResourceNotFoundException') {
            console.log('   ℹ️  La tabla no existe - necesitas crearla');
        }
        todoBien = false;
    }

    // Test 4: Scan (leer datos)
    try {
        console.log('\n📖 Test 4/4: Scan (leer datos de messages)...');
        const scanCommand = new ScanCommand({
            TableName: TABLES.MESSAGES,
            Limit: 5
        });
        const result = await docClient.send(scanCommand);
        console.log(`   ✅ ÉXITO - Mensajes encontrados: ${result.Items.length}`);
        if (result.Items.length > 0) {
            console.log(`   📨 Último mensaje: ${result.Items[0].id}`);
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        if (error.name !== 'ResourceNotFoundException') {
            todoBien = false;
        }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    if (todoBien) {
        console.log('✅ ¡TODO FUNCIONA CORRECTAMENTE!');
        console.log('   Los permisos IAM están aplicados correctamente.');
        console.log('   Puedes proceder a usar el sistema.');
    } else {
        console.log('❌ HAY PROBLEMAS');
        console.log('   Revisa los errores anteriores.');
        console.log('   Posibles causas:');
        console.log('   1. La política IAM no se aplicó correctamente');
        console.log('   2. Las tablas no existen (ejecuta create-dynamodb-tables.js)');
        console.log('   3. Usuario IAM incorrecto');
    }
    console.log('='.repeat(60) + '\n');

    return todoBien;
}

// Ejecutar
verificarPermisosIAM()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
