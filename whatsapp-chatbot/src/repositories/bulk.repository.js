/**
 * ===========================================
 * BULK MESSAGING REPOSITORY — DynamoDB
 * ===========================================
 *
 * CRUD operations for:
 * - Contact lists
 * - Contacts
 * - Bulk campaigns
 * - Bulk messages (individual send records)
 */

const logger = require('../utils/logger');
const { docClient, isConfigured, TABLES } = require('../providers/dynamodb.provider');
const { PutCommand, GetCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

class BulkRepository {

  _isAvailable() {
    return !!(isConfigured && docClient);
  }

  /**
   * Throw an explicit error if DynamoDB is not configured.
   * Use in write operations to prevent silent data loss.
   */
  _assertAvailable() {
    if (!this._isAvailable()) {
      throw new Error('DynamoDB is not configured. Check AWS credentials in .env');
    }
  }

  /**
   * BatchWrite with automatic retry for UnprocessedItems.
   * DynamoDB may return unprocessed items during throttling.
   */
  async _batchWriteWithRetry(tableName, requests, maxRetries = 3) {
    let unprocessed = requests;
    for (let attempt = 0; attempt < maxRetries && unprocessed.length > 0; attempt++) {
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: unprocessed }
      }));
      unprocessed = result.UnprocessedItems?.[tableName] || [];
      if (unprocessed.length > 0) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(r => setTimeout(r, delay));
        logger.warn(`⚠️ [BULK] ${unprocessed.length} unprocessed items, retrying (attempt ${attempt + 1})`);
      }
    }
    if (unprocessed.length > 0) {
      logger.error(`❌ [BULK] ${unprocessed.length} items failed after ${maxRetries} retries`);
    }
    return unprocessed;
  }

  // ===========================================
  // CONTACT LISTS
  // ===========================================

  /**
   * Create a new contact list
   */
  async createList(data) {
    this._assertAvailable();
    const item = {
      listId: data.listId || uuidv4(),
      name: data.name,
      originalFileName: data.originalFileName || null,
      contactCount: data.contactCount || 0,
      s3Key: data.s3Key || null,
      type: data.type || 'file', // 'file' | 'manual' | 'group'
      createdBy: data.createdBy || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: TABLES.CONTACT_LISTS,
      Item: item
    }));

    logger.info(`✅ [BULK] List created: ${item.listId} (${item.name})`);
    return item;
  }

  /**
   * Get all contact lists
   */
  async getAllLists() {
    if (!this._isAvailable()) return [];
    try {
      let allItems = [];
      let lastKey = undefined;

      do {
        const response = await docClient.send(new ScanCommand({
          TableName: TABLES.CONTACT_LISTS,
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {})
        }));
        allItems.push(...(response.Items || []));
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      logger.error('❌ [BULK] Error getting lists:', error.message);
      return [];
    }
  }

  /**
   * Get a single contact list by ID
   */
  async getListById(listId) {
    if (!this._isAvailable()) return null;
    try {
      const response = await docClient.send(new GetCommand({
        TableName: TABLES.CONTACT_LISTS,
        Key: { listId }
      }));
      return response.Item || null;
    } catch (error) {
      logger.error(`❌ [BULK] Error getting list ${listId}:`, error.message);
      return null;
    }
  }

  /**
   * Delete a contact list and all its contacts
   */
  async deleteList(listId) {
    if (!this._isAvailable()) return false;
    try {
      // Delete contacts first
      const contacts = await this.getContactsByList(listId);
      if (contacts.length > 0) {
        // Batch delete in chunks of 25
        for (let i = 0; i < contacts.length; i += 25) {
          const chunk = contacts.slice(i, i + 25);
          const deleteRequests = chunk.map(c => ({
            DeleteRequest: { Key: { contactId: c.contactId } }
          }));
          await this._batchWriteWithRetry(TABLES.CONTACTS, deleteRequests);
        }
      }

      // Delete the list
      await docClient.send(new DeleteCommand({
        TableName: TABLES.CONTACT_LISTS,
        Key: { listId }
      }));

      logger.info(`✅ [BULK] List deleted: ${listId} (${contacts.length} contacts removed)`);
      return true;
    } catch (error) {
      logger.error(`❌ [BULK] Error deleting list ${listId}:`, error.message);
      return false;
    }
  }

  /**
   * Update contact count for a list
   */
  async updateListCount(listId, count) {
    if (!this._isAvailable()) return;
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.CONTACT_LISTS,
        Key: { listId },
        UpdateExpression: 'SET contactCount = :count, updatedAt = :now',
        ExpressionAttributeValues: {
          ':count': count,
          ':now': new Date().toISOString()
        }
      }));
    } catch (error) {
      logger.error(`❌ [BULK] Error updating list count:`, error.message);
    }
  }

  /**
   * Update the name of a contact list
   */
  async updateListName(listId, name) {
    this._assertAvailable();
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.CONTACT_LISTS,
        Key: { listId },
        UpdateExpression: 'SET #name = :name, updatedAt = :now',
        ExpressionAttributeValues: {
          ':name': name,
          ':now': new Date().toISOString()
        },
        ExpressionAttributeNames: {
          '#name': 'name'
        }
      }));
      logger.info(`✅ [BULK] List ${listId} renamed to "${name}"`);
      return true;
    } catch (error) {
      logger.error(`❌ [BULK] Error renaming list:`, error.message);
      throw error;
    }
  }

  // ===========================================
  // CONTACTS
  // ===========================================

  /**
   * Add contacts to a list (batch)
   */
  async addContacts(listId, contacts) {
    this._assertAvailable();
    try {
      const items = contacts.map(c => ({
        contactId: c.contactId || uuidv4(),
        listId,
        phone: c.phone,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        createdAt: new Date().toISOString()
      }));

      // Batch write in chunks of 25
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const putRequests = chunk.map(item => ({
          PutRequest: { Item: item }
        }));
        await this._batchWriteWithRetry(TABLES.CONTACTS, putRequests);
      }

      // Update list count
      await this.updateListCount(listId, items.length);

      logger.info(`✅ [BULK] ${items.length} contacts added to list ${listId}`);
      return items;
    } catch (error) {
      logger.error(`❌ [BULK] Error adding contacts:`, error.message);
      throw error;
    }
  }

  /**
   * Get all contacts for a list
   */
  async getContactsByList(listId) {
    if (!this._isAvailable()) return [];
    try {
      let allItems = [];
      let lastKey = undefined;

      do {
        const response = await docClient.send(new QueryCommand({
          TableName: TABLES.CONTACTS,
          IndexName: 'listId-index',
          KeyConditionExpression: 'listId = :listId',
          ExpressionAttributeValues: { ':listId': listId },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {})
        }));
        allItems.push(...(response.Items || []));
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems;
    } catch (error) {
      logger.error(`❌ [BULK] Error getting contacts for list ${listId}:`, error.message);
      return [];
    }
  }

  // ===========================================
  // CAMPAIGNS
  // ===========================================

  /**
   * Create a campaign
   */
  async createCampaign(data) {
    this._assertAvailable();
    const item = {
      campaignId: data.campaignId || uuidv4(),
      name: data.name || `Campaña ${new Date().toLocaleDateString('es-CO')}`,
      messageTemplate: data.messageTemplate,
      listIds: data.listIds || [],
      totalRecipients: data.totalRecipients || 0,
      sent: 0,
      failed: 0,
      pending: data.totalRecipients || 0,
      status: data.status || 'draft', // draft, sending, completed, paused, scheduled
      scheduledAt: data.scheduledAt || null,
      batchSize: data.batchSize || 50,
      delayMs: data.delayMs || 2000,
      createdBy: data.createdBy || 'admin',
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    await docClient.send(new PutCommand({
      TableName: TABLES.BULK_CAMPAIGNS,
      Item: item
    }));

    logger.info(`✅ [BULK] Campaign created: ${item.campaignId} (${item.name})`);
    return item;
  }

  /**
   * Get all campaigns
   */
  async getAllCampaigns() {
    if (!this._isAvailable()) return [];
    try {
      let allItems = [];
      let lastKey = undefined;

      do {
        const response = await docClient.send(new ScanCommand({
          TableName: TABLES.BULK_CAMPAIGNS,
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {})
        }));
        allItems.push(...(response.Items || []));
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      logger.error('❌ [BULK] Error getting campaigns:', error.message);
      return [];
    }
  }

  /**
   * Get a campaign by ID
   */
  async getCampaignById(campaignId) {
    if (!this._isAvailable()) return null;
    try {
      const response = await docClient.send(new GetCommand({
        TableName: TABLES.BULK_CAMPAIGNS,
        Key: { campaignId }
      }));
      return response.Item || null;
    } catch (error) {
      logger.error(`❌ [BULK] Error getting campaign ${campaignId}:`, error.message);
      return null;
    }
  }

  /**
   * Update campaign progress
   */
  async updateCampaignProgress(campaignId, updates) {
    if (!this._isAvailable()) return;
    try {
      const expressions = [];
      const values = {};
      const names = {};

      if (updates.sent !== undefined) {
        expressions.push('#sent = :sent');
        values[':sent'] = updates.sent;
        names['#sent'] = 'sent';
      }
      if (updates.failed !== undefined) {
        expressions.push('failed = :failed');
        values[':failed'] = updates.failed;
      }
      if (updates.pending !== undefined) {
        expressions.push('pending = :pending');
        values[':pending'] = updates.pending;
      }
      if (updates.status) {
        expressions.push('#status = :status');
        values[':status'] = updates.status;
        names['#status'] = 'status';
      }
      if (updates.completedAt) {
        expressions.push('completedAt = :completedAt');
        values[':completedAt'] = updates.completedAt;
      }

      if (expressions.length === 0) return;

      await docClient.send(new UpdateCommand({
        TableName: TABLES.BULK_CAMPAIGNS,
        Key: { campaignId },
        UpdateExpression: 'SET ' + expressions.join(', '),
        ExpressionAttributeValues: values,
        ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {})
      }));
    } catch (error) {
      logger.error(`❌ [BULK] Error updating campaign progress:`, error.message);
    }
  }

  // ===========================================
  // BULK MESSAGES (individual send records)
  // ===========================================

  /**
   * Create bulk message records for a campaign
   */
  async createBulkMessages(campaignId, contacts, messageTemplate) {
    this._assertAvailable();
    try {
      const items = contacts.map(c => ({
        bulkMessageId: uuidv4(),
        campaignId,
        phone: c.phone,
        contactName: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
        resolvedMessage: this._resolveTemplate(messageTemplate, c),
        status: 'pending', // pending, sent, failed, retrying
        errorMessage: null,
        sentAt: null,
        attempts: 0
      }));

      // Batch write in chunks of 25
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const putRequests = chunk.map(item => ({
          PutRequest: { Item: item }
        }));
        await this._batchWriteWithRetry(TABLES.BULK_MESSAGES, putRequests);
      }

      logger.info(`✅ [BULK] ${items.length} bulk messages created for campaign ${campaignId}`);
      return items;
    } catch (error) {
      logger.error(`❌ [BULK] Error creating bulk messages:`, error.message);
      throw error;
    }
  }

  /**
   * Get all bulk messages for a campaign
   */
  async getBulkMessagesByCampaign(campaignId) {
    if (!this._isAvailable()) return [];
    try {
      let allItems = [];
      let lastKey = undefined;

      do {
        const response = await docClient.send(new QueryCommand({
          TableName: TABLES.BULK_MESSAGES,
          IndexName: 'campaignId-index',
          KeyConditionExpression: 'campaignId = :campaignId',
          ExpressionAttributeValues: { ':campaignId': campaignId },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {})
        }));
        allItems.push(...(response.Items || []));
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems;
    } catch (error) {
      logger.error(`❌ [BULK] Error getting bulk messages:`, error.message);
      return [];
    }
  }

  /**
   * Update a single bulk message status
   */
  async updateBulkMessageStatus(bulkMessageId, status, errorMessage = null) {
    if (!this._isAvailable()) return;
    try {
      let expression = 'SET #status = :status, attempts = attempts + :one';
      const values = {
        ':status': status,
        ':one': 1
      };
      const names = { '#status': 'status' };

      if (status === 'sent') {
        expression += ', sentAt = :sentAt';
        values[':sentAt'] = new Date().toISOString();
      }
      if (errorMessage) {
        expression += ', errorMessage = :errorMessage';
        values[':errorMessage'] = errorMessage;
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLES.BULK_MESSAGES,
        Key: { bulkMessageId },
        UpdateExpression: expression,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: names
      }));
    } catch (error) {
      logger.error(`❌ [BULK] Error updating bulk message:`, error.message);
    }
  }

  // ===========================================
  // MESSAGE TEMPLATES
  // ===========================================

  /**
   * Create a message template
   */
  async createTemplate(data) {
    this._assertAvailable();
    const item = {
      templateId: data.templateId || uuidv4(),
      name: data.name,
      messageTemplate: data.messageTemplate,
      createdBy: data.createdBy || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: TABLES.MESSAGE_TEMPLATES,
      Item: item
    }));

    logger.info(`✅ [BULK] Template created: ${item.templateId} (${item.name})`);
    return item;
  }

  /**
   * Get all message templates
   */
  async getAllTemplates() {
    if (!this._isAvailable()) return [];
    try {
      let allItems = [];
      let lastKey = undefined;

      do {
        const response = await docClient.send(new ScanCommand({
          TableName: TABLES.MESSAGE_TEMPLATES,
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {})
        }));
        allItems.push(...(response.Items || []));
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);

      return allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      logger.error('❌ [BULK] Error getting templates:', error.message);
      return [];
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplateById(templateId) {
    if (!this._isAvailable()) return null;
    try {
      const response = await docClient.send(new GetCommand({
        TableName: TABLES.MESSAGE_TEMPLATES,
        Key: { templateId }
      }));
      return response.Item || null;
    } catch (error) {
      logger.error(`❌ [BULK] Error getting template ${templateId}:`, error.message);
      return null;
    }
  }

  /**
   * Update a message template
   */
  async updateTemplate(templateId, data) {
    this._assertAvailable();
    try {
      const expressions = [];
      const values = {};
      const names = {};

      if (data.name !== undefined) {
        expressions.push('#name = :name');
        values[':name'] = data.name;
        names['#name'] = 'name';
      }
      if (data.messageTemplate !== undefined) {
        expressions.push('messageTemplate = :messageTemplate');
        values[':messageTemplate'] = data.messageTemplate;
      }

      expressions.push('updatedAt = :now');
      values[':now'] = new Date().toISOString();

      await docClient.send(new UpdateCommand({
        TableName: TABLES.MESSAGE_TEMPLATES,
        Key: { templateId },
        UpdateExpression: 'SET ' + expressions.join(', '),
        ExpressionAttributeValues: values,
        ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {})
      }));

      logger.info(`✅ [BULK] Template ${templateId} updated`);
      return true;
    } catch (error) {
      logger.error(`❌ [BULK] Error updating template:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a message template
   */
  async deleteTemplate(templateId) {
    this._assertAvailable();
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.MESSAGE_TEMPLATES,
        Key: { templateId }
      }));

      logger.info(`✅ [BULK] Template deleted: ${templateId}`);
      return true;
    } catch (error) {
      logger.error(`❌ [BULK] Error deleting template:`, error.message);
      throw error;
    }
  }

  // ===========================================
  // TEMPLATE HELPERS
  // ===========================================

  /**
   * Resolve template variables with contact data
   */
  _resolveTemplate(template, contact) {
    let result = template;
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';
    const phone = contact.phone || '';

    // Replace {{nombre}} — remove greeting comma if empty
    result = result.replace(/\{\{nombre\}\}/gi, firstName);
    result = result.replace(/\{\{apellido\}\}/gi, lastName);
    result = result.replace(/\{\{telefono\}\}/gi, phone);

    // Clean up double spaces and trailing commas from empty variables
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
  }
}

module.exports = new BulkRepository();
