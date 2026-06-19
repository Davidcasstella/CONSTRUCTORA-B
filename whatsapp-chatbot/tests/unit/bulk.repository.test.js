/**
 * ===========================================
 * UNIT TESTS — Bulk Repository
 * ===========================================
 *
 * Tests for:
 * - _resolveTemplate()
 * - _isAvailable()
 * - _assertAvailable()
 */

// Mock DynamoDB provider before requiring the repository
jest.mock('../../src/providers/dynamodb.provider', () => ({
  docClient: null,
  isConfigured: false,
  TABLES: {
    CONTACT_LISTS: 'test-contact-lists',
    CONTACTS: 'test-contacts',
    BULK_CAMPAIGNS: 'test-bulk-campaigns',
    BULK_MESSAGES: 'test-bulk-messages'
  }
}));

const bulkRepository = require('../../src/repositories/bulk.repository');

// ===========================================
// _resolveTemplate
// ===========================================

describe('_resolveTemplate', () => {

  test('resolves all standard variables', () => {
    const result = bulkRepository._resolveTemplate(
      'Hola {{nombre}} {{apellido}}, tu número es {{telefono}}',
      { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' }
    );
    expect(result).toBe('Hola Juan Pérez, tu número es 3001234567');
  });

  test('handles empty/missing firstName gracefully', () => {
    const result = bulkRepository._resolveTemplate(
      'Hola {{nombre}}, bienvenido',
      { firstName: null, lastName: null, phone: '3001234567' }
    );
    // Should not contain {{nombre}} placeholder
    expect(result).not.toContain('{{nombre}}');
    expect(result).toContain('bienvenido');
  });

  test('handles template with no variables', () => {
    const result = bulkRepository._resolveTemplate(
      'Mensaje sin variables de ejemplo',
      { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' }
    );
    expect(result).toBe('Mensaje sin variables de ejemplo');
  });

  test('cleans up double spaces from empty variables', () => {
    const result = bulkRepository._resolveTemplate(
      'Hola {{nombre}}  {{apellido}}, info aquí',
      { firstName: '', lastName: '', phone: '3001234567' }
    );
    // Double spaces should be collapsed to single
    expect(result).not.toContain('  ');
  });

  test('resolves variables case-insensitively', () => {
    const result = bulkRepository._resolveTemplate(
      'Hola {{NOMBRE}} {{Apellido}}',
      { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' }
    );
    expect(result).toBe('Hola Juan Pérez');
  });
});

// ===========================================
// _isAvailable / _assertAvailable
// ===========================================

describe('_isAvailable', () => {
  test('returns false when DynamoDB is not configured', () => {
    // Our mock sets isConfigured = false
    expect(bulkRepository._isAvailable()).toBe(false);
  });
});

describe('_assertAvailable', () => {
  test('throws when DynamoDB is not configured', () => {
    expect(() => bulkRepository._assertAvailable())
      .toThrow('DynamoDB is not configured');
  });
});

// ===========================================
// Write operations with DynamoDB unavailable
// ===========================================

describe('write operations when DynamoDB is unavailable', () => {
  test('createList throws instead of returning fake data', async () => {
    await expect(bulkRepository.createList({ name: 'test' }))
      .rejects.toThrow('DynamoDB is not configured');
  });

  test('addContacts throws instead of returning input', async () => {
    await expect(bulkRepository.addContacts('list-1', [{ phone: '3001234567' }]))
      .rejects.toThrow('DynamoDB is not configured');
  });

  test('createCampaign throws instead of returning fake data', async () => {
    await expect(bulkRepository.createCampaign({ messageTemplate: 'test' }))
      .rejects.toThrow('DynamoDB is not configured');
  });

  test('createBulkMessages throws instead of returning empty array', async () => {
    await expect(bulkRepository.createBulkMessages('camp-1', [{ phone: '3001234567' }], 'test'))
      .rejects.toThrow('DynamoDB is not configured');
  });
});

// ===========================================
// Read operations when DynamoDB is unavailable
// ===========================================

describe('read operations when DynamoDB is unavailable', () => {
  test('getAllLists returns empty array gracefully', async () => {
    const result = await bulkRepository.getAllLists();
    expect(result).toEqual([]);
  });

  test('getContactsByList returns empty array gracefully', async () => {
    const result = await bulkRepository.getContactsByList('nonexistent');
    expect(result).toEqual([]);
  });

  test('getAllCampaigns returns empty array gracefully', async () => {
    const result = await bulkRepository.getAllCampaigns();
    expect(result).toEqual([]);
  });

  test('getCampaignById returns null gracefully', async () => {
    const result = await bulkRepository.getCampaignById('nonexistent');
    expect(result).toBeNull();
  });
});
