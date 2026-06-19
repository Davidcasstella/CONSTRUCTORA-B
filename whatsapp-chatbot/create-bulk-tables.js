/**
 * ===========================================
 * SCRIPT TO CREATE BULK MESSAGING DYNAMODB TABLES
 * ===========================================
 *
 * Creates the 5 tables needed for the Bulk Messaging feature.
 * Table names are read from environment variables.
 *
 * Run: node create-bulk-tables.js
 */

require('dotenv').config();

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const logger = require('./src/utils/logger');

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function tableExists(tableName) {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') return false;
    throw error;
  }
}

async function createTable(tableName, params) {
  if (await tableExists(tableName)) {
    logger.info(`✅ Table ${tableName} already exists`);
    return;
  }

  logger.info(`📋 Creating table ${tableName}...`);
  try {
    await dynamoClient.send(new CreateTableCommand(params));
    logger.info(`✅ Table ${tableName} created successfully`);
  } catch (error) {
    logger.error(`❌ Error creating table ${tableName}:`, error);
    throw error;
  }
}

async function main() {
  try {
    logger.info('🚀 Creating Bulk Messaging DynamoDB tables...');

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('❌ AWS credentials not configured in .env');
    }

    const contactListsTable = process.env.DYNAMODB_CONTACT_LISTS_TABLE || 'chatbot-contact-lists';
    const contactsTable = process.env.DYNAMODB_CONTACTS_TABLE || 'chatbot-contacts';
    const bulkCampaignsTable = process.env.DYNAMODB_BULK_CAMPAIGNS_TABLE || 'chatbot-bulk-campaigns';
    const bulkMessagesTable = process.env.DYNAMODB_BULK_MESSAGES_TABLE || 'chatbot-bulk-messages';
    const messageTemplatesTable = process.env.DYNAMODB_MESSAGE_TEMPLATES_TABLE || 'chatbot-message-templates';

    // 1. Contact Lists table
    await createTable(contactListsTable, {
      TableName: contactListsTable,
      AttributeDefinitions: [
        { AttributeName: 'listId', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'listId', KeyType: 'HASH' }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [
        { Key: 'Project', Value: 'Chatbot' },
        { Key: 'Feature', Value: 'BulkMessaging' }
      ]
    });

    // 2. Contacts table (with GSI on listId)
    await createTable(contactsTable, {
      TableName: contactsTable,
      AttributeDefinitions: [
        { AttributeName: 'contactId', AttributeType: 'S' },
        { AttributeName: 'listId', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'contactId', KeyType: 'HASH' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'listId-index',
          KeySchema: [
            { AttributeName: 'listId', KeyType: 'HASH' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [
        { Key: 'Project', Value: 'Chatbot' },
        { Key: 'Feature', Value: 'BulkMessaging' }
      ]
    });

    // 3. Bulk Campaigns table
    await createTable(bulkCampaignsTable, {
      TableName: bulkCampaignsTable,
      AttributeDefinitions: [
        { AttributeName: 'campaignId', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'campaignId', KeyType: 'HASH' }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [
        { Key: 'Project', Value: 'Chatbot' },
        { Key: 'Feature', Value: 'BulkMessaging' }
      ]
    });

    // 4. Bulk Messages table (with GSI on campaignId)
    await createTable(bulkMessagesTable, {
      TableName: bulkMessagesTable,
      AttributeDefinitions: [
        { AttributeName: 'bulkMessageId', AttributeType: 'S' },
        { AttributeName: 'campaignId', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'bulkMessageId', KeyType: 'HASH' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'campaignId-index',
          KeySchema: [
            { AttributeName: 'campaignId', KeyType: 'HASH' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [
        { Key: 'Project', Value: 'Chatbot' },
        { Key: 'Feature', Value: 'BulkMessaging' }
      ]
    });

    // 5. Message Templates table
    await createTable(messageTemplatesTable, {
      TableName: messageTemplatesTable,
      AttributeDefinitions: [
        { AttributeName: 'templateId', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'templateId', KeyType: 'HASH' }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      Tags: [
        { Key: 'Project', Value: 'Chatbot' },
        { Key: 'Feature', Value: 'BulkMessaging' }
      ]
    });

    logger.info('');
    logger.info('✅ All Bulk Messaging tables are ready!');
    logger.info('   Tables created:');
    logger.info(`   - ${contactListsTable}`);
    logger.info(`   - ${contactsTable}`);
    logger.info(`   - ${bulkCampaignsTable}`);
    logger.info(`   - ${bulkMessagesTable}`);
    logger.info(`   - ${messageTemplatesTable}`);

  } catch (error) {
    logger.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
