/**
 * Tests unitarios para chat.service.js
 *
 * Tests de las funciones exportadas del servicio de chat:
 * - Gestión de consentimiento
 * - Mensajes pendientes
 * - Reset de estado
 * - Conteo de interacciones
 */

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock de config
jest.mock('../../src/config', () => ({
    server: { port: 3001, isDevelopment: true },
    openai: {
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        maxTokens: 500,
        temperature: 0.7,
        systemPrompts: { default: 'Test prompt' }
    }
}));

// Mock de providers/ai
jest.mock('../../src/providers/ai', () => ({
    chat: jest.fn().mockResolvedValue('Respuesta de prueba'),
    createEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

// Mock de knowledge
jest.mock('../../src/knowledge', () => ({
    initialize: jest.fn(),
    findAnswer: jest.fn().mockReturnValue(null),
    getContext: jest.fn().mockReturnValue('')
}));

// Mock de servicios dependientes
jest.mock('../../src/services/knowledge-upload.service', () => ({
    getUploadedFiles: jest.fn().mockReturnValue([]),
    searchInFiles: jest.fn().mockReturnValue([])
}));

jest.mock('../../src/services/conversation-state.service', () => ({
    checkAndUpdateCycle: jest.fn().mockReturnValue(false),
    incrementInteractionCount: jest.fn(),
    updateConsentStatus: jest.fn(),
    markConsentSent: jest.fn(),
    updateLastMessage: jest.fn()
}));

jest.mock('../../src/services/escalation.service', () => ({
    getNextOpeningTime: jest.fn().mockReturnValue({ formatted: 'Lunes 8:00 AM' })
}));

jest.mock('../../src/services/embeddings.service', () => ({
    findSimilarChunks: jest.fn().mockResolvedValue([])
}));

jest.mock('../../src/services/rag-optimized.service', () => ({
    findRelevantChunksOptimized: jest.fn().mockResolvedValue({
        chunks: [],
        quality: 'none',
        topSimilarity: 0,
        avgSimilarity: 0,
        totalFound: 0,
        finalCount: 0
    }),
    evaluateEscalation: jest.fn().mockReturnValue({ shouldEscalate: false })
}));

jest.mock('../../src/services/context-detector.service', () => ({
    detectContext: jest.fn().mockReturnValue({
        type: 'general',
        isNorboyRelated: true,
        reason: 'test'
    }),
    MESSAGES: {
        outOfScope: 'Fuera de alcance',
        noInformation: 'Sin información',
        lowConfidence: 'Baja confianza'
    }
}));

jest.mock('../../src/services/schedule-config.service', () => ({
    getFormattedSchedule: jest.fn().mockReturnValue({
        weekdaysLabel: '8:00 AM - 4:30 PM',
        saturdayLabel: '9:00 AM - 12:00 PM',
        sundayLabel: 'Cerrado'
    })
}));

const chatService = require('../../src/services/chat.service');

describe('chat.service', () => {

    describe('Consent Management', () => {
        const testUserId = 'test-consent-user';

        beforeEach(() => {
            chatService.resetUserState(testUserId);
        });

        test('hasUserConsent debe retornar false para nuevo usuario', () => {
            expect(chatService.hasUserConsent(testUserId)).toBe(false);
        });

        test('setConsentResponse debe registrar aceptación', () => {
            chatService.setConsentResponse(testUserId, true);
            expect(chatService.hasUserConsent(testUserId)).toBe(true);
        });

        test('setConsentResponse debe registrar rechazo', () => {
            chatService.setConsentResponse(testUserId, false);
            expect(chatService.hasUserConsent(testUserId)).toBe(false);
        });
    });

    describe('resetUserState', () => {
        const testUserId = 'test-reset-user';

        test('debe limpiar todo el estado del usuario', () => {
            chatService.setConsentResponse(testUserId, true);
            chatService.resetUserState(testUserId);
            expect(chatService.hasUserConsent(testUserId)).toBe(false);
            expect(chatService.getPendingMessage(testUserId)).toBeNull();
            expect(chatService.getUserInteractionCount(testUserId)).toBe(0);
        });
    });

    describe('Pending Messages', () => {
        const testUserId = 'test-pending-user';

        beforeEach(() => {
            chatService.resetUserState(testUserId);
        });

        test('getPendingMessage debe retornar null para nuevo usuario', () => {
            expect(chatService.getPendingMessage(testUserId)).toBeNull();
        });

        test('clearPendingMessage no debe lanzar error en usuario sin pendiente', () => {
            expect(() => chatService.clearPendingMessage(testUserId)).not.toThrow();
        });
    });

    describe('getUserInteractionCount', () => {
        const testUserId = 'test-count-user';

        test('debe retornar 0 para nuevo usuario', () => {
            chatService.resetUserState(testUserId);
            expect(chatService.getUserInteractionCount(testUserId)).toBe(0);
        });
    });

    describe('cleanQuestionMarks', () => {
        test('debe limpiar signos de interrogación', () => {
            const result = chatService.cleanQuestionMarks('¿Cómo puedo ayudarte?');
            expect(typeof result).toBe('string');
        });

        test('debe manejar texto sin signos', () => {
            const result = chatService.cleanQuestionMarks('Hola mundo');
            expect(result).toBe('Hola mundo');
        });
    });

    describe('getEscalationMessage', () => {
        test('debe retornar un mensaje de escalación válido', () => {
            const msg = chatService.getEscalationMessage();
            expect(typeof msg).toBe('object');
            expect(msg.type).toBe('escalation');
            expect(msg.text).toBeDefined();
        });
    });

    describe('getOutOfHoursMessage', () => {
        test('debe retornar un mensaje de fuera de horario válido', () => {
            const msg = chatService.getOutOfHoursMessage();
            expect(typeof msg).toBe('object');
            expect(msg.type).toBe('out_of_hours');
            expect(msg.text).toContain('8:00 AM - 4:30 PM');
        });
    });
});
