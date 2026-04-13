import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { SqliteLogger } from '../../src/loggers/sqlite_logger.js';

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

describe('SqliteLogger', () => {
    let mockRun: jest.Mock;
    let mockPrepare: jest.Mock;
    let mockExec: jest.Mock;
    let mockClose: jest.Mock;
    let mockDb: any;
    let logger: SqliteLogger;
    let originalSessionId: string | undefined;
    let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
    let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalSessionId = process.env.SESSION_ID;
        process.env.SESSION_ID = 'test-session-id-123';

        mockRun = jest.fn();
        mockPrepare = jest.fn(() => ({ run: mockRun }));
        mockExec = jest.fn();
        mockClose = jest.fn();
        mockDb = { exec: mockExec, prepare: mockPrepare, close: mockClose };

        consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
        consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        jest.resetModules();
        const { SqliteLogger } = await import('../../src/loggers/sqlite_logger.js');

        class TestLogger extends SqliteLogger {
            constructor() { super(mockDb); }
        }

        logger = new TestLogger();
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
        it('should initialize the database schema', () => {
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS logs'));
        });

        it('should prepare the insert statement', () => {
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'));
        });
    });

    describe('info', () => {
        it('should insert log entry with INFO level and print to console', () => {
            logger.info('Test info message');
            expect(mockRun).toHaveBeenCalledWith('Test info message', null, 'INFO', 'test-session-id-123', null);
            expect(consoleInfoSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | Test info message`);
        });

        it('should pass stack when provided', () => {
            logger.info('Test info message', 'Stack trace here');
            expect(mockRun).toHaveBeenCalledWith('Test info message', 'Stack trace here', 'INFO', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const mockInteraction = { id: 'interaction-abc-123' } as any;
            logger.info('Test info message', undefined, mockInteraction);
            expect(mockRun).toHaveBeenCalledWith('Test info message', null, 'INFO', 'test-session-id-123', 'interaction-abc-123');
        });
    });

    describe('debug', () => {
        it('should insert log entry with DEBUG level and print to console', () => {
            logger.debug('Test debug message');
            expect(mockRun).toHaveBeenCalledWith('Test debug message', null, 'DEBUG', 'test-session-id-123', null);
            expect(consoleDebugSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | Test debug message`);
        });

        it('should pass stack when provided', () => {
            logger.debug('Test debug message', 'Debug stack');
            expect(mockRun).toHaveBeenCalledWith('Test debug message', 'Debug stack', 'DEBUG', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const mockInteraction = { id: 'interaction-abc-123' } as any;
            logger.debug('Test debug message', undefined, mockInteraction);
            expect(mockRun).toHaveBeenCalledWith('Test debug message', null, 'DEBUG', 'test-session-id-123', 'interaction-abc-123');
        });
    });

    describe('error', () => {
        it('should insert log entry with ERROR level and print to console', () => {
            const testError = new Error('Test error message');
            testError.stack = 'Error stack trace';
            logger.error(testError);
            expect(mockRun).toHaveBeenCalledWith('Test error message', 'Error stack trace', 'ERROR', 'test-session-id-123', null);
            expect(consoleErrorSpy).toHaveBeenCalledWith(`${mockFormattedDateTime} | An Error Occurred - check logs for details.`);
        });

        it('should handle error without stack', () => {
            const testError = new Error('Test error message');
            delete testError.stack;
            logger.error(testError);
            expect(mockRun).toHaveBeenCalledWith('Test error message', null, 'ERROR', 'test-session-id-123', null);
        });

        it('should include correlation id when interaction is provided', () => {
            const testError = new Error('Test error message');
            testError.stack = 'Error stack trace';
            const mockInteraction = { id: 'interaction-abc-123' } as any;
            logger.error(testError, mockInteraction);
            expect(mockRun).toHaveBeenCalledWith('Test error message', 'Error stack trace', 'ERROR', 'test-session-id-123', 'interaction-abc-123');
        });

        it('should handle error object without message property', () => {
            const errorWithoutMessage = { stack: 'Custom stack trace' } as unknown as Error;
            Object.defineProperty(errorWithoutMessage, 'message', { value: '' });
            logger.error(errorWithoutMessage);
            expect(mockRun).toHaveBeenCalledWith(expect.any(String), 'Custom stack trace', 'ERROR', 'test-session-id-123', null);
        });
    });

    describe('close', () => {
        it('should close the database connection', () => {
            logger.close();
            expect(mockClose).toHaveBeenCalled();
        });
    });

    describe('legacy fallback logging', () => {
        it('should fallback to file logging when DB insert fails', async () => {
            mockRun.mockImplementation(() => { throw new Error('DB insert failed'); });
            mockAccess.mockRejectedValue(new Error('File not found'));
            mockWriteFile.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            logger.info('Fallback test message');

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to log to DB:', expect.any(Error), 'falling back to legacy file logger');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('.log'), 'Logger Initialised\n\n');
            expect(mockAppendFile).toHaveBeenCalled();
        });

        it('should append to existing log file when it exists', async () => {
            mockRun.mockImplementation(() => { throw new Error('DB insert failed'); });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            logger.debug('Append test message');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockWriteFile).not.toHaveBeenCalled();
            expect(mockAppendFile).toHaveBeenCalledWith(
                expect.stringContaining('.log'),
                expect.stringContaining('Append test message')
            );
        });

        it('should handle legacy append failure gracefully', async () => {
            mockRun.mockImplementation(() => { throw new Error('DB insert failed'); });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockRejectedValue(new Error('Append failed'));

            logger.info('Append fail test');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to append to log file:', expect.any(Error));
        });

        it('should include stack trace in legacy log when present', async () => {
            mockRun.mockImplementation(() => { throw new Error('DB insert failed'); });
            mockAccess.mockResolvedValue(undefined);
            mockAppendFile.mockResolvedValue(undefined);

            logger.info('Message with stack', 'Stack trace content');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockAppendFile).toHaveBeenCalledWith(
                expect.stringContaining('.log'),
                expect.stringContaining('Stack trace content')
            );
        });

        it('should handle logLegacy throwing an error', async () => {
            mockRun.mockImplementation(() => { throw new Error('DB insert failed'); });
            mockAccess.mockRejectedValue(new Error('Access error'));
            mockWriteFile.mockRejectedValue(new Error('Write failed'));

            logger.info('Test message');

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to log to legacy file:', expect.any(Error));
        });
    });
});
