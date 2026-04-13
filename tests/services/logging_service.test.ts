import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Logger } from '../../src/helpers/interfaces.js';

const mockNodeLoggerInstance: Logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
};

const mockFileLoggerInstance: Logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
};

const mockBunLoggerInstance: Logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
};

const MockNodeLogger = jest.fn(() => mockNodeLoggerInstance);
const MockFileLogger = jest.fn(() => mockFileLoggerInstance);
const MockBunLogger = jest.fn(() => mockBunLoggerInstance);

jest.unstable_mockModule('../../src/loggers/node_logger.js', () => ({
    default: MockNodeLogger,
}));

jest.unstable_mockModule('../../src/loggers/file_logger.js', () => ({
    default: MockFileLogger,
}));

jest.unstable_mockModule('../../src/loggers/bun_logger.js', () => ({
    default: MockBunLogger,
}));

describe('LoggingService', () => {
    let LOGGER: typeof import('../../src/services/logging_service.js').default;
    let originalNodeLogger: string | undefined;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalNodeLogger = process.env.DEFAULT_LOGGER;
        delete process.env.DEFAULT_LOGGER;

        jest.resetModules();

        const module = await import('../../src/services/logging_service.js');
        LOGGER = module.default;
    });

    afterEach(() => {
        if (originalNodeLogger) {
            process.env.DEFAULT_LOGGER = originalNodeLogger;
        } else {
            delete process.env.DEFAULT_LOGGER;
        }
        // @ts-ignore
        delete globalThis.Bun;
        LOGGER.closeAll();
    });

    describe('default getter', () => {
        it('should return the node logger when DEFAULT_LOGGER is not set (Node runtime)', () => {
            const logger = LOGGER.default;
            expect(logger).toBe(mockNodeLoggerInstance);
        });

        it('should return the file logger when DEFAULT_LOGGER is set to "file"', async () => {
            process.env.DEFAULT_LOGGER = 'file';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockFileLoggerInstance);
        });

        it('should return the bun logger when DEFAULT_LOGGER is set to "bun" in Bun runtime', async () => {
            // @ts-ignore
            globalThis.Bun = {};
            process.env.DEFAULT_LOGGER = 'bun';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockBunLoggerInstance);
        });

        it('should fall back to node logger and warn when DEFAULT_LOGGER is "bun" in Node runtime', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.DEFAULT_LOGGER = 'bun';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockNodeLoggerInstance);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Logger "bun" is runtime incompatible, switching to "node".');
            consoleWarnSpy.mockRestore();
        });

        it('should fall back to bun logger and warn when DEFAULT_LOGGER is "node" in Bun runtime', async () => {
            // @ts-ignore
            globalThis.Bun = {};
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.DEFAULT_LOGGER = 'node';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockBunLoggerInstance);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Logger "node" is runtime incompatible, switching to "bun".');
            consoleWarnSpy.mockRestore();
        });

        it('should fall back to the node logger and warn when DEFAULT_LOGGER is an unknown key', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.DEFAULT_LOGGER = 'bunn';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockNodeLoggerInstance);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Logger "bunn" is not found, switching to "node".');
            consoleWarnSpy.mockRestore();
        });

        it('should return the same logger instance on subsequent calls', () => {
            const logger1 = LOGGER.default;
            const logger2 = LOGGER.default;
            expect(logger1).toBe(logger2);
            expect(MockNodeLogger).toHaveBeenCalledTimes(1);
        });
    });

    describe('log method', () => {
        it('should call error method when passed an Error instance', async () => {
            const testError = new Error('Test error message');
            await LOGGER.log(testError);
            expect(mockNodeLoggerInstance.error).toHaveBeenCalledWith(testError);
        });

        it('should call debug method when passed a string', async () => {
            await LOGGER.log('Test debug message');
            expect(mockNodeLoggerInstance.debug).toHaveBeenCalledWith('Test debug message');
        });

        it('should stringify and call debug method when passed an object', async () => {
            const testObj = { key: 'value', num: 123 };
            await LOGGER.log(testObj);
            expect(mockNodeLoggerInstance.debug).toHaveBeenCalledWith(JSON.stringify(testObj));
        });

        it('should stringify and call debug method when passed an array', async () => {
            const testArray = [1, 2, 3];
            await LOGGER.log(testArray);
            expect(mockNodeLoggerInstance.debug).toHaveBeenCalledWith(JSON.stringify(testArray));
        });

        it('should stringify and call debug method when passed a number', async () => {
            await LOGGER.log(42);
            expect(mockNodeLoggerInstance.debug).toHaveBeenCalledWith('42');
        });
    });

    describe('LoggerService singleton', () => {
        it('should reuse existing file logger connection', async () => {
            process.env.DEFAULT_LOGGER = 'file';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger1 = module.default.default;
            const logger2 = module.default.default;
            expect(logger1).toBe(logger2);
            expect(MockFileLogger).toHaveBeenCalledTimes(1);
        });

        it('should reuse existing bun logger connection in Bun runtime', async () => {
            // @ts-ignore
            globalThis.Bun = {};
            process.env.DEFAULT_LOGGER = 'bun';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger1 = module.default.default;
            const logger2 = module.default.default;
            expect(logger1).toBe(logger2);
            expect(MockBunLogger).toHaveBeenCalledTimes(1);
        });

        it('should reuse the node fallback when bun is requested in Node runtime', async () => {
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.DEFAULT_LOGGER = 'bun';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger1 = module.default.default;
            const logger2 = module.default.default;
            expect(logger1).toBe(mockNodeLoggerInstance);
            expect(logger1).toBe(logger2);
            expect(MockNodeLogger).toHaveBeenCalledTimes(1);
            jest.restoreAllMocks();
        });

        it('should create separate instances for node and file loggers', async () => {
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');

            delete process.env.DEFAULT_LOGGER;
            const defaultLogger = module.default.default;

            process.env.DEFAULT_LOGGER = 'file';
            const fileLogger = module.default.default;

            expect(defaultLogger).not.toBe(fileLogger);
        });
    });

    describe('closeAll method', () => {
        it('should close all logger connections', async () => {
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');

            // Access both loggers to create connections
            delete process.env.DEFAULT_LOGGER;
            module.default.default;

            process.env.DEFAULT_LOGGER = 'file';
            module.default.default;

            // Close all connections
            module.default.closeAll();

            expect(mockNodeLoggerInstance.close).toHaveBeenCalled();
            expect(mockFileLoggerInstance.close).toHaveBeenCalled();
        });

        it('should handle loggers without close method', async () => {
            jest.resetModules();

            // Create a logger without a close method
            const loggerWithoutClose: Logger = {
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            };
            MockNodeLogger.mockReturnValueOnce(loggerWithoutClose);

            const module = await import('../../src/services/logging_service.js');
            delete process.env.DEFAULT_LOGGER;
            module.default.default;

            // Should not throw when close is undefined
            expect(() => module.default.closeAll()).not.toThrow();
        });

        it('should clear connections after closeAll', async () => {
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');

            delete process.env.DEFAULT_LOGGER;
            module.default.default;
            module.default.closeAll();

            // Reset mock to track new instantiation
            MockNodeLogger.mockClear();

            // Getting logger again should create a new instance
            module.default.default;
            expect(MockNodeLogger).toHaveBeenCalledTimes(1);
        });
    });
});
