/**
 * ===========================================
 * UNIT TESTS: WhatsApp Provider Index
 * ===========================================
 *
 * Validates that the provider index:
 * 1. Returns session1 (default) via getProvider()
 * 2. Exposes getSessionManager()
 * 3. Delegates sendMessage, sendImage, etc. to the correct session
 * 4. Handles missing provider gracefully
 */

'use strict';

const EventEmitter = require('events');

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../src/config', () => ({
  whatsapp: { provider: 'baileys' },
  media: { uploadDir: '/tmp/uploads', maxFileSizeMB: 25 },
  s3: { bucket: 'mock-bucket', region: 'us-east-1', enabled: false },
}));

jest.mock('../../src/services/s3.service', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://s3.mock/file'),
  isEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/services/media-storage.service', () => ({
  saveMediaFromMessage: jest.fn().mockResolvedValue(null),
  setWhatsAppSocket: jest.fn(),
}));


// Create a mock session manager with controllable sessions
const mockSession1 = {
  sessionId:    'session1',
  isReady:      false,
  sock:         null,
  qrCode:       null,
  status:       'disconnected',
  miNumero:     null,
  miNombre:     null,
  sendMessage:  jest.fn().mockResolvedValue({ key: { id: 'msg1' } }),
  sendImage:    jest.fn().mockResolvedValue({ key: { id: 'img1' } }),
  sendDocument: jest.fn().mockResolvedValue({ key: { id: 'doc1' } }),
  sendVideo:    jest.fn().mockResolvedValue({ key: { id: 'vid1' } }),
  sendAudio:    jest.fn().mockResolvedValue({ key: { id: 'aud1' } }),
  markAsRead:   jest.fn().mockResolvedValue(),
  fetchChats:   jest.fn().mockResolvedValue([]),
  fetchChatMessages: jest.fn().mockResolvedValue({ messages: [] }),
  sendTyping:   jest.fn().mockResolvedValue(),
  clearTyping:  jest.fn().mockResolvedValue(),
  getStatus:    jest.fn().mockReturnValue({ status: 'disconnected', isReady: false, hasQR: false }),
  getQRCode:    jest.fn().mockReturnValue(null),
  getClient:    jest.fn().mockReturnValue(null),
};

const mockSession2 = {
  sessionId:   'session2',
  ...mockSession1, // same methods but separate references
  sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg2' } }),
};

const mockSessionManager = {
  sessions:           new Map([['session1', mockSession1], ['session2', mockSession2]]),
  getDefaultSession:  jest.fn().mockReturnValue(mockSession1),
  getSession:         jest.fn((id) => id === 'session1' ? mockSession1 : id === 'session2' ? mockSession2 : undefined),
  getSessionIds:      jest.fn().mockReturnValue(['session1', 'session2']),
  getAllStatuses:      jest.fn().mockReturnValue({
    session1: { sessionId: 'session1', status: 'disconnected', isReady: false },
    session2: { sessionId: 'session2', status: 'disconnected', isReady: false },
  }),
  getQRCode:          jest.fn().mockReturnValue(null),
  initialize:         jest.fn().mockResolvedValue(),
  connectAll:         jest.fn().mockResolvedValue(),
  destroy:            jest.fn().mockResolvedValue(),
};

jest.mock('../../src/providers/whatsapp/session-manager', () => mockSessionManager);

// ── Subject under test ─────────────────────────────────────────────────────
let whatsappIndex;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }));
  jest.mock('../../src/config', () => ({
    whatsapp: { provider: 'baileys' },
    media: { uploadDir: '/tmp/uploads', maxFileSizeMB: 25 },
  }));
  jest.mock('../../src/providers/whatsapp/session-manager', () => mockSessionManager);
  whatsappIndex = require('../../src/providers/whatsapp/index');
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WhatsApp Provider Index — getProvider()', () => {
  test('returns default session (session1) for Baileys provider', () => {
    const provider = whatsappIndex.getProvider();
    expect(mockSessionManager.getDefaultSession).toHaveBeenCalled();
    expect(provider).toBe(mockSession1);
  });

  test('returns null-safe warning when session not yet initialized', () => {
    mockSessionManager.getDefaultSession.mockReturnValueOnce(null);
    const provider = whatsappIndex.getProvider();
    expect(provider).toBeNull();
  });
});

describe('WhatsApp Provider Index — getSessionManager()', () => {
  test('exposes getSessionManager()', () => {
    expect(typeof whatsappIndex.getSessionManager).toBe('function');
  });

  test('returns the singleton session manager', () => {
    const manager = whatsappIndex.getSessionManager();
    expect(manager).toBe(mockSessionManager);
  });
});

describe('WhatsApp Provider Index — sendMessage()', () => {
  test('delegates to the default session (session1)', async () => {
    await whatsappIndex.sendMessage('5730000@s.whatsapp.net', 'Hola');
    expect(mockSession1.sendMessage).toHaveBeenCalledWith('5730000@s.whatsapp.net', 'Hola', undefined);
  });

  test('throws when provider is not available', () => {
    const originalFn = mockSessionManager.getDefaultSession;
    mockSessionManager.getDefaultSession = jest.fn().mockReturnValue(null);
    try {
      expect(() => whatsappIndex.sendMessage('5730000', 'Test')).toThrow('WhatsApp provider not available');
    } finally {
      mockSessionManager.getDefaultSession = originalFn;
    }
  });
});

describe('WhatsApp Provider Index — sendImage()', () => {
  test('delegates to default session', async () => {
    await whatsappIndex.sendImage('5730000@s.whatsapp.net', '/path/img.jpg', 'Caption');
    expect(mockSession1.sendImage).toHaveBeenCalledWith('5730000@s.whatsapp.net', '/path/img.jpg', 'Caption');
  });

  test('throws when provider is not available', () => {
    const originalFn = mockSessionManager.getDefaultSession;
    mockSessionManager.getDefaultSession = jest.fn().mockReturnValue(null);
    try {
      expect(() => whatsappIndex.sendImage('5730000', '/img.jpg', '')).toThrow('WhatsApp provider not available');
    } finally {
      mockSessionManager.getDefaultSession = originalFn;
    }
  });
});

describe('WhatsApp Provider Index — sendDocument()', () => {
  test('delegates to default session', async () => {
    await whatsappIndex.sendDocument('5730000@s.whatsapp.net', '/path/doc.pdf', 'doc.pdf');
    expect(mockSession1.sendDocument).toHaveBeenCalledWith('5730000@s.whatsapp.net', '/path/doc.pdf', 'doc.pdf');
  });
});

describe('WhatsApp Provider Index — sendVideo()', () => {
  test('delegates to default session', async () => {
    await whatsappIndex.sendVideo('5730000@s.whatsapp.net', '/path/video.mp4', '');
    expect(mockSession1.sendVideo).toHaveBeenCalledWith('5730000@s.whatsapp.net', '/path/video.mp4', '');
  });
});

describe('WhatsApp Provider Index — sendAudio()', () => {
  test('delegates to default session', async () => {
    await whatsappIndex.sendAudio('5730000@s.whatsapp.net', '/path/audio.ogg');
    expect(mockSession1.sendAudio).toHaveBeenCalledWith('5730000@s.whatsapp.net', '/path/audio.ogg');
  });
});

describe('WhatsApp Provider Index — sendTyping() / clearTyping()', () => {
  test('sendTyping delegates to default session', () => {
    whatsappIndex.sendTyping('5730000@s.whatsapp.net');
    expect(mockSession1.sendTyping).toHaveBeenCalledWith('5730000@s.whatsapp.net');
  });

  test('clearTyping delegates to default session', () => {
    whatsappIndex.clearTyping('5730000@s.whatsapp.net');
    expect(mockSession1.clearTyping).toHaveBeenCalledWith('5730000@s.whatsapp.net');
  });

  test('sendTyping does not throw when provider is null', () => {
    mockSessionManager.getDefaultSession.mockReturnValueOnce(null);
    expect(() => whatsappIndex.sendTyping('5730000')).not.toThrow();
  });
});

describe('WhatsApp Provider Index — markAsRead()', () => {
  test('delegates to default session', () => {
    whatsappIndex.markAsRead('msg-id-123');
    expect(mockSession1.markAsRead).toHaveBeenCalledWith('msg-id-123');
  });

  test('does not throw when provider is null', () => {
    mockSessionManager.getDefaultSession.mockReturnValueOnce(null);
    expect(() => whatsappIndex.markAsRead('msg-id')).not.toThrow();
  });
});

describe('WhatsApp Provider Index — fetchChats()', () => {
  test('delegates to default session', () => {
    whatsappIndex.fetchChats(20);
    expect(mockSession1.fetchChats).toHaveBeenCalledWith(20);
  });

  test('returns empty array when provider is null', () => {
    mockSessionManager.getDefaultSession.mockReturnValueOnce(null);
    const result = whatsappIndex.fetchChats(10);
    expect(result).toEqual([]);
  });
});

describe('WhatsApp Provider Index — fetchChatMessages()', () => {
  test('delegates to default session', () => {
    whatsappIndex.fetchChatMessages('5730000@s.whatsapp.net', 50, null);
    expect(mockSession1.fetchChatMessages).toHaveBeenCalledWith('5730000@s.whatsapp.net', 50, null);
  });
});

describe('WhatsApp Provider Index — session isolation via getSessionManager()', () => {
  test('can access session2 directly via manager without affecting session1', async () => {
    const manager = whatsappIndex.getSessionManager();
    const session2 = manager.getSession('session2');

    // Send via session2
    await session2.sendMessage('5731111@s.whatsapp.net', 'Hola desde sesión 2');

    // session2 was called
    expect(mockSession2.sendMessage).toHaveBeenCalledWith('5731111@s.whatsapp.net', 'Hola desde sesión 2');
    // session1 was NOT called for this message
    expect(mockSession1.sendMessage).not.toHaveBeenCalled();
  });

  test('getAllStatuses() returns status for both sessions', () => {
    const manager = whatsappIndex.getSessionManager();
    const allStatuses = manager.getAllStatuses();
    expect(Object.keys(allStatuses)).toContain('session1');
    expect(Object.keys(allStatuses)).toContain('session2');
  });
});
