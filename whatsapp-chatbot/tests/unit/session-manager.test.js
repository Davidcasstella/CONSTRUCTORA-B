/**
 * ===========================================
 * UNIT TESTS: SessionManager
 * ===========================================
 *
 * Tests all public methods and event behaviors of SessionManager.
 * BaileysProvider is mocked to avoid real WhatsApp connections.
 *
 * Note: jest.mock() factory cannot reference out-of-scope variables
 * (like EventEmitter), so we use require() inside the factory.
 */

'use strict';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock BaileysProvider — use require() inside factory to avoid scope issues
jest.mock('../../src/providers/whatsapp/baileys.provider', () => {
  const EventEmitter = require('events');

  return class MockBaileysProvider extends EventEmitter {
    constructor(options = {}) {
      super();
      this.sessionId         = options.sessionId || 'default';
      this.authPath          = options.authPath   || '/mock/auth';
      this.isReady           = false;
      this.sock              = null;
      this.status            = 'disconnected';
      this.qrCode            = null;
      this.miNumero          = null;
      this.miNombre          = null;
      this.authFailureCount  = 0;
      this.reconnectTimeout  = null;
      this.qrTimeout         = null;
      this.qrEmitted         = false;
    }

    async initialize() {
      this.status = 'waiting';
      this.qrCode = 'data:image/png;base64,mock-qr-' + this.sessionId;
      this.emit('qr', this.qrCode);
    }

    async destroy() {
      this.isReady  = false;
      this.status   = 'disconnected';
      this.sock     = null;
    }

    getStatus() {
      return {
        status:   this.status,
        isReady:  this.isReady,
        hasQR:    !!this.qrCode,
        miNumero: this.miNumero,
        miNombre: this.miNombre,
      };
    }

    getQRCode()  { return this.qrCode; }
    getClient()  { return this.sock; }

    resetAuthFailures() {
      this.authFailureCount = 0;
    }
  };
});

// Mock fs — avoid real file operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  renameSync:  jest.fn(),
  rmSync:      jest.fn(),
  cpSync:      jest.fn(),
}));

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  let manager;
  let fsMock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    fsMock = require('fs');
    fsMock.existsSync.mockReturnValue(false);

    // Get the singleton manager (already mocked BaileysProvider)
    manager = require('../../src/providers/whatsapp/session-manager');
    // Reset internal state between tests
    manager.sessions.clear();
    manager._initialized = false;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    test('creates exactly 2 sessions (session1 and session2)', async () => {
      await manager.initialize();
      expect(manager.sessions.size).toBe(2);
      expect(manager.sessions.has('session1')).toBe(true);
      expect(manager.sessions.has('session2')).toBe(true);
    });

    test('each session has correct sessionId', async () => {
      await manager.initialize();
      expect(manager.sessions.get('session1').sessionId).toBe('session1');
      expect(manager.sessions.get('session2').sessionId).toBe('session2');
    });

    test('each session has correct authPath', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      const s2 = manager.sessions.get('session2');
      expect(s1.authPath).toContain('baileys_auth_session1');
      expect(s2.authPath).toContain('baileys_auth_session2');
    });

    test('does NOT initialize twice (idempotent)', async () => {
      await manager.initialize();
      const sizeAfterFirst = manager.sessions.size;
      await manager.initialize(); // Second call should be ignored
      expect(manager.sessions.size).toBe(sizeAfterFirst);
    });

    test('getSessionIds() returns [session1, session2]', async () => {
      await manager.initialize();
      const ids = manager.getSessionIds();
      expect(ids).toEqual(expect.arrayContaining(['session1', 'session2']));
      expect(ids).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. LEGACY AUTH MIGRATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('_migrateLegacyAuth()', () => {
    test('calls renameSync when legacy baileys_auth exists and session1 does not', async () => {
      // First call: legacy exists (true), Second call: session1 does not exist (false)
      fsMock.existsSync
        .mockReturnValueOnce(true)   // baileys_auth → exists
        .mockReturnValueOnce(false); // baileys_auth_session1 → does not exist

      await manager.initialize();
      expect(fsMock.renameSync).toHaveBeenCalled();
    });

    test('skips migration when session1 already exists', async () => {
      // Both paths return true
      fsMock.existsSync.mockReturnValue(true);

      await manager.initialize();
      expect(fsMock.renameSync).not.toHaveBeenCalled();
    });

    test('skips migration when neither legacy nor session1 exists', async () => {
      fsMock.existsSync.mockReturnValue(false);

      await manager.initialize();
      expect(fsMock.renameSync).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. QR EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('session:qr event', () => {
    test('emits session:qr with sessionId when session1 QR fires', async () => {
      await manager.initialize();
      const received = [];
      manager.on('session:qr', (data) => received.push(data));

      manager.sessions.get('session1').emit('qr', 'mock-qr-1');

      expect(received).toHaveLength(1);
      expect(received[0].sessionId).toBe('session1');
      expect(received[0].qr).toBe('mock-qr-1');
    });

    test('emits session:qr with sessionId when session2 QR fires', async () => {
      await manager.initialize();
      const received = [];
      manager.on('session:qr', (data) => received.push(data));

      manager.sessions.get('session2').emit('qr', 'mock-qr-2');

      expect(received).toHaveLength(1);
      expect(received[0].sessionId).toBe('session2');
      expect(received[0].qr).toBe('mock-qr-2');
    });

    test('both sessions emit independent QR events', async () => {
      await manager.initialize();
      const received = [];
      manager.on('session:qr', (data) => received.push(data));

      manager.sessions.get('session1').emit('qr', 'qr-1');
      manager.sessions.get('session2').emit('qr', 'qr-2');

      expect(received).toHaveLength(2);
      expect(received.map(r => r.sessionId)).toEqual(['session1', 'session2']);
      expect(received.map(r => r.qr)).toEqual(['qr-1', 'qr-2']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. READY EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('session:ready event', () => {
    test('emits session:ready with sessionId and phone number', async () => {
      await manager.initialize();
      const events = [];
      manager.on('session:ready', (data) => events.push(data));

      const s1 = manager.sessions.get('session1');
      s1.isReady  = true;
      s1.miNumero = '573001234567';
      s1.miNombre = 'Empresa Principal';
      s1.emit('ready');

      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('session1');
      expect(events[0].miNumero).toBe('573001234567');
      expect(events[0].miNombre).toBe('Empresa Principal');
    });

    test('session1 and session2 emit ready events independently', async () => {
      await manager.initialize();
      const events = [];
      manager.on('session:ready', (data) => events.push(data));

      const s1 = manager.sessions.get('session1');
      s1.isReady = true; s1.miNumero = '573001'; s1.miNombre = 'S1';
      s1.emit('ready');

      const s2 = manager.sessions.get('session2');
      s2.isReady = true; s2.miNumero = '573002'; s2.miNombre = 'S2';
      s2.emit('ready');

      expect(events).toHaveLength(2);
      expect(events[0].sessionId).toBe('session1');
      expect(events[1].sessionId).toBe('session2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. DISCONNECTED EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('session:disconnected event', () => {
    test('emits session:disconnected with sessionId and reason', async () => {
      await manager.initialize();
      const events = [];
      manager.on('session:disconnected', (data) => events.push(data));

      manager.sessions.get('session2').emit('disconnected', 'connection_closed');

      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('session2');
      expect(events[0].reason).toBe('connection_closed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. MESSAGE EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('session:message event', () => {
    test('emits session:message with sessionId for session1', async () => {
      await manager.initialize();
      const msgs = [];
      manager.on('session:message', (data) => msgs.push(data));

      const mockMsg = { from: '5730000@s.whatsapp.net', body: 'Hola', type: 'chat' };
      manager.sessions.get('session1').emit('message', mockMsg);

      expect(msgs).toHaveLength(1);
      expect(msgs[0].sessionId).toBe('session1');
      expect(msgs[0].message).toEqual(mockMsg);
    });

    test('session2 messages carry session2 id', async () => {
      await manager.initialize();
      const msgs = [];
      manager.on('session:message', (data) => msgs.push(data));

      const mockMsg = { from: '5731111@s.whatsapp.net', body: 'Test', type: 'chat' };
      manager.sessions.get('session2').emit('message', mockMsg);

      expect(msgs[0].sessionId).toBe('session2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  describe('getSession()', () => {
    test('returns the correct BaileysProvider for session1', async () => {
      await manager.initialize();
      const s1 = manager.getSession('session1');
      expect(s1).toBeDefined();
      expect(s1.sessionId).toBe('session1');
    });

    test('returns undefined for non-existent session', async () => {
      await manager.initialize();
      expect(manager.getSession('session99')).toBeUndefined();
    });
  });

  describe('getDefaultSession()', () => {
    test('returns session1 as the default session', async () => {
      await manager.initialize();
      const def = manager.getDefaultSession();
      expect(def).toBeDefined();
      expect(def.sessionId).toBe('session1');
    });
  });

  describe('getStatus()', () => {
    test('returns status object with sessionId field', async () => {
      await manager.initialize();
      const status = manager.getStatus('session1');
      expect(status).toMatchObject({ sessionId: 'session1', status: 'disconnected', isReady: false });
    });

    test('returns null for non-existent session', async () => {
      await manager.initialize();
      expect(manager.getStatus('session99')).toBeNull();
    });
  });

  describe('getAllStatuses()', () => {
    test('returns status for both sessions', async () => {
      await manager.initialize();
      const all = manager.getAllStatuses();
      expect(Object.keys(all)).toEqual(expect.arrayContaining(['session1', 'session2']));
      expect(all.session1.sessionId).toBe('session1');
      expect(all.session2.sessionId).toBe('session2');
    });
  });

  describe('getQRCode()', () => {
    test('returns QR for the correct session', async () => {
      await manager.initialize();
      manager.sessions.get('session1').qrCode = 'qr-session1';
      expect(manager.getQRCode('session1')).toBe('qr-session1');
      expect(manager.getQRCode('session2')).toBeNull();
    });

    test('returns null for non-existent session', async () => {
      await manager.initialize();
      expect(manager.getQRCode('doesNotExist')).toBeNull();
    });
  });

  describe('getClient()', () => {
    test('returns null when session has no sock', async () => {
      await manager.initialize();
      expect(manager.getClient('session1')).toBeNull();
    });

    test('returns sock when session is connected', async () => {
      await manager.initialize();
      const mockSock = { sendMessage: jest.fn() };
      manager.sessions.get('session1').sock = mockSock;
      expect(manager.getClient('session1')).toBe(mockSock);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. FIND SESSION BY PHONE
  // ─────────────────────────────────────────────────────────────────────────

  describe('findSessionByPhone()', () => {
    test('finds session1 by its phone number', async () => {
      await manager.initialize();
      manager.sessions.get('session1').miNumero = '573001234567';
      manager.sessions.get('session2').miNumero = '573117654321';

      const found = manager.findSessionByPhone('573001234567');
      expect(found).toBeDefined();
      expect(found.sessionId).toBe('session1');
    });

    test('finds session2 by its phone number', async () => {
      await manager.initialize();
      manager.sessions.get('session1').miNumero = '573001234567';
      manager.sessions.get('session2').miNumero = '573117654321';

      const found = manager.findSessionByPhone('573117654321');
      expect(found.sessionId).toBe('session2');
    });

    test('returns null when phone not found in any session', async () => {
      await manager.initialize();
      expect(manager.findSessionByPhone('5799999')).toBeNull();
    });

    test('handles null phone gracefully', async () => {
      await manager.initialize();
      expect(manager.findSessionByPhone(null)).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. SESSION ISOLATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('Session isolation', () => {
    test('connecting session1 does not affect session2 state', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      const s2 = manager.sessions.get('session2');

      s1.isReady = true; s1.status = 'connected'; s1.miNumero = '573001234567';

      expect(s2.isReady).toBe(false);
      expect(s2.status).toBe('disconnected');
      expect(s2.miNumero).toBeNull();
    });

    test('QR for session2 does not overwrite session1 QR', async () => {
      await manager.initialize();
      manager.sessions.get('session1').qrCode = 'qr-for-session1';
      manager.sessions.get('session2').qrCode = 'qr-for-session2';

      expect(manager.getQRCode('session1')).toBe('qr-for-session1');
      expect(manager.getQRCode('session2')).toBe('qr-for-session2');
    });

    test('session1 ready event does not trigger session2 listeners', async () => {
      await manager.initialize();
      const s2ReadyHandler = jest.fn();
      manager.sessions.get('session2').on('ready', s2ReadyHandler);

      manager.sessions.get('session1').emit('ready');

      expect(s2ReadyHandler).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. CONNECT ALL
  // ─────────────────────────────────────────────────────────────────────────

  describe('connectAll()', () => {
    test('calls initialize() on each session', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      const s2 = manager.sessions.get('session2');
      const spy1 = jest.spyOn(s1, 'initialize');
      const spy2 = jest.spyOn(s2, 'initialize');

      await manager.connectAll();

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    test('emits session:qr for both sessions after connectAll()', async () => {
      await manager.initialize();
      const qrEvents = [];
      manager.on('session:qr', (data) => qrEvents.push(data));

      await manager.connectAll();

      expect(qrEvents.length).toBeGreaterThanOrEqual(2);
      const sessionIds = qrEvents.map(e => e.sessionId);
      expect(sessionIds).toContain('session1');
      expect(sessionIds).toContain('session2');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. DESTROY
  // ─────────────────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    test('calls destroy() on each session', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      const s2 = manager.sessions.get('session2');
      const spy1 = jest.spyOn(s1, 'destroy');
      const spy2 = jest.spyOn(s2, 'destroy');

      await manager.destroy();

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. CLEAR SESSION
  // ─────────────────────────────────────────────────────────────────────────

  describe('clearSession()', () => {
    test('throws if session does not exist', async () => {
      await manager.initialize();
      await expect(manager.clearSession('invalidSession'))
        .rejects.toThrow('Session invalidSession not found');
    });

    test('resets session state after clearing', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      s1.isReady  = true;
      s1.miNumero = '573001234567';
      s1.status   = 'connected';
      s1.sock     = {
        ev: { removeAllListeners: jest.fn() },
        logout: jest.fn().mockResolvedValue(),
        end: jest.fn(),
      };

      await manager.clearSession('session1');

      expect(s1.isReady).toBe(false);
      expect(s1.status).toBe('disconnected');
      expect(s1.miNumero).toBeNull();
    });

    test('deletes auth files when they exist', async () => {
      await manager.initialize();
      const s1 = manager.sessions.get('session1');
      s1.sock = {
        ev: { removeAllListeners: jest.fn() },
        logout: jest.fn().mockResolvedValue(),
        end: jest.fn(),
      };
      fsMock.existsSync.mockReturnValue(true); // auth path exists after clearing

      await manager.clearSession('session1');

      expect(fsMock.rmSync).toHaveBeenCalled();
    });
  });
});
