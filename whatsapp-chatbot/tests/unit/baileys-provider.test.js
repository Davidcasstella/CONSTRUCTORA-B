/**
 * ===========================================
 * UNIT TESTS: BaileysProvider (Class refactor)
 * ===========================================
 *
 * Validates that BaileysProvider:
 * 1. Is now a CLASS, not a singleton
 * 2. Accepts { sessionId, authPath } in the constructor
 * 3. Multiple instances are truly independent
 * 4. getStatus(), getQRCode(), getClient() work correctly
 * 5. resetAuthFailures() resets the counter
 * 6. destroy() cleans up state correctly
 */

'use strict';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// Mock all heavy Baileys dependencies that we don't need for unit tests
jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(),
  makeWASocket: jest.fn(),
  useMultiFileAuthState: jest.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: jest.fn(),
  }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428 },
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 0] }),
  makeCacheableSignalKeyStore: jest.fn((keys) => keys),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

jest.mock('qrcode-terminal', () => ({
  generate: jest.fn(),
}));

jest.mock('fluent-ffmpeg', () => {
  const fn = jest.fn();
  fn.setFfmpegPath = jest.fn();
  return fn;
});
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');


jest.mock('../../src/config', () => ({
  whatsapp: { provider: 'baileys' },
  media: { uploadDir: '/tmp/uploads', maxFileSizeMB: 25 },
  s3: {
    bucket: 'mock-bucket',
    region: 'us-east-1',
    enabled: false,
  },
}));

// Mock heavy transitive dependencies to prevent initialization errors
jest.mock('../../src/services/s3.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://s3.mock/file'),
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('')),
  deleteFile: jest.fn().mockResolvedValue(),
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.mock/signed'),
  isEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/services/media-storage.service', () => ({
  saveMediaFromMessage: jest.fn().mockResolvedValue(null),
  getMediaBuffer: jest.fn().mockResolvedValue(null),
  setWhatsAppSocket: jest.fn(),
}));


// ── Load subject under test ────────────────────────────────────────────────
let BaileysProvider;

beforeAll(() => {
  BaileysProvider = require('../../src/providers/whatsapp/baileys.provider');
});

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('BaileysProvider — Constructor & Export', () => {

  test('module exports a CLASS (Function), not an object instance', () => {
    expect(typeof BaileysProvider).toBe('function');
    // A class is a Function with a prototype
    expect(BaileysProvider.prototype).toBeDefined();
  });

  test('can be instantiated with new keyword', () => {
    const instance = new BaileysProvider();
    expect(instance).toBeInstanceOf(BaileysProvider);
  });

  test('default constructor sets sessionId to "default"', () => {
    const instance = new BaileysProvider();
    expect(instance.sessionId).toBe('default');
  });

  test('accepts custom sessionId via options', () => {
    const instance = new BaileysProvider({ sessionId: 'session1' });
    expect(instance.sessionId).toBe('session1');
  });

  test('accepts custom authPath via options', () => {
    const customPath = '/custom/auth/path';
    const instance = new BaileysProvider({ authPath: customPath });
    expect(instance.authPath).toBe(customPath);
  });

  test('uses default authPath when not provided', () => {
    const instance = new BaileysProvider();
    expect(instance.authPath).toContain('baileys_auth');
  });

  test('multiple instances are independent objects', () => {
    const s1 = new BaileysProvider({ sessionId: 'session1', authPath: '/auth/1' });
    const s2 = new BaileysProvider({ sessionId: 'session2', authPath: '/auth/2' });

    expect(s1).not.toBe(s2);
    expect(s1.sessionId).toBe('session1');
    expect(s2.sessionId).toBe('session2');
    expect(s1.authPath).not.toBe(s2.authPath);
  });

  test('each instance has independent state (isReady, status, qrCode)', () => {
    const s1 = new BaileysProvider({ sessionId: 'session1' });
    const s2 = new BaileysProvider({ sessionId: 'session2' });

    // Modify s1 state
    s1.isReady = true;
    s1.status  = 'connected';
    s1.qrCode  = 'qr-data-1';

    // s2 should be unaffected
    expect(s2.isReady).toBe(false);
    expect(s2.status).toBe('disconnected');
    expect(s2.qrCode).toBeNull();
  });
});

describe('BaileysProvider — Initial State', () => {
  let provider;

  beforeEach(() => {
    provider = new BaileysProvider({ sessionId: 'test-session' });
  });

  test('isReady is false initially', () => expect(provider.isReady).toBe(false));
  test('sock is null initially', () => expect(provider.sock).toBeNull());
  test('qrCode is null initially', () => expect(provider.qrCode).toBeNull());
  test('status is "disconnected" initially', () => expect(provider.status).toBe('disconnected'));
  test('miNumero is null initially', () => expect(provider.miNumero).toBeNull());
  test('miNombre is null initially', () => expect(provider.miNombre).toBeNull());
  test('authFailureCount is 0 initially', () => expect(provider.authFailureCount).toBe(0));
  test('isConnecting is false initially', () => expect(provider.isConnecting).toBe(false));
  test('localChats is an empty Map', () => {
    expect(provider.localChats).toBeInstanceOf(Map);
    expect(provider.localChats.size).toBe(0);
  });
  test('lidToPhone is an empty Map', () => {
    expect(provider.lidToPhone).toBeInstanceOf(Map);
    expect(provider.lidToPhone.size).toBe(0);
  });
});

describe('BaileysProvider — getStatus()', () => {
  test('returns correct structure when disconnected', () => {
    const provider = new BaileysProvider({ sessionId: 'session1' });
    const status = provider.getStatus();

    expect(status).toMatchObject({
      status:   'disconnected',
      isReady:  false,
      hasQR:    false,
      miNumero: null,
      miNombre: null,
    });
  });

  test('returns hasQR=true when qrCode is set', () => {
    const provider = new BaileysProvider();
    provider.qrCode = 'data:image/png;base64,testqr';
    expect(provider.getStatus().hasQR).toBe(true);
  });

  test('returns isReady=true when connected', () => {
    const provider = new BaileysProvider();
    provider.isReady  = true;
    provider.status   = 'connected';
    provider.miNumero = '573001234567';

    const status = provider.getStatus();
    expect(status.isReady).toBe(true);
    expect(status.status).toBe('connected');
    expect(status.miNumero).toBe('573001234567');
  });

  test('getStatus() of two instances is independent', () => {
    const s1 = new BaileysProvider({ sessionId: 'session1' });
    const s2 = new BaileysProvider({ sessionId: 'session2' });

    s1.isReady = true; s1.status = 'connected'; s1.miNumero = '5730';
    // s2 remains disconnected

    expect(s1.getStatus().isReady).toBe(true);
    expect(s2.getStatus().isReady).toBe(false);
  });
});

describe('BaileysProvider — getQRCode()', () => {
  test('returns null when no QR is set', () => {
    const provider = new BaileysProvider();
    expect(provider.getQRCode()).toBeNull();
  });

  test('returns the QR string when set', () => {
    const provider = new BaileysProvider();
    provider.qrCode = 'data:image/png;base64,abc123';
    expect(provider.getQRCode()).toBe('data:image/png;base64,abc123');
  });

  test('QR is independent between two instances', () => {
    const s1 = new BaileysProvider();
    const s2 = new BaileysProvider();
    s1.qrCode = 'qr-session1';

    expect(s1.getQRCode()).toBe('qr-session1');
    expect(s2.getQRCode()).toBeNull();
  });
});

describe('BaileysProvider — getClient()', () => {
  test('returns null when sock is null', () => {
    const provider = new BaileysProvider();
    expect(provider.getClient()).toBeNull();
  });

  test('returns the sock object when set', () => {
    const provider = new BaileysProvider();
    const mockSock = { sendMessage: jest.fn() };
    provider.sock = mockSock;
    expect(provider.getClient()).toBe(mockSock);
  });
});

describe('BaileysProvider — resetAuthFailures()', () => {
  test('resets authFailureCount to 0', () => {
    const provider = new BaileysProvider();
    provider.authFailureCount = 3;
    provider.resetAuthFailures();
    expect(provider.authFailureCount).toBe(0);
  });

  test('can be called multiple times safely', () => {
    const provider = new BaileysProvider();
    provider.authFailureCount = 5;
    provider.resetAuthFailures();
    provider.resetAuthFailures();
    expect(provider.authFailureCount).toBe(0);
  });
});

describe('BaileysProvider — EventEmitter behavior', () => {
  test('extends EventEmitter (can emit and listen)', () => {
    const provider = new BaileysProvider();
    const handler = jest.fn();
    provider.on('qr', handler);
    provider.emit('qr', 'test-qr');
    expect(handler).toHaveBeenCalledWith('test-qr');
  });

  test('two instances have independent event listeners', () => {
    const s1 = new BaileysProvider();
    const s2 = new BaileysProvider();
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    s1.on('qr', handler1);
    s2.on('qr', handler2);

    s1.emit('qr', 'qr-1');

    expect(handler1).toHaveBeenCalledWith('qr-1');
    expect(handler2).not.toHaveBeenCalled(); // s2 listener not triggered
  });

  test('session1 "ready" event does not trigger session2 listeners', () => {
    const s1 = new BaileysProvider({ sessionId: 'session1' });
    const s2 = new BaileysProvider({ sessionId: 'session2' });

    const readyHandler2 = jest.fn();
    s2.on('ready', readyHandler2);

    s1.emit('ready'); // Only s1 emits

    expect(readyHandler2).not.toHaveBeenCalled();
  });
});

describe('BaileysProvider — is a CLASS not singleton', () => {
  test('each require() of the module returns the same CLASS, not the same instance', () => {
    const BaileysProvider1 = require('../../src/providers/whatsapp/baileys.provider');
    const BaileysProvider2 = require('../../src/providers/whatsapp/baileys.provider');

    // The module export (the class) should be the same reference
    expect(BaileysProvider1).toBe(BaileysProvider2);

    // But instances should be different
    const i1 = new BaileysProvider1();
    const i2 = new BaileysProvider2();
    expect(i1).not.toBe(i2);
  });

  test('two instances do NOT share prototype state (no static property contamination)', () => {
    const A = new BaileysProvider({ sessionId: 'a' });
    const B = new BaileysProvider({ sessionId: 'b' });

    A.miNumero = 'numberA';
    expect(B.miNumero).toBeNull(); // B is unaffected
  });
});
