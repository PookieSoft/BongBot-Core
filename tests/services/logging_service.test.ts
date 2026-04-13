import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Logger } from '../../src/helpers/interfaces.js';

const mockRuntimeLoggerInstance: Logger = {
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

const MockRuntimeLogger = jest.fn(() => mockRuntimeLoggerInstance);
const MockFileLogger = jest.fn(() => mockFileLoggerInstance);

// Mock the self-reference that logging_service.ts imports.
// jest.config.ts routes this to src/loggers/node_runtime_logger for tests
jest.unstable_mockModule('@pookiesoft/bongbot-core/runtime-logger', () => ({
    default: MockRuntimeLogger,
}));

jest.unstable_mockModule('../../src/loggers/file_logger.js', () => ({
    default: MockFileLogger,
}));

describe('LoggingService', () => {
    let LOGGER: typeof import('../../src/services/logging_service.js').default;
    let originalDefaultLogger: string | undefined;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalDefaultLogger = process.env.DEFAULT_LOGGER;
        delete process.env.DEFAULT_LOGGER;

        jest.resetModules();

        const module = await import('../../src/services/logging_service.js');
        LOGGER = module.default;
    });

    afterEach(() => {
        if (originalDefaultLogger) {
            process.env.DEFAULT_LOGGER = originalDefaultLogger;
        } else {
            delete process.env.DEFAULT_LOGGER;
        }
        LOGGER.closeAll();
    });

    describe('default getter', () => {
        it('should return the default runtime logger when DEFAULT_LOGGER is not set', () => {
            const logger = LOGGER.default;
            expect(logger).toBe(mockRuntimeLoggerInstance);
        });

        it('should return the file logger when DEFAULT_LOGGER is set to "file"', async () => {
            process.env.DEFAULT_LOGGER = 'file';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockFileLoggerInstance);
        });

        it('should return the default logger when DEFAULT_LOGGER is set to "default"', async () => {
            process.env.DEFAULT_LOGGER = 'default';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockRuntimeLoggerInstance);
        });

        it('should fall back to the default logger and warn when DEFAULT_LOGGER is unknown', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.DEFAULT_LOGGER = 'bunn';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            const logger = module.default.default;
            expect(logger).toBe(mockRuntimeLoggerInstance);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Logger "bunn" is not found, switching to "default".');
            consoleWarnSpy.mockRestore();
        });

        it('should return the same logger instance on subsequent calls', () => {
            const logger1 = LOGGER.default;
            const logger2 = LOGGER.default;
            expect(logger1).toBe(logger2);
            expect(MockRuntimeLogger).toHaveBeenCalledTimes(1);
        });

        it('should warn when requesting node logger in simulated Bun runtime', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            // Set globalThis.Bun before resetting modules so the new module sees it
            (globalThis as any).Bun = {};
            process.env.DEFAULT_LOGGER = 'node';
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');
            // Register a 'node' logger
            const mockNodeLogger = jest.fn(() => mockFileLoggerInstance);
            module.default.register('node', mockNodeLogger);
            // Request the Node logger in "Bun" runtime - should be incompatible
            const logger = module.default.default;
            // Verify the logger was not instantiated (fallback to default instead)
            expect(mockNodeLogger).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith('Logger "node" is runtime incompatible, switching to "default".');
            // Clean up
            delete (globalThis as any).Bun;
            consoleWarnSpy.mockRestore();
        });
    });

    describe('log method', () => {
        it('should call error method when passed an Error instance', async () => {
            const testError = new Error('Test error message');
            await LOGGER.log(testError);
            expect(mockRuntimeLoggerInstance.error).toHaveBeenCalledWith(testError);
        });

        it('should call debug method when passed a string', async () => {
            await LOGGER.log('Test debug message');
            expect(mockRuntimeLoggerInstance.debug).toHaveBeenCalledWith('Test debug message');
        });

        it('should stringify and call debug method when passed an object', async () => {
            const testObj = { key: 'value', num: 123 };
            await LOGGER.log(testObj);
            expect(mockRuntimeLoggerInstance.debug).toHaveBeenCalledWith(JSON.stringify(testObj));
        });

        it('should stringify and call debug method when passed an array', async () => {
            const testArray = [1, 2, 3];
            await LOGGER.log(testArray);
            expect(mockRuntimeLoggerInstance.debug).toHaveBeenCalledWith(JSON.stringify(testArray));
        });

        it('should stringify and call debug method when passed a number', async () => {
            await LOGGER.log(42);
            expect(mockRuntimeLoggerInstance.debug).toHaveBeenCalledWith('42');
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
        });

        it('should create separate instances for default and file loggers', async () => {
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

            expect(mockRuntimeLoggerInstance.close).toHaveBeenCalled();
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
            MockRuntimeLogger.mockReturnValueOnce(loggerWithoutClose);

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
            MockRuntimeLogger.mockClear();

            // Getting logger again should create a new instance
            module.default.default;
            expect(MockRuntimeLogger).toHaveBeenCalledTimes(1);
        });
    });

    describe('register method', () => {
        it('should register a custom logger and make it accessible within the same module instance', async () => {
            jest.resetModules();
            const module = await import('../../src/services/logging_service.js');

            const customLoggerInstance: Logger = {
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
                close: jest.fn(),
            };
            const CustomLogger = jest.fn(() => customLoggerInstance);

            module.default.register('custom', CustomLogger);
            process.env.DEFAULT_LOGGER = 'custom';

            // Don't reset modules - just access the logger from the same instance
            const logger = module.default.default;

            expect(logger).toBe(customLoggerInstance);
        });
    });
});
