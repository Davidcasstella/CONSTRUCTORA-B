/**
 * Tests unitarios para el middleware de Rate Limiting
 */

const { createRateLimiter } = require('../../src/middlewares/rate-limit.middleware');

// Mock del logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Rate Limit Middleware', () => {
    let limiter;
    let req;
    let res;
    let next;

    beforeEach(() => {
        // Crear un limiter de test con ventana corta
        limiter = createRateLimiter({
            maxRequests: 3,
            windowMs: 60000,
            name: `test-${Date.now()}`,
            message: 'Límite excedido'
        });

        req = {
            ip: '192.168.1.100',
            connection: { remoteAddress: '192.168.1.100' }
        };

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis()
        };

        next = jest.fn();
    });

    test('debe permitir requests bajo el límite', () => {
        limiter(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
            'X-RateLimit-Limit': '3',
            'X-RateLimit-Remaining': '2'
        }));
    });

    test('debe decrementar remaining con cada request', () => {
        // Request 1
        limiter(req, res, next);
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
            'X-RateLimit-Remaining': '2'
        }));

        // Request 2
        res.set.mockClear();
        limiter(req, res, next);
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
            'X-RateLimit-Remaining': '1'
        }));

        // Request 3
        res.set.mockClear();
        limiter(req, res, next);
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
            'X-RateLimit-Remaining': '0'
        }));
    });

    test('debe bloquear requests que exceden el límite', () => {
        // Agotar el límite
        limiter(req, res, next); // 1
        limiter(req, res, next); // 2
        limiter(req, res, next); // 3

        // Reset mocks para la 4ta solicitud
        next.mockClear();
        res.status.mockClear();
        res.json.mockClear();

        // 4ta solicitud - debe ser bloqueada
        limiter(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({
                code: 'RATE_LIMIT_EXCEEDED'
            })
        }));
    });

    test('debe trackear IPs diferentes por separado', () => {
        const req2 = { ...req, ip: '192.168.1.1' };

        // Agotar límite para IP 1
        limiter(req, res, next); // 1
        limiter(req, res, next); // 2
        limiter(req, res, next); // 3

        // IP 2 debe funcionar independientemente
        next.mockClear();
        res.status.mockClear();

        limiter(req2, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('debe incluir Retry-After header cuando bloqueado', () => {
        // Agotar límite
        limiter(req, res, next);
        limiter(req, res, next);
        limiter(req, res, next);

        res.set.mockClear();

        // Intentar exceder
        limiter(req, res, next);

        // Verificar que se llama set con Retry-After
        expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
});
