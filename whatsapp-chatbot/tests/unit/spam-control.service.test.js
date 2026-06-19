/**
 * Tests unitarios para spam-control.service.js
 */

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock de fs para evitar lectura/escritura de archivos
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('[]'),
    writeFileSync: jest.fn()
}));

// Mock de timezone
jest.mock('../../src/utils/timezone', () => ({
    now: () => ({
        dateString: '2026-02-11',
        timeString: '09:00:00',
        timezone: 'America/Bogota'
    }),
    format: (date) => date.toISOString()
}));

const spamControl = require('../../src/services/spam-control.service');

describe('spam-control.service', () => {
    beforeEach(() => {
        spamControl.resetUserState('test-user-1');
        spamControl.resetUserState('test-user-2');
    });

    describe('evaluateMessage', () => {
        test('primer mensaje NO debe ser spam', () => {
            const result = spamControl.evaluateMessage('test-user-1', 'Hola');
            expect(result.isSpam).toBe(false);
            expect(result.shouldBlock).toBe(false);
        });

        test('mensajes diferentes NO deben ser spam', () => {
            spamControl.evaluateMessage('test-user-1', 'Hola');
            const result = spamControl.evaluateMessage('test-user-1', 'Quiero información sobre servicios');
            expect(result.isSpam).toBe(false);
        });

        test('mensajes repetidos deben incrementar conteo', () => {
            spamControl.evaluateMessage('test-user-1', 'spam repetido aquí');
            const result = spamControl.evaluateMessage('test-user-1', 'spam repetido aquí');
            expect(result.consecutiveCount).toBe(2);
        });

        test('3 mensajes repetidos deben ser advertencia de spam', () => {
            spamControl.evaluateMessage('test-user-1', 'mensaje repetido aquí');
            spamControl.evaluateMessage('test-user-1', 'mensaje repetido aquí');
            const result = spamControl.evaluateMessage('test-user-1', 'mensaje repetido aquí');
            expect(result.isSpam).toBe(true);
            expect(result.shouldBlock).toBe(false); // Advertencia, no bloqueo
        });

        test('debe retornar objeto con estructura correcta', () => {
            const result = spamControl.evaluateMessage('test-user-1', 'hello');
            expect(result).toHaveProperty('isSpam');
            expect(result).toHaveProperty('shouldBlock');
            expect(result).toHaveProperty('consecutiveCount');
            expect(result).toHaveProperty('similarity');
            expect(result).toHaveProperty('reason');
            expect(result).toHaveProperty('iaDeactivated');
        });
    });

    describe('resetUserState', () => {
        test('debe limpiar el estado del usuario', () => {
            spamControl.evaluateMessage('test-user-2', 'msg');
            spamControl.evaluateMessage('test-user-2', 'msg');
            spamControl.resetUserState('test-user-2');
            const state = spamControl.getUserState('test-user-2');
            expect(state).toBeNull();
        });
    });

    describe('getUserState', () => {
        test('debe retornar null para usuario sin estado', () => {
            const state = spamControl.getUserState('nobody');
            expect(state).toBeNull();
        });

        test('debe retornar estado para usuario existente', () => {
            spamControl.evaluateMessage('test-user-1', 'Hola');
            const state = spamControl.getUserState('test-user-1');
            expect(state).toBeDefined();
            expect(state).not.toBeNull();
        });
    });

    describe('getStats', () => {
        test('debe retornar estadísticas válidas', () => {
            const stats = spamControl.getStats();
            expect(stats).toBeDefined();
            expect(stats).toHaveProperty('totalTrackedUsers');
            expect(stats).toHaveProperty('currentlyBlocked');
            expect(stats).toHaveProperty('config');
        });
    });

    describe('normalizeText', () => {
        test('debe normalizar texto a minúsculas', () => {
            const result = spamControl.normalizeText('HOLA MUNDO');
            expect(result).toBe('hola mundo');
        });

        test('debe eliminar acentos', () => {
            const result = spamControl.normalizeText('información');
            expect(result).toBe('informacion');
        });

        test('debe retornar vacío para null', () => {
            const result = spamControl.normalizeText(null);
            expect(result).toBe('');
        });
    });

    describe('calculateSimilarity', () => {
        test('textos idénticos deben tener similaridad 1', () => {
            expect(spamControl.calculateSimilarity('hola mundo', 'hola mundo')).toBe(1.0);
        });

        test('textos completamente diferentes deben tener baja similaridad', () => {
            const similarity = spamControl.calculateSimilarity('abcdef', 'zyxwvu');
            expect(similarity).toBeLessThan(0.5);
        });
    });
});
