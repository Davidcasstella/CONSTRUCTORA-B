/**
 * ===========================================
 * UNIT TESTS — Bulk Messaging Service
 * ===========================================
 *
 * Tests for:
 * - normalizeColombianPhone()
 * - phoneToJid()
 * - parseManualNumbers()
 * - parseFile()
 */

const bulkService = require('../../src/services/bulk.service');
const XLSX = require('xlsx');

// ===========================================
// normalizeColombianPhone
// ===========================================

describe('normalizeColombianPhone', () => {
  const normalize = bulkService.normalizeColombianPhone;

  // --- Valid numbers ---

  test('normalizes 10-digit Colombian mobile', () => {
    expect(normalize('3001234567')).toBe('3001234567');
  });

  test('normalizes with country code 57', () => {
    expect(normalize('573001234567')).toBe('3001234567');
  });

  test('normalizes with +57 prefix', () => {
    expect(normalize('+573001234567')).toBe('3001234567');
  });

  test('normalizes with spaces and dashes', () => {
    expect(normalize('300-123-4567')).toBe('3001234567');
    expect(normalize('300 123 4567')).toBe('3001234567');
  });

  test('normalizes with leading zero', () => {
    expect(normalize('03001234567')).toBe('3001234567');
  });

  test('normalizes with parentheses and dots', () => {
    expect(normalize('(300) 123.4567')).toBe('3001234567');
  });

  // --- Invalid numbers ---

  test('rejects null/undefined', () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeNull();
  });

  test('rejects empty string', () => {
    expect(normalize('')).toBeNull();
    expect(normalize('   ')).toBeNull();
  });

  test('rejects too short (less than 7 digits)', () => {
    expect(normalize('12345')).toBeNull();
    expect(normalize('123456')).toBeNull();
  });

  test('rejects non-numeric strings', () => {
    expect(normalize('abcdefghij')).toBeNull();
  });
});

// ===========================================
// phoneToJid
// ===========================================

describe('phoneToJid', () => {
  const phoneToJid = bulkService.phoneToJid;

  test('converts 10-digit Colombian to WhatsApp JID', () => {
    expect(phoneToJid('3001234567')).toBe('573001234567@s.whatsapp.net');
  });

  test('converts number already with country code', () => {
    expect(phoneToJid('573001234567')).toBe('573001234567@s.whatsapp.net');
  });
});

// ===========================================
// parseManualNumbers
// ===========================================

describe('parseManualNumbers', () => {
  const parse = bulkService.parseManualNumbers;

  test('parses comma-separated numbers', () => {
    const result = parse('3001234567, 3009876543');
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].phone).toBe('3001234567');
    expect(result.contacts[1].phone).toBe('3009876543');
  });

  test('parses newline-separated numbers', () => {
    const result = parse('3001234567\n3009876543');
    expect(result.contacts).toHaveLength(2);
  });

  test('removes duplicates and reports them', () => {
    const result = parse('3001234567\n3001234567');
    expect(result.contacts).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('duplicado'))).toBe(true);
  });

  test('reports invalid numbers in warnings', () => {
    const result = parse('3001234567\n12345\nabc');
    expect(result.contacts).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('inválido'))).toBe(true);
  });

  test('throws on empty input', () => {
    expect(() => parse('')).toThrow();
    expect(() => parse('   ')).toThrow();
  });

  test('enforces MAX_CONTACTS_PER_CAMPAIGN limit', () => {
    // Generate 1100 unique numbers
    const numbers = Array(1100)
      .fill(null)
      .map((_, i) => `30${String(i).padStart(8, '0')}`)
      .join('\n');
    const result = parse(numbers);
    expect(result.contacts.length).toBeLessThanOrEqual(bulkService.MAX_CONTACTS_PER_CAMPAIGN);
  });
});

// ===========================================
// parseFile
// ===========================================

describe('parseFile', () => {

  /**
   * Helper to create an Excel buffer from array-of-arrays
   */
  function createExcelBuffer(data, sheetName = 'Sheet1') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  test('parses Excel with standard headers', () => {
    const data = [
      ['nombre', 'telefono', 'apellido'],
      ['Juan', '3001234567', 'Pérez'],
      ['María', '3009876543', 'López'],
    ];
    const buffer = createExcelBuffer(data);
    const result = bulkService.parseFile(buffer, 'test.xlsx');

    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].phone).toBe('3001234567');
    expect(result.contacts[0].firstName).toBe('Juan');
    expect(result.contacts[0].lastName).toBe('Pérez');
  });

  test('parses Excel without headers (auto-detect)', () => {
    const data = [
      ['Juan', '3001234567'],
      ['María', '3009876543'],
    ];
    const buffer = createExcelBuffer(data);
    const result = bulkService.parseFile(buffer, 'no_headers.xlsx');

    expect(result.contacts).toHaveLength(2);
    expect(result.columns.autoDetected).toBe(true);
  });

  test('parses Excel without headers where a value contains a short alias (e.g. Castellanos has tel)', () => {
    const data = [
      ['Yolanda', 'Castellanos', '3225360130'],
      ['Carlos', 'Gómez', '3001234567'],
    ];
    const buffer = createExcelBuffer(data);
    const result = bulkService.parseFile(buffer, 'no_headers_castellanos.xlsx');

    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].phone).toBe('3225360130');
    expect(result.contacts[0].firstName).toBe('Yolanda');
    expect(result.contacts[0].lastName).toBe('Castellanos');
    expect(result.columns.autoDetected).toBe(true);
  });

  test('parses CSV content', () => {
    const csv = 'nombre,telefono\nJuan,3001234567\nMaría,3009876543';
    const buffer = Buffer.from(csv, 'utf-8');
    const result = bulkService.parseFile(buffer, 'test.csv');

    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].phone).toBe('3001234567');
  });

  test('throws when no phone column is detected', () => {
    const data = [
      ['email', 'ciudad'],
      ['juan@test.com', 'Bogotá'],
    ];
    const buffer = createExcelBuffer(data);

    expect(() => bulkService.parseFile(buffer, 'no_phone.xlsx'))
      .toThrow('No se pudo detectar la columna de teléfono');
  });

  test('removes duplicates and reports in warnings', () => {
    const data = [
      ['telefono'],
      ['3001234567'],
      ['3001234567'],
      ['3009876543'],
    ];
    const buffer = createExcelBuffer(data);
    const result = bulkService.parseFile(buffer, 'dupes.xlsx');

    expect(result.contacts).toHaveLength(2);
    expect(result.warnings.some(w => w.includes('duplicado'))).toBe(true);
  });

  test('handles Excel with country code prefixed phones', () => {
    const data = [
      ['telefono'],
      ['573001234567'],
      ['+573009876543'],
    ];
    const buffer = createExcelBuffer(data);
    const result = bulkService.parseFile(buffer, 'country_codes.xlsx');

    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].phone).toBe('3001234567');
    expect(result.contacts[1].phone).toBe('3009876543');
  });
});
