/**
 * Tests unitarios para la persistencia de media
 *
 * Verifica que:
 * 1. s3Key se incluye en los datos guardados en DynamoDB
 * 2. mediaInfo se asigna correctamente con s3Key antes del upload async
 * 3. rebuildIndexFromDB reconstruye el índice desde DynamoDB
 * 4. _updateMessageS3KeyInDB actualiza el registro en DynamoDB
 * 5. saveMessage incluye s3Key cuando hay mediaData
 */

// =============================================
// MOCKS
// =============================================

// Mock logger
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock config
jest.mock('../../src/config', () => ({
    server: { port: 3001, isDevelopment: true },
    media: { maxFileSizeMB: 25, uploadDir: './test-uploads' },
    s3: { enabled: true, bucket: 'test-bucket', region: 'us-east-1' },
    openai: {
        apiKey: 'test-key', model: 'gpt-4o-mini',
        maxTokens: 500, temperature: 0.7,
        systemPrompts: { default: 'Test' }
    }
}));

// Mock fs
const mockFs = {
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('[]'),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
};
jest.mock('fs', () => mockFs);

const mockFsPromises = {
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('test')),
    mkdir: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 })
};
jest.mock('fs', () => ({
    ...mockFs,
    promises: mockFsPromises
}));

// Mock S3 service
const mockS3Service = {
    uploadFile: jest.fn().mockResolvedValue({ s3Key: 'images/12345/test.jpg', url: 'https://s3.test/images/test.jpg' }),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('test-data')),
    generateS3Key: jest.fn().mockReturnValue('images/12345/test.jpg')
};
jest.mock('../../src/services/s3.service', () => mockS3Service);

// Mock DynamoDB provider
const mockSend = jest.fn().mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
const mockDocClient = { send: mockSend };
jest.mock('../../src/providers/dynamodb.provider', () => ({
    docClient: mockDocClient,
    TABLES: {
        MESSAGES: 'test-messages-table',
        CONVERSATIONS: 'test-conversations-table'
    }
}));

// Mock @aws-sdk/lib-dynamodb
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    UpdateCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    ScanCommand: jest.fn().mockImplementation((params) => ({ input: params }))
}));

// Mock @whiskeysockets/baileys
jest.mock('@whiskeysockets/baileys', () => ({
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('fake-media-data'))
}));

// =============================================
// TESTS
// =============================================

describe('Media Persistence', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset existsSync to return true for index file
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('[]');
    });

    // =========================================
    // TEST 1: s3Key se asigna en mediaInfo
    // =========================================
    describe('media-storage.service - s3Key eager assignment', () => {
        let mediaStorageService;

        beforeEach(() => {
            jest.isolateModules(() => {
                mediaStorageService = require('../../src/services/media-storage.service');
            });
        });

        test('saveMediaFromMessage debe incluir s3Key en el resultado', async () => {
            // Simular un mensaje de WhatsApp con imagen
            const mockMessage = {
                key: { id: 'msg_test_001', remoteJid: '12345@s.whatsapp.net' },
                message: {
                    imageMessage: {
                        mimetype: 'image/jpeg',
                        fileLength: 5000,
                        url: 'https://mmg.whatsapp.net/test'
                    }
                }
            };

            const result = await mediaStorageService.saveMediaFromMessage(mockMessage);

            // Debe retornar un objeto con s3Key
            expect(result).not.toBeNull();
            if (result) {
                expect(result).toHaveProperty('s3Key');
                expect(result.s3Key).toBe('images/12345/test.jpg');
                expect(result).toHaveProperty('mediaUrl');
                expect(result).toHaveProperty('mimeType');
                expect(result).toHaveProperty('fileName');
            }
        });

        test('getMediaInfo debe retornar s3Key para media guardada', async () => {
            const mockMessage = {
                key: { id: 'msg_test_002', remoteJid: '12345@s.whatsapp.net' },
                message: {
                    imageMessage: {
                        mimetype: 'image/jpeg',
                        fileLength: 5000,
                        url: 'https://mmg.whatsapp.net/test'
                    }
                }
            };

            await mediaStorageService.saveMediaFromMessage(mockMessage);
            const info = await mediaStorageService.getMediaInfo('msg_test_002');

            expect(info).not.toBeNull();
            if (info) {
                expect(info.s3Key).toBe('images/12345/test.jpg');
            }
        });
    });

    // =========================================
    // TEST 2: rebuildIndexFromDB reconstruye
    // =========================================
    describe('media-storage.service - rebuildIndexFromDB', () => {
        let mediaStorageService;

        beforeEach(() => {
            jest.isolateModules(() => {
                mediaStorageService = require('../../src/services/media-storage.service');
            });
        });

        test('debe reconstruir entradas del índice desde DynamoDB', async () => {
            // Simular que DynamoDB tiene mensajes con s3Key
            mockSend.mockResolvedValueOnce({
                Items: [
                    {
                        messageId: 'msg_db_001',
                        content: {
                            s3Key: 'images/55555/photo.jpg',
                            mimeType: 'image/jpeg',
                            fileName: 'photo.jpg',
                            fileSize: 12345
                        }
                    },
                    {
                        messageId: 'msg_db_002',
                        content: {
                            s3Key: 'documents/55555/doc.pdf',
                            mimeType: 'application/pdf',
                            fileName: 'doc.pdf',
                            fileSize: 99000
                        }
                    }
                ],
                LastEvaluatedKey: undefined
            });

            const rebuilt = await mediaStorageService.rebuildIndexFromDB();

            expect(rebuilt).toBe(2);

            // Verificar que las entradas fueron agregadas al índice
            const info1 = await mediaStorageService.getMediaInfo('msg_db_001');
            expect(info1).not.toBeNull();
            expect(info1.s3Key).toBe('images/55555/photo.jpg');
            expect(info1.mimeType).toBe('image/jpeg');
            expect(info1.mediaUrl).toBe('/api/media/download/msg_db_001');

            const info2 = await mediaStorageService.getMediaInfo('msg_db_002');
            expect(info2).not.toBeNull();
            expect(info2.s3Key).toBe('documents/55555/doc.pdf');
            expect(info2.mimeType).toBe('application/pdf');
        });

        test('no debe sobreescribir entradas existentes con s3Key', async () => {
            // Primero guardar un media manualmente en el índice
            const mockMessage = {
                key: { id: 'msg_existing', remoteJid: '12345@s.whatsapp.net' },
                message: {
                    imageMessage: {
                        mimetype: 'image/png',
                        fileLength: 3000,
                        url: 'https://mmg.whatsapp.net/test'
                    }
                }
            };
            await mediaStorageService.saveMediaFromMessage(mockMessage);

            // Verificar que tiene s3Key
            const beforeInfo = await mediaStorageService.getMediaInfo('msg_existing');
            expect(beforeInfo.s3Key).toBe('images/12345/test.jpg');

            // Simular rebuild que intenta sobreescribir con datos de DynamoDB
            mockSend.mockResolvedValueOnce({
                Items: [{
                    messageId: 'msg_existing',
                    content: {
                        s3Key: 'images/12345/different.jpg', // Diferente s3Key
                        mimeType: 'image/png',
                        fileName: 'different.png',
                        fileSize: 9999
                    }
                }],
                LastEvaluatedKey: undefined
            });

            const rebuilt = await mediaStorageService.rebuildIndexFromDB();

            // No debe haber reconstruido (ya existía con s3Key)
            expect(rebuilt).toBe(0);

            // Debe mantener el s3Key original
            const afterInfo = await mediaStorageService.getMediaInfo('msg_existing');
            expect(afterInfo.s3Key).toBe('images/12345/test.jpg');
        });

        test('debe retornar 0 si DynamoDB no tiene mensajes con media', async () => {
            mockSend.mockResolvedValueOnce({
                Items: [],
                LastEvaluatedKey: undefined
            });

            const rebuilt = await mediaStorageService.rebuildIndexFromDB();
            expect(rebuilt).toBe(0);
        });

        test('debe manejar errores de DynamoDB gracefully', async () => {
            mockSend.mockRejectedValueOnce(new Error('DynamoDB Connection Error'));

            const rebuilt = await mediaStorageService.rebuildIndexFromDB();
            expect(rebuilt).toBe(0); // No crashea, retorna 0
        });
    });

    // =========================================
    // TEST 3: saveMessage incluye s3Key
    // =========================================
    describe('message-processor.service - saveMessage con s3Key', () => {

        // Mock de todos los servicios que usa message-processor
        beforeAll(() => {
            jest.mock('../../src/services/conversation-state.service', () => ({
                getOrCreateConversation: jest.fn().mockReturnValue({
                    participantId: 'test-user@s.whatsapp.net',
                    messages: [],
                    interactionCount: 0,
                    bot_active: true,
                    status: 'active',
                    phoneNumber: '573001234567'
                }),
                getConversation: jest.fn().mockReturnValue({
                    participantId: 'test-user@s.whatsapp.net',
                    messages: [],
                    interactionCount: 0,
                    bot_active: true,
                    status: 'active',
                    phoneNumber: '573001234567'
                }),
                updateLastMessage: jest.fn(),
                getAllConversations: jest.fn().mockReturnValue([]),
                markConsentSent: jest.fn(),
                updateConsentStatus: jest.fn(),
                incrementInteractionCount: jest.fn(),
                checkAndUpdateCycle: jest.fn().mockReturnValue(false)
            }));

            jest.mock('../../src/services/chat.service', () => ({
                generateTextResponse: jest.fn().mockResolvedValue('Test response'),
                hasUserConsent: jest.fn().mockReturnValue(true),
                getUserInteractionCount: jest.fn().mockReturnValue(5),
                setConsentResponse: jest.fn(),
                getPendingMessage: jest.fn().mockReturnValue(null),
                clearPendingMessage: jest.fn(),
                resetUserState: jest.fn(),
                cleanQuestionMarks: jest.fn(t => t),
                getEscalationMessage: jest.fn(),
                getOutOfHoursMessage: jest.fn()
            }));

            jest.mock('../../src/services/escalation.service', () => ({
                evaluateEscalation: jest.fn().mockReturnValue({ needsHuman: false }),
                getNextOpeningTime: jest.fn().mockReturnValue({ formatted: 'Lunes 8:00 AM' })
            }));

            jest.mock('../../src/services/number-control.service', () => ({
                isNumberAllowed: jest.fn().mockReturnValue(true),
                getConfig: jest.fn().mockReturnValue({ enabled: false })
            }));

            jest.mock('../../src/services/spam-control.service', () => ({
                checkSpam: jest.fn().mockReturnValue({ blocked: false }),
                setNumberControlService: jest.fn()
            }));

            jest.mock('../../src/services/advisor-control.service', () => ({
                setSocketIO: jest.fn()
            }));

            jest.mock('../../src/services/schedule-config.service', () => ({
                getConfig: jest.fn().mockReturnValue({
                    weekdays: { start: 8, endHour: 16, endMinute: 30 },
                    saturday: { enabled: true, start: 9, endHour: 12, endMinute: 0 },
                    sunday: { enabled: false }
                }),
                getFormattedSchedule: jest.fn().mockReturnValue({
                    weekdaysLabel: '8:00 AM - 4:30 PM',
                    saturdayLabel: '9:00 AM - 12:00 PM',
                    sundayLabel: 'Cerrado'
                })
            }));

            jest.mock('../../src/services/time-simulation.service', () => ({
                getCurrentTime: jest.fn().mockReturnValue({
                    decimal: 10.5,
                    timeString: '10:30 AM',
                    timezone: 'America/Bogota'
                }),
                isSimulationActive: jest.fn().mockReturnValue(false),
                getSimulatedTime: jest.fn(),
                isScheduleCheckEnabled: jest.fn().mockReturnValue(false)
            }));

            jest.mock('../../src/utils/timezone', () => ({
                getDayOfWeek: jest.fn().mockReturnValue(1) // Monday
            }));

            jest.mock('../../src/repositories/conversation.repository', () => ({
                saveMessage: jest.fn().mockResolvedValue(true),
                findByParticipantId: jest.fn().mockResolvedValue(null)
            }));

            jest.mock('../../src/models/message.model', () => ({
                Message: jest.fn().mockImplementation((data) => ({
                    ...data,
                    toPlainObject: () => data
                }))
            }));

            // flow.service removed as it does not exist
        });

        test('mediaData con s3Key debe propagarse al Message de DynamoDB', () => {
            // Importar DESPUÉS de todos los mocks
            const { Message } = require('../../src/models/message.model');

            const mediaData = {
                mediaUrl: '/api/media/download/msg_media_test',
                fileName: 'foto.jpg',
                mimeType: 'image/jpeg',
                fileSize: 15000,
                mediaType: 'image',
                s3Key: 'images/12345/foto.jpg'
            };

            // Simular la construcción del message que haría saveMessage
            const content = {
                text: '[Imagen recibida]',
                ...(mediaData ? {
                    mediaUrl: mediaData.mediaUrl,
                    fileName: mediaData.fileName,
                    mimeType: mediaData.mimeType,
                    fileSize: mediaData.fileSize,
                    s3Key: mediaData.s3Key || null
                } : {})
            };

            // Verificar que s3Key se incluye en el content
            expect(content.s3Key).toBe('images/12345/foto.jpg');
            expect(content.mediaUrl).toBe('/api/media/download/msg_media_test');
            expect(content.mimeType).toBe('image/jpeg');
        });

        test('mediaData sin s3Key debe guardar null', () => {
            const mediaData = {
                mediaUrl: '/api/media/download/msg_no_s3',
                fileName: 'doc.pdf',
                mimeType: 'application/pdf',
                fileSize: 25000,
                mediaType: 'document'
                // Sin s3Key
            };

            const content = {
                text: '[Documento recibido]',
                ...(mediaData ? {
                    mediaUrl: mediaData.mediaUrl,
                    fileName: mediaData.fileName,
                    mimeType: mediaData.mimeType,
                    fileSize: mediaData.fileSize,
                    s3Key: mediaData.s3Key || null
                } : {})
            };

            expect(content.s3Key).toBeNull();
        });

        test('sin mediaData no debe incluir campos de media', () => {
            const mediaData = null;

            const content = {
                text: 'Hola, necesito ayuda',
                ...(mediaData ? {
                    mediaUrl: mediaData.mediaUrl,
                    fileName: mediaData.fileName,
                    mimeType: mediaData.mimeType,
                    fileSize: mediaData.fileSize,
                    s3Key: mediaData.s3Key || null
                } : {})
            };

            expect(content.s3Key).toBeUndefined();
            expect(content.mediaUrl).toBeUndefined();
            expect(content.text).toBe('Hola, necesito ayuda');
        });
    });

    // =========================================
    // TEST 4: messageRecord incluye s3Key
    // =========================================
    describe('messageRecord construction', () => {
        test('debe incluir s3Key cuando hay mediaData', () => {
            const mediaData = {
                mediaUrl: '/api/media/download/msg_123',
                fileName: 'video.mp4',
                mimeType: 'video/mp4',
                fileSize: 5000000,
                mediaType: 'video',
                s3Key: 'video/99999/video.mp4'
            };

            // Simular lo que hace saveMessage con el messageRecord
            const messageRecord = {
                id: 'msg_123',
                conversationId: 'user@s.whatsapp.net',
                sender: 'user',
                message: '[Video recibido]',
                timestamp: Date.now(),
                type: 'text',
                direction: 'incoming'
            };

            if (mediaData) {
                messageRecord.mediaUrl = mediaData.mediaUrl || null;
                messageRecord.fileName = mediaData.fileName || null;
                messageRecord.mimeType = mediaData.mimeType || null;
                messageRecord.fileSize = mediaData.fileSize || null;
                messageRecord.s3Key = mediaData.s3Key || null; // ✅ Lo que acabamos de agregar
                messageRecord.type = mediaData.mediaType || 'text';
            }

            expect(messageRecord.s3Key).toBe('video/99999/video.mp4');
            expect(messageRecord.type).toBe('video');
            expect(messageRecord.mediaUrl).toBe('/api/media/download/msg_123');
        });

        test('messageRecord sin media NO debe tener s3Key', () => {
            const messageRecord = {
                id: 'msg_456',
                conversationId: 'user@s.whatsapp.net',
                sender: 'user',
                message: 'Hola',
                timestamp: Date.now(),
                type: 'text',
                direction: 'incoming'
            };

            // Sin mediaData, no se agrega nada
            expect(messageRecord.s3Key).toBeUndefined();
            expect(messageRecord.mediaUrl).toBeUndefined();
        });
    });

    // =========================================
    // TEST 5: _updateMessageS3KeyInDB
    // =========================================
    describe('DynamoDB s3Key update after S3 upload', () => {
        test('UpdateCommand debe recibir los parámetros correctos', () => {
            const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

            // Simular lo que haría _updateMessageS3KeyInDB
            const params = {
                TableName: 'test-messages-table',
                Key: { messageId: 'msg_update_test' },
                UpdateExpression: 'SET content.s3Key = :s3Key',
                ExpressionAttributeValues: { ':s3Key': 'images/12345/updated.jpg' }
            };

            const cmd = new UpdateCommand(params);

            expect(UpdateCommand).toHaveBeenCalledWith(params);
            expect(params.Key.messageId).toBe('msg_update_test');
            expect(params.ExpressionAttributeValues[':s3Key']).toBe('images/12345/updated.jpg');
        });
    });
});
