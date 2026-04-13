import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockCurrentDateISO = '2024-01-15';
const mockFormattedDateTime = '1/15/2024 10:30:00 AM';

jest.unstable_mockModule('../../src/helpers/utilities.js', () => ({
    default: {
        getCurrentDateISO: jest.fn(() => mockCurrentDateISO),
        formatLocalDateTime: jest.fn(() => mockFormattedDateTime),
    },
}));

const mockAccess = jest.fn<() => Promise<void>>();
const mockWriteFile = jest.fn<() => Promise<void>>();
const mockAppendFile = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('fs/promises', () => ({
    default: {
        access: mockAccess,
        writeFile: mockWriteFile,
        appendFile: mockAppendFile,
    },
    access: mockAccess,
    writeFile: mockWriteFile,
    appendFile: mockAppendFile,
}));

const mockBunRun = jest.fn();
const mockBunPrepare = jest.fn(() => ({ run: mockBunRun }));
const mockBunExec = jest.fn();
const mockBunClose = jest.fn();
const MockBunDatabase = jest.fn(() => ({
    prepare: mockBunPrepare,
    exec: mockBunExec,
    close: mockBunClose,
}));

const mockRequireFn = jest.fn((id: string) => {
    if (id === 'bun:sqlite') return { Database: MockBunDatabase };
    throw new Error(`Unexpected require: ${id}`);
});

jest.unstable_mockModule('module', () => ({
    createRequire: jest.fn(() => mockRequireFn),
}));

describe('BunLogger', () => {
    let BunLogger: typeof import('../../src/loggers/bun_logger.js').default;
    let originalSessionId: string | undefined;
    let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
    let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalSessionId = process.env.SESSION_ID;
        process.env.SESSION_ID = 'test-session-id-123';

        mockBunRun.mockReset();
        mockBunPrepare.mockReset();
        mockBunExec.mockReset();
        mockBunClose.mockReset();
        MockBunDatabase.mockReset();

        mockBunPrepare.mockReturnValue({ run: mockBunRun });
        MockBunDatabase.mockImplementation(() => ({
            prepare: mockBunPrepare,
            exec: mockBunExec,
            close: mockBunClose,
        }));

        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
        consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        jest.resetModules();
        const module = await import('../../src/loggers/bun_logger.js');
        BunLogger = module.default;
    });

    afterEach(() => {
        if (originalSessionId) {
            process.env.SESSION_ID = originalSessionId;
        } else {
            delete process.env.SESSION_ID;
        }
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should load bun:sqlite via createRequire', () => {
            new BunLogger();
            expect(mockRequireFn).toHaveBeenCalledWith('bun:sqlite');
            expect(MockBunDatabase).toHaveBeenCalledWith(expect.stringContaining(`${mockCurrentDateISO}.db`));
        });

        it('should initialize the database and create logs table', () => {
            new BunLogger();
            expect(mockBunExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS logs'));
            expect(mockBunPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'));
        });

        it('should log the initialization message to console', () => {
            new BunLogger();
            expect(consoleLogSpy).toHaveBeenCalledWith('Initializing BunLogger with DB path:', expect.stringContaining(`${mockCurrentDateISO}.db`));
        });
    });

    describe('info', () => {
        it('should insert log entry with INFO level and print to console', () => {
            const logger = new BunLogger();
            logger.info('Test info message');

            expect(mockBunRun).toHaveBeenCalledWith('Test info message', null, 'INFO', 'test-session-id-123', null);
            expect(consoleInfoSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | Test info message`);
        });

        it('should handle optional stack parameter', () => {
            const logger = new BunLogger();
            logger.info('Test info message', 'Stack trace here');

            expect(mockBunRun).toHaveBeenCalledWith('Test info message', 'Stack trace here', 'INFO', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const logger = new BunLogger();
            const mockInteraction = { id: 'interaction-abc-123' } as any;
            logger.info('Test info message', undefined, mockInteraction);

            expect(mockBunRun).toHaveBeenCalledWith('Test info message', null, 'INFO', 'test-session-id-123', 'interaction-abc-123');
        });
    });

    describe('debug', () => {
        it('should insert log entry with DEBUG level and print to console', () => {
            const logger = new BunLogger();
            logger.debug('Test debug message');

            expect(mockBunRun).toHaveBeenCalledWith('Test debug message', null, 'DEBUG', 'test-session-id-123', null);
            expect(consoleDebugSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | Test debug message`);
        });

        it('should handle optional stack parameter', () => {
            const logger = new BunLogger();
            logger.debug('Test debug message', 'Debug stack');

            expect(mockBunRun).toHaveBeenCalledWith('Test debug message', 'Debug stack', 'DEBUG', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const logger = new BunLogger();
            const mockInteraction = { id: 'interaction-abc-123' } as any;
            logger.debug('Test debug message', undefined, mockInteraction);

            expect(mockBunRun).toHaveBeenCalledWith('Test debug message', null, 'DEBUG', 'test-session-id-123', 'interaction-abc-123');
        });
    });

    describe('error', () => {
        it('should insert log entry with ERROR level and print to console', () => {
            const logger = new BunLogger();
            const testError = new Error('Test error message');
            testError.stack = 'Error stack trace';

            logger.error(testError);

            expect(mockBunRun).toHaveBeenCalledWith('Test error message', 'Error stack trace', 'ERROR', 'test-session-id-123', null);
            expect(consoleErrorSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | An Error Occurred - check logs for details.`);
        });

        it('should handle error without stack', () => {
            const logger = new BunLogger();
            const testError = new Error('Test error message');
            delete testError.stack;

            logger.error(testError);

            expect(mockBunRun).toHaveBeenCalledWith('Test error message', null, 'ERROR', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const logger = new BunLogger();
            const testError = new Error('Test error message');
            testError.stack = 'Error stack trace';
            const mockInteraction = { id: 'interaction-abc-123' } as any;

            logger.error(testError, mockInteraction);

            expect(mockBunRun).toHaveBeenCalledWith('Test error message', 'Error stack trace', 'ERROR', 'test-session-id-123', 'interaction-abc-123');
        });
    });

    describe('close', () => {
        it('should close the database connection', () => {
            const logger = new BunLogger();
            logger.close();

            expect(mockBunClose).toHaveBeenCalled();
        });
    });

    describe('legacy fallback logging', () => {
        it('should fallback to file logging when DB insert fails', async () => {
            mockBunRun.mockImplementation(() => {
                throw new Error('DB insert failed');
            });
            mockAccess.mockRejectedValue(new Error('File not found'));
            mockWriteFile.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            const logger = new BunLogger();
            logger.info('Fallback test message');

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to log to DB:', expect.any(Error), 'falling back to legacy file logger');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('.log'), 'Logger Initialised\n\n');
            expect(mockAppendFile).toHaveBeenCalled();
        });

        it('should append to existing log file when it exists', async () => {
            mockBunRun.mockImplementation(() => {
                throw new Error('DB insert failed');
            });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            const logger = new BunLogger();
            logger.debug('Append test message');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockWriteFile).not.toHaveBeenCalled();
            expect(mockAppendFile).toHaveBeenCalledWith(
                expect.stringContaining('.log'),
                expect.stringContaining('Append test message')
            );
        });

        it('should handle legacy append failure gracefully', async () => {
            mockBunRun.mockImplementation(() => {
                throw new Error('DB insert failed');
            });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockRejectedValue(new Error('Append failed'));

            const logger = new BunLogger();
            logger.info('Append fail test');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to append to log file:', expect.any(Error));
        });

        it('should include stack trace in legacy log when present', async () => {
            mockBunRun.mockImplementation(() => {
                throw new Error('DB insert failed');
            });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            const logger = new BunLogger();
            logger.info('Message with stack', 'Stack trace content');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockAppendFile).toHaveBeenCalledWith(
                expect.stringContaining('.log'),
                expect.stringContaining('Stack trace content')
            );
        });

        it('should handle logLegacy function throwing error', async () => {
            mockBunRun.mockImplementation(() => {
                throw new Error('DB insert failed');
            });
            mockAccess.mockRejectedValue(new Error('Access error'));
            mockWriteFile.mockRejectedValue(new Error('Write failed'));

            const logger = new BunLogger();
            logger.info('Test message');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to log to legacy file:', expect.any(Error));
        });

        it('should handle error object without message property', () => {
            const logger = new BunLogger();
            const errorWithoutMessage = { stack: 'Custom stack trace' } as unknown as Error;
            Object.defineProperty(errorWithoutMessage, 'message', { value: '' });

            logger.error(errorWithoutMessage);

            expect(mockBunRun).toHaveBeenCalledWith(expect.any(String), 'Custom stack trace', 'ERROR', 'test-session-id-123', null);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });
});
