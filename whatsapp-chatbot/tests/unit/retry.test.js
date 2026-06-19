/**
 * Tests unitarios para la utilidad de Retry
 */

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const { withRetry, isRetryableError } = require('../../src/utils/retry');

describe('withRetry', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('debe retornar resultado exitoso sin reintentos', async () => {
        const fn = jest.fn().mockResolvedValue('resultado');

        const result = await withRetry(fn, { operationName: 'test' });

        expect(result).toBe('resultado');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('debe reintentar en error 429 y tener éxito', async () => {
        const error429 = new Error('Rate limit');
        error429.status = 429;

        const fn = jest.fn()
            .mockRejectedValueOnce(error429)
            .mockResolvedValue('éxito');

        const result = await withRetry(fn, {
            operationName: 'test',
            maxRetries: 2,
            initialDelayMs: 10 // Rápido para tests
        });

        expect(result).toBe('éxito');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('debe reintentar en error 500 y tener éxito', async () => {
        const error500 = new Error('Server error');
        error500.status = 500;

        const fn = jest.fn()
            .mockRejectedValueOnce(error500)
            .mockResolvedValue('éxito');

        const result = await withRetry(fn, {
            operationName: 'test',
            maxRetries: 2,
            initialDelayMs: 10
        });

        expect(result).toBe('éxito');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('NO debe reintentar en error 401 (no recuperable)', async () => {
        const error401 = new Error('Unauthorized');
        error401.status = 401;

        const fn = jest.fn().mockRejectedValue(error401);

        await expect(withRetry(fn, {
            operationName: 'test',
            maxRetries: 3,
            initialDelayMs: 10
        })).rejects.toThrow('Unauthorized');

        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('NO debe reintentar en error 400 (no recuperable)', async () => {
        const error400 = new Error('Bad request');
        error400.status = 400;

        const fn = jest.fn().mockRejectedValue(error400);

        await expect(withRetry(fn, {
            operationName: 'test',
            maxRetries: 3,
            initialDelayMs: 10
        })).rejects.toThrow('Bad request');

        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('debe respetar maxRetries', async () => {
        const error502 = new Error('Bad Gateway');
        error502.status = 502;

        const fn = jest.fn().mockRejectedValue(error502);

        await expect(withRetry(fn, {
            operationName: 'test',
            maxRetries: 2,
            initialDelayMs: 10
        })).rejects.toThrow('Bad Gateway');

        // 1 intento principal + 2 reintentos = 3 total
        expect(fn).toHaveBeenCalledTimes(3);
    });

    test('debe reintentar errores de red (ECONNRESET)', async () => {
        const networkError = new Error('connection reset');
        networkError.code = 'ECONNRESET';

        const fn = jest.fn()
            .mockRejectedValueOnce(networkError)
            .mockResolvedValue('conectado');

        const result = await withRetry(fn, {
            operationName: 'test',
            maxRetries: 2,
            initialDelayMs: 10
        });

        expect(result).toBe('conectado');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('isRetryableError', () => {
    test('debe considerar 429 como recuperable', () => {
        const error = new Error('Rate limit');
        error.status = 429;
        expect(isRetryableError(error)).toBe(true);
    });

    test('debe considerar 500 como recuperable', () => {
        const error = new Error('Server error');
        error.status = 500;
        expect(isRetryableError(error)).toBe(true);
    });

    test('debe considerar 503 como recuperable', () => {
        const error = new Error('Unavailable');
        error.status = 503;
        expect(isRetryableError(error)).toBe(true);
    });

    test('NO debe considerar 401 como recuperable', () => {
        const error = new Error('Unauthorized');
        error.status = 401;
        expect(isRetryableError(error)).toBe(false);
    });

    test('NO debe considerar 403 como recuperable', () => {
        const error = new Error('Forbidden');
        error.status = 403;
        expect(isRetryableError(error)).toBe(false);
    });

    test('debe considerar ECONNRESET como recuperable', () => {
        const error = new Error('reset');
        error.code = 'ECONNRESET';
        expect(isRetryableError(error)).toBe(true);
    });

    test('debe considerar ETIMEDOUT como recuperable', () => {
        const error = new Error('timeout');
        error.code = 'ETIMEDOUT';
        expect(isRetryableError(error)).toBe(true);
    });
});
