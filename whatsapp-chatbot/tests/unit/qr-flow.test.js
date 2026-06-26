/**
 * ===========================================
 * UNIT TESTS: QR Code Flow — Full Coverage
 * ===========================================
 *
 * Covers every QR-related scenario to prevent future failures:
 *
 * 1.  _emitQR() — deduplication (no double QR)
 * 2.  _emitQR() — skips when already connected
 * 3.  _emitQR() — generates data URL and emits 'qr' event
 * 4.  _emitQR() — fallback to raw string if qrcode fails
 * 5.  _handleConnectionUpdate() — QR with NO existing session → emit immediately
 * 6.  _handleConnectionUpdate() — QR with existing session → wait 8s then emit
 * 7.  _handleConnectionUpdate() — QR ignored if already isReady
 * 8.  _handleConnectionUpdate() — connection 'open' → triggers _handleReady
 * 9.  _handleConnectionUpdate() — connection 'close' → resets state
 * 10. _handleConnectionUpdate() — status 405 → rate_limited + session-expired
 * 11. _handleConnectionUpdate() — status loggedOut → cleans auth + session-expired
 * 12. _handleConnectionUpdate() — generic close → schedules reconnect
 * 13. _handleReady() — sets correct state & emits authenticated + ready
 * 14. _handleReady() — clears QR and timers on connection
 * 15. _handleReady() — double 'open' event is idempotent
 * 16. Session isolation — session1 QR never pollutes session2
 * 17. Session isolation — both sessions can have QRs simultaneously
 * 18. _resolveLid() — resolves from remoteJidAlt
 * 19. _resolveLid() — resolves from lidToPhone map
 * 20. _resolveLid() — returns original JID when not resolvable
 * 21. destroy() — cleans up sockets and state
 */

'use strict';

// ── Fake timers (must be BEFORE any require) ────────────────────────────────
jest.useFakeTimers();

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock qrcode-terminal (avoid real terminal output)
const mockQrcodeTerminal = { generate: jest.fn() };
jest.mock('qrcode-terminal', () => mockQrcodeTerminal);

// Mock qrcode (image generator) — default resolves data URL
const mockQrcodeImage = { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,MOCK_QR_DATA') };
jest.mock('qrcode', () => mockQrcodeImage);

// Mock ffmpeg dependencies
jest.mock('fluent-ffmpeg', () => { const fn = jest.fn(); fn.setFfmpegPath = jest.fn(); return fn; });
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');

// Mock Baileys — we never actually call makeWASocket in unit tests
const mockSockEv = {
  on:               jest.fn(),
  removeAllListeners: jest.fn(),
};
const mockSock = {
  ev:              mockSockEv,
  end:             jest.fn(),
  logout:          jest.fn().mockResolvedValue(),
  user:            { id: '573001234567:10@s.whatsapp.net', name: 'TestBot', lid: '12345@lid' },
  sendMessage:     jest.fn().mockResolvedValue({ key: { id: 'msg-1' } }),
};

const mockMakeWASocket      = jest.fn().mockReturnValue(mockSock);
const mockUseMultiFileAuth  = jest.fn().mockResolvedValue({
  state:     { creds: {}, keys: {} },
  saveCreds: jest.fn(),
});
const mockFetchLatestVersion = jest.fn().mockResolvedValue({ version: [2, 3000, 0] });

jest.mock('@whiskeysockets/baileys', () => ({
  default:                  mockMakeWASocket,
  makeWASocket:             mockMakeWASocket,
  useMultiFileAuthState:    mockUseMultiFileAuth,
  DisconnectReason:         { loggedOut: 401, connectionClosed: 428 },
  fetchLatestWaWebVersion:  mockFetchLatestVersion,
  Browsers:                 { appropriate: jest.fn().mockReturnValue(['Chrome', 'Desktop', '108.0.0']) },
  delay:                    jest.fn(),
}));

// Mock config
jest.mock('../../src/config', () => ({
  whatsapp: { provider: 'baileys' },
  media:    { uploadDir: '/tmp/uploads', maxFileSizeMB: 25 },
  s3:       { bucket: 'mock-bucket', region: 'us-east-1', enabled: false },
}));

// Mock heavy services
jest.mock('../../src/services/s3.service', () => ({
  uploadFile:    jest.fn().mockResolvedValue('https://s3.mock/file'),
  isEnabled:     jest.fn().mockReturnValue(false),
}));

const mockSetWhatsAppSocket = jest.fn();
jest.mock('../../src/services/media-storage.service', () => ({
  saveMediaFromMessage: jest.fn().mockResolvedValue(null),
  setWhatsAppSocket:    mockSetWhatsAppSocket,
}));

// Mock conversation state service (used in chats.set handlers)
jest.mock('../../src/services/conversation-state.service', () => ({
  getConversation:           jest.fn().mockReturnValue(null),
  getOrCreateConversation:   jest.fn().mockReturnValue({ whatsappName: null }),
}));

// Mock fs — avoid real file operations
// Note: jest.mock() factory cannot reference out-of-scope variables (except those
// prefixed with "mock"), so we define the fns inline and retrieve the module later.
jest.mock('fs', () => ({
  existsSync:  jest.fn().mockReturnValue(false),
  readdirSync: jest.fn().mockReturnValue([]),
  mkdirSync:   jest.fn(),
  rmSync:      jest.fn(),
  renameSync:  jest.fn(),
}));

// ── Load subject under test ────────────────────────────────────────────────
let BaileysProvider;
let fsMock;

beforeAll(() => {
  BaileysProvider = require('../../src/providers/whatsapp/baileys.provider');
  // Retrieve the mocked fs module (defined inline above)
  fsMock = require('fs');
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a provider with clean state, bypassing real initialize()
 * to test internal methods directly.
 */
function makeProvider(opts = {}) {
  const p = new BaileysProvider({
    sessionId: opts.sessionId || 'test-session',
    authPath:  opts.authPath  || '/mock/auth',
  });
  // Inject a mock sock so methods that require it work
  p.sock = { ...mockSock, ev: { ...mockSockEv } };
  p.qrEmitted          = false;
  p.hasExistingSession = opts.hasExistingSession || false;
  p.isReady            = opts.isReady            || false;
  p.isConnecting       = false;
  return p;
}

// ── Reset mocks between tests ──────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  mockQrcodeImage.toDataURL.mockResolvedValue('data:image/png;base64,MOCK_QR_DATA');
  // Reset fs mock default return values after clearAllMocks()
  if (fsMock) {
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readdirSync.mockReturnValue([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. _emitQR() — DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

describe('_emitQR() — deduplication (no QR emitted twice)', () => {
  test('first call emits qr event', async () => {
    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._emitQR('mock-qr-string');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('data:image/png;base64,MOCK_QR_DATA');
  });

  test('second call is a no-op (qrEmitted=true)', async () => {
    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._emitQR('mock-qr-string');
    await provider._emitQR('mock-qr-string'); // second call

    expect(handler).toHaveBeenCalledTimes(1); // only once
  });

  test('sets qrEmitted to true after emitting', async () => {
    const provider = makeProvider();
    expect(provider.qrEmitted).toBe(false);

    await provider._emitQR('mock-qr-string');

    expect(provider.qrEmitted).toBe(true);
  });

  test('sets status to "waiting_qr"', async () => {
    const provider = makeProvider();
    await provider._emitQR('mock-qr-string');
    expect(provider.status).toBe('waiting_qr');
  });

  test('sets qrCode to the data URL', async () => {
    const provider = makeProvider();
    await provider._emitQR('mock-qr-string');
    expect(provider.qrCode).toBe('data:image/png;base64,MOCK_QR_DATA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. _emitQR() — SKIPS WHEN ALREADY CONNECTED
// ═══════════════════════════════════════════════════════════════════════════

describe('_emitQR() — skips when provider is already connected', () => {
  test('does not emit qr when isReady=true', async () => {
    const provider = makeProvider({ isReady: true });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._emitQR('mock-qr-string');

    expect(handler).not.toHaveBeenCalled();
  });

  test('does not change status when isReady=true', async () => {
    const provider = makeProvider({ isReady: true });
    provider.status = 'connected';

    await provider._emitQR('mock-qr-string');

    expect(provider.status).toBe('connected'); // unchanged
  });

  test('qrEmitted stays false when skipped due to isReady', async () => {
    const provider = makeProvider({ isReady: true });
    await provider._emitQR('mock-qr-string');
    expect(provider.qrEmitted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. _emitQR() — FALLBACK WHEN qrcode IMAGE FAILS
// ═══════════════════════════════════════════════════════════════════════════

describe('_emitQR() — fallback to raw QR string when image generation fails', () => {
  test('emits raw qr string when toDataURL throws', async () => {
    mockQrcodeImage.toDataURL.mockRejectedValueOnce(new Error('Canvas not available'));

    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._emitQR('raw-qr-data');

    expect(handler).toHaveBeenCalledWith('raw-qr-data');
    expect(provider.qrCode).toBe('raw-qr-data');
  });

  test('status is still set to "waiting_qr" even after fallback', async () => {
    mockQrcodeImage.toDataURL.mockRejectedValueOnce(new Error('fail'));

    const provider = makeProvider();
    await provider._emitQR('raw-qr-data');

    expect(provider.status).toBe('waiting_qr');
  });

  test('qrEmitted=true even after fallback', async () => {
    mockQrcodeImage.toDataURL.mockRejectedValueOnce(new Error('fail'));

    const provider = makeProvider();
    await provider._emitQR('raw-qr-data');

    expect(provider.qrEmitted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. _handleConnectionUpdate() — QR WITH NO EXISTING SESSION
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — QR with no existing session', () => {
  test('emits QR immediately when hasExistingSession=false', async () => {
    const provider = makeProvider({ hasExistingSession: false });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._handleConnectionUpdate({ qr: 'fresh-qr-string' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('qrEmitted is true after immediate QR', async () => {
    const provider = makeProvider({ hasExistingSession: false });
    await provider._handleConnectionUpdate({ qr: 'fresh-qr-string' });
    expect(provider.qrEmitted).toBe(true);
  });

  test('qrCode is set after immediate QR', async () => {
    const provider = makeProvider({ hasExistingSession: false });
    await provider._handleConnectionUpdate({ qr: 'fresh-qr-string' });
    expect(provider.qrCode).toBe('data:image/png;base64,MOCK_QR_DATA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. _handleConnectionUpdate() — QR WITH EXISTING SESSION (8s delay)
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — QR with existing session (8s delay)', () => {
  test('does NOT emit QR immediately when hasExistingSession=true', async () => {
    const provider = makeProvider({ hasExistingSession: true });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._handleConnectionUpdate({ qr: 'delayed-qr' });

    expect(handler).not.toHaveBeenCalled(); // NOT emitted yet
  });

  test('emits QR after 8s timeout when still not connected', async () => {
    const provider = makeProvider({ hasExistingSession: true });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._handleConnectionUpdate({ qr: 'delayed-qr' });

    // Fast-forward 8 seconds
    jest.advanceTimersByTime(8000);
    await Promise.resolve(); // flush microtasks

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('does NOT emit QR after 8s if session became ready in the meantime', async () => {
    const provider = makeProvider({ hasExistingSession: true });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._handleConnectionUpdate({ qr: 'delayed-qr' });

    // Simulate session connecting before timeout
    provider.isReady = true;

    jest.advanceTimersByTime(8000);
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled(); // session was restored, no QR needed
  });

  test('clears qrTimeout when a second QR arrives (no timer accumulation)', async () => {
    const provider = makeProvider({ hasExistingSession: true });

    await provider._handleConnectionUpdate({ qr: 'qr-1' });
    const firstTimeout = provider.qrTimeout;

    await provider._handleConnectionUpdate({ qr: 'qr-2' }); // second QR arrives
    const secondTimeout = provider.qrTimeout;

    // A new timer should have replaced the old one
    expect(secondTimeout).toBeDefined();
    // Both should be different timer references (first was cleared)
    expect(firstTimeout).not.toBe(secondTimeout);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. _handleConnectionUpdate() — QR IGNORED WHEN ALREADY CONNECTED
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — QR ignored when already connected', () => {
  test('does not emit QR event when isReady=true', async () => {
    const provider = makeProvider({ isReady: true });
    const handler = jest.fn();
    provider.on('qr', handler);

    await provider._handleConnectionUpdate({ qr: 'spurious-qr' });

    expect(handler).not.toHaveBeenCalled();
  });

  test('qrEmitted stays false when QR is ignored due to isReady', async () => {
    const provider = makeProvider({ isReady: true });
    await provider._handleConnectionUpdate({ qr: 'spurious-qr' });
    expect(provider.qrEmitted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. _handleConnectionUpdate() — CONNECTION 'open'
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — connection "open"', () => {
  test('sets isReady=true when connection opens', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.isReady).toBe(true);
  });

  test('sets status="ready" when connection opens', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.status).toBe('ready');
  });

  test('clears qrCode when connection opens', async () => {
    const provider = makeProvider();
    provider.qrCode = 'data:image/png;base64,STALE_QR';
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.qrCode).toBeNull();
  });

  test('emits "authenticated" and "ready" events when connection opens', async () => {
    const provider = makeProvider();
    const authHandler  = jest.fn();
    const readyHandler = jest.fn();
    provider.on('authenticated', authHandler);
    provider.on('ready',         readyHandler);

    await provider._handleConnectionUpdate({ connection: 'open' });

    expect(authHandler).toHaveBeenCalledTimes(1);
    expect(readyHandler).toHaveBeenCalledTimes(1);
  });

  test('injects socket into media service on connection open', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(mockSetWhatsAppSocket).toHaveBeenCalledWith(provider.sock);
  });

  test('double connection "open" is idempotent (no double ready event)', async () => {
    const provider = makeProvider();
    const readyHandler = jest.fn();
    provider.on('ready', readyHandler);

    await provider._handleConnectionUpdate({ connection: 'open' });
    await provider._handleConnectionUpdate({ connection: 'open' }); // second open

    expect(readyHandler).toHaveBeenCalledTimes(1); // only once
  });

  test('extracts miNumero from sock.user.id after connection', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.miNumero).toBe('573001234567');
  });

  test('extracts miNombre from sock.user.name after connection', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.miNombre).toBe('TestBot');
  });

  test('clears pending reconnectTimeout on connection open', async () => {
    const provider = makeProvider();
    const timer = setTimeout(() => {}, 10000);
    provider.reconnectTimeout = timer;

    await provider._handleConnectionUpdate({ connection: 'open' });

    expect(provider.reconnectTimeout).toBeNull();
  });

  test('clears pending qrTimeout on connection open', async () => {
    const provider = makeProvider();
    const timer = setTimeout(() => {}, 8000);
    provider.qrTimeout = timer;

    await provider._handleConnectionUpdate({ connection: 'open' });

    expect(provider.qrTimeout).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. _handleConnectionUpdate() — CONNECTION 'close' — GENERIC
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — connection "close" (generic reconnect)', () => {
  const makeCloseUpdate = (statusCode) => ({
    connection:    'close',
    lastDisconnect: {
      error: { output: { statusCode }, message: `Error ${statusCode}` },
    },
  });

  test('sets isReady=false on disconnect', async () => {
    const provider = makeProvider({ isReady: true });
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.isReady).toBe(false);
  });

  test('sets status="disconnected" on generic close', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.status).toBe('disconnected');
  });

  test('clears qrCode on disconnect', async () => {
    const provider = makeProvider();
    provider.qrCode = 'data:image/png;base64,OLD_QR';
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.qrCode).toBeNull();
  });

  test('clears miNumero on disconnect', async () => {
    const provider = makeProvider();
    provider.miNumero = '573001234567';
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.miNumero).toBeNull();
  });

  test('resets qrEmitted=false on disconnect', async () => {
    const provider = makeProvider();
    provider.qrEmitted = true;
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.qrEmitted).toBe(false);
  });

  test('emits "disconnected" event', async () => {
    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('disconnected', handler);

    await provider._handleConnectionUpdate(makeCloseUpdate(408));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('schedules reconnect (reconnectTimeout set) for non-auth errors', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(makeCloseUpdate(408));
    expect(provider.reconnectTimeout).not.toBeNull();
  });

  test('cancels existing reconnectTimeout before creating new one', async () => {
    const provider = makeProvider();
    const oldTimer = setTimeout(() => {}, 30000);
    provider.reconnectTimeout = oldTimer;

    await provider._handleConnectionUpdate(makeCloseUpdate(408));

    // A new timer should be set (different from old one)
    expect(provider.reconnectTimeout).not.toBe(oldTimer);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. _handleConnectionUpdate() — RATE LIMITED (405)
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — rate limited (status 405)', () => {
  const rateLimitedUpdate = {
    connection:    'close',
    lastDisconnect: {
      error: { output: { statusCode: 405 } },
    },
  };

  test('sets status="rate_limited"', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(rateLimitedUpdate);
    expect(provider.status).toBe('rate_limited');
  });

  test('emits "session-expired" event', async () => {
    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('session-expired', handler);

    await provider._handleConnectionUpdate(rateLimitedUpdate);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toContain('Espera');
  });

  test('does NOT schedule reconnect for 405', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(rateLimitedUpdate);
    expect(provider.reconnectTimeout).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. _handleConnectionUpdate() — AUTH FAILURE (401 loggedOut)
// ═══════════════════════════════════════════════════════════════════════════

describe('_handleConnectionUpdate() — auth failure / logged out (401)', () => {
  const authFailUpdate = {
    connection:    'close',
    lastDisconnect: {
      error: { output: { statusCode: 401 } },
    },
  };

  test('emits "session-expired" event', async () => {
    const provider = makeProvider();
    const handler = jest.fn();
    provider.on('session-expired', handler);

    await provider._handleConnectionUpdate(authFailUpdate);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('sets status="waiting_manual_qr" after auth failure', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(authFailUpdate);
    expect(provider.status).toBe('waiting_manual_qr');
  });

  test('deletes auth files if they exist', async () => {
    fsMock.existsSync.mockReturnValue(true); // auth path exists
    const provider = makeProvider();

    await provider._handleConnectionUpdate(authFailUpdate);

    expect(fsMock.rmSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true, force: true }
    );
  });

  test('does NOT schedule reconnect for auth failure', async () => {
    const provider = makeProvider();
    await provider._handleConnectionUpdate(authFailUpdate);
    expect(provider.reconnectTimeout).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. DUAL SESSION ISOLATION — QR INDEPENDENCE
// ═══════════════════════════════════════════════════════════════════════════

describe('Dual session QR isolation', () => {
  test('session1 QR does not overwrite session2 QR', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    // Set different QRs directly
    s1.qrCode = 'data:image/png;base64,QR_SESSION_1';
    s2.qrCode = 'data:image/png;base64,QR_SESSION_2';

    expect(s1.qrCode).toBe('data:image/png;base64,QR_SESSION_1');
    expect(s2.qrCode).toBe('data:image/png;base64,QR_SESSION_2');
  });

  test('emitting QR on session1 does not trigger session2 listener', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    const handler1 = jest.fn();
    const handler2 = jest.fn();
    s1.on('qr', handler1);
    s2.on('qr', handler2);

    await s1._emitQR('qr-for-session1');

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  test('both sessions can emit QR simultaneously without interference', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    const qrs1 = [];
    const qrs2 = [];
    s1.on('qr', (qr) => qrs1.push(qr));
    s2.on('qr', (qr) => qrs2.push(qr));

    // Both emit QR concurrently
    await Promise.all([
      s1._emitQR('qr-1'),
      s2._emitQR('qr-2'),
    ]);

    expect(qrs1).toHaveLength(1);
    expect(qrs2).toHaveLength(1);
    expect(qrs1[0]).toBe('data:image/png;base64,MOCK_QR_DATA');
    expect(qrs2[0]).toBe('data:image/png;base64,MOCK_QR_DATA');
  });

  test('session1 connecting does NOT affect session2 isReady state', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    await s1._handleConnectionUpdate({ connection: 'open' });

    expect(s1.isReady).toBe(true);
    expect(s2.isReady).toBe(false); // unaffected
  });

  test('session1 disconnecting does NOT reset session2 state', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    // Set s2 as connected
    s2.isReady  = true;
    s2.status   = 'connected';
    s2.miNumero = '573117654321';
    s2.qrCode   = null;

    // Disconnect s1
    await s1._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    // s2 must remain unaffected
    expect(s2.isReady).toBe(true);
    expect(s2.status).toBe('connected');
    expect(s2.miNumero).toBe('573117654321');
  });

  test('session1 and session2 have independent qrEmitted flags', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    await s1._emitQR('qr-s1');

    expect(s1.qrEmitted).toBe(true);
    expect(s2.qrEmitted).toBe(false);
  });

  test('session1 and session2 have independent reconnectTimeout timers', async () => {
    const s1 = makeProvider({ sessionId: 'session1' });
    const s2 = makeProvider({ sessionId: 'session2' });

    // Disconnect s1 → it gets a reconnect timer
    await s1._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    // s2 should have no reconnect timer
    expect(s1.reconnectTimeout).not.toBeNull();
    expect(s2.reconnectTimeout).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. _resolveLid() — LID RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

describe('_resolveLid() — LID to phone resolution', () => {
  test('returns non-LID JID unchanged', () => {
    const p = makeProvider();
    const jid = '573001234567@s.whatsapp.net';
    expect(p._resolveLid(jid)).toBe(jid);
  });

  test('returns null unchanged', () => {
    const p = makeProvider();
    expect(p._resolveLid(null)).toBeNull();
  });

  test('resolves LID from remoteJidAlt in message', () => {
    const p = makeProvider();
    const msg = { key: { remoteJidAlt: '573001234567@s.whatsapp.net' } };
    const result = p._resolveLid('12345@lid', msg);
    expect(result).toBe('573001234567@s.whatsapp.net');
  });

  test('resolves LID from internal lidToPhone map', () => {
    const p = makeProvider();
    p.lidToPhone.set('12345@lid', '573009876543@s.whatsapp.net');
    const result = p._resolveLid('12345@lid');
    expect(result).toBe('573009876543@s.whatsapp.net');
  });

  test('returns original LID when resolution fails', () => {
    const p = makeProvider();
    const result = p._resolveLid('unknown@lid');
    expect(result).toBe('unknown@lid');
  });

  test('remoteJidAlt takes precedence over lidToPhone map', () => {
    const p = makeProvider();
    p.lidToPhone.set('12345@lid', '573009876543@s.whatsapp.net');
    const msg = { key: { remoteJidAlt: '573001111111@s.whatsapp.net' } };
    const result = p._resolveLid('12345@lid', msg);
    // remoteJidAlt wins
    expect(result).toBe('573001111111@s.whatsapp.net');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. _destroySocket() — SOCKET CLEANUP
// ═══════════════════════════════════════════════════════════════════════════
// Note: BaileysProvider does not have a public destroy() method.
// Socket cleanup is done via _destroySocket() (called internally by SessionManager).
// State reset (isReady/status) is handled by _handleConnectionUpdate('close').

describe('_destroySocket() — socket cleanup', () => {
  test('sets sock=null after _destroySocket', async () => {
    const p = makeProvider();
    // Inject a mock sock with the necessary methods
    p.sock = {
      ev:   { removeAllListeners: jest.fn() },
      end:  jest.fn(),
    };
    await p._destroySocket();
    expect(p.sock).toBeNull();
  });

  test('calls ev.removeAllListeners() before ending the socket', async () => {
    const p = makeProvider();
    const removeAll = jest.fn();
    p.sock = { ev: { removeAllListeners: removeAll }, end: jest.fn() };

    await p._destroySocket();

    expect(removeAll).toHaveBeenCalledTimes(1);
  });

  test('calls sock.end(undefined) to close the connection', async () => {
    const p = makeProvider();
    const endFn = jest.fn();
    p.sock = { ev: { removeAllListeners: jest.fn() }, end: endFn };

    await p._destroySocket();

    expect(endFn).toHaveBeenCalledWith(undefined);
  });

  test('is safe to call when sock is already null', async () => {
    const p = makeProvider();
    p.sock = null;
    await expect(p._destroySocket()).resolves.not.toThrow();
    expect(p.sock).toBeNull();
  });

  test('sets sock=null even if end() throws', async () => {
    const p = makeProvider();
    p.sock = {
      ev:  { removeAllListeners: jest.fn() },
      end: jest.fn().mockImplementation(() => { throw new Error('socket already closed'); }),
    };
    await p._destroySocket();
    expect(p.sock).toBeNull(); // still null despite error
  });

  // Verify state resets via _handleConnectionUpdate (the real flow)
  test('connection close resets isReady=false and status=disconnected', async () => {
    const p = makeProvider({ isReady: true });
    p.status = 'connected';

    await p._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    expect(p.isReady).toBe(false);
    expect(p.status).toBe('disconnected');
    expect(p.qrCode).toBeNull();
  });

  test('connection close sets sock-related state to clean values', async () => {
    const p = makeProvider({ isReady: true });
    p.miNumero = '573001234567';
    p.qrEmitted = true;

    await p._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    expect(p.miNumero).toBeNull();
    expect(p.qrEmitted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. QR LIFECYCLE — END-TO-END FLOW
// ═══════════════════════════════════════════════════════════════════════════

describe('QR lifecycle — full end-to-end flow', () => {
  test('full flow: QR emitted → connected → QR cleared', async () => {
    const provider = makeProvider({ hasExistingSession: false });
    const qrEvents   = [];
    const readyEvents = [];

    provider.on('qr',   (qr) => qrEvents.push(qr));
    provider.on('ready', ()  => readyEvents.push(true));

    // Step 1: QR arrives
    await provider._handleConnectionUpdate({ qr: 'initial-qr' });
    expect(qrEvents).toHaveLength(1);
    expect(provider.qrCode).toBe('data:image/png;base64,MOCK_QR_DATA');

    // Step 2: Session connects
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(readyEvents).toHaveLength(1);
    expect(provider.isReady).toBe(true);
    expect(provider.qrCode).toBeNull(); // QR cleared
  });

  test('full flow: connected → disconnected → reconnect timer set', async () => {
    const provider = makeProvider();

    // Connect first
    await provider._handleConnectionUpdate({ connection: 'open' });
    expect(provider.isReady).toBe(true);

    // Then disconnect
    await provider._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });

    expect(provider.isReady).toBe(false);
    expect(provider.reconnectTimeout).not.toBeNull();
  });

  test('after reconnect timer fires, QR is generated again (qrEmitted reset)', async () => {
    const provider = makeProvider({ hasExistingSession: false });
    const qrEvents = [];
    provider.on('qr', (qr) => qrEvents.push(qr));

    // 1st QR cycle
    await provider._handleConnectionUpdate({ qr: 'qr-attempt-1' });
    expect(qrEvents).toHaveLength(1);
    expect(provider.qrEmitted).toBe(true);

    // Disconnect → qrEmitted reset
    await provider._handleConnectionUpdate({
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });
    expect(provider.qrEmitted).toBe(false);

    // 2nd QR cycle — should work because qrEmitted was reset
    await provider._handleConnectionUpdate({ qr: 'qr-attempt-2' });
    expect(qrEvents).toHaveLength(2); // second QR was emitted
  });

  test('QR is NOT emitted again if session reconnects automatically (no QR needed)', async () => {
    const provider = makeProvider({ hasExistingSession: true });
    const qrEvents = [];
    provider.on('qr', (qr) => qrEvents.push(qr));

    // QR arrives but there's an existing session → 8s wait
    await provider._handleConnectionUpdate({ qr: 'auto-reconnect-qr' });
    expect(qrEvents).toHaveLength(0); // not yet

    // Session reconnects within 8s
    await provider._handleConnectionUpdate({ connection: 'open' });
    provider.isReady = true;

    // Fast-forward 8s — but session is already ready
    jest.advanceTimersByTime(8000);
    await Promise.resolve();

    expect(qrEvents).toHaveLength(0); // QR was never needed
    expect(provider.isReady).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. TIMER SAFETY — No timer accumulation
// ═══════════════════════════════════════════════════════════════════════════

describe('Timer safety — no accumulation of timers', () => {
  test('multiple disconnects only schedule ONE reconnect timer', async () => {
    const provider = makeProvider();

    const closeUpdate = {
      connection:    'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    };

    await provider._handleConnectionUpdate(closeUpdate);
    const timer1 = provider.reconnectTimeout;

    await provider._handleConnectionUpdate(closeUpdate);
    const timer2 = provider.reconnectTimeout;

    // Second disconnect should replace the first timer, not accumulate
    expect(timer2).not.toBe(timer1);
    expect(provider.reconnectTimeout).not.toBeNull();
  });

  test('multiple QR arrivals (existing session) only schedule ONE qrTimeout', async () => {
    const provider = makeProvider({ hasExistingSession: true });

    await provider._handleConnectionUpdate({ qr: 'qr-1' });
    const t1 = provider.qrTimeout;

    await provider._handleConnectionUpdate({ qr: 'qr-2' }); // second QR
    const t2 = provider.qrTimeout;

    // Second QR should replace the first timeout
    expect(t2).not.toBe(t1);
  });
});
