import { Logger } from '../helpers/interfaces.js';
import BunLogger from '../loggers/bun_logger.js';
import DefaultLogger from '../loggers/default_logger.js';
import FileLogger from '../loggers/file_logger.js';

/**
 * Central logging surface used by BongBot and its dependents.
 *
 * Access a logger via `LOGGER.default` (which picks the right underlying
 * implementation based on env), or call the legacy `LOGGER.log(...)` shim
 * while migrating older code.
 *
 * @example
 * ```ts
 * import { LOGGER } from 'bongbot-core';
 * LOGGER.default.info('hello world');
 * ```
 */
export default {
    /**
     * The active `Logger` implementation. Returns the file-backed logger
     * when `DEFAULT_LOGGER=file` (useful for local dev), the Bun-backed
     * {@link BunLogger} when `DEFAULT_LOGGER=bun` (for projects running
     * under the Bun runtime), otherwise the SQLite-backed {@link DefaultLogger}.
     */
    get default(): Logger {
        const loggerService = LoggerService.getInstance();
        if (process.env.DEFAULT_LOGGER === 'file') return loggerService.getFileLogger(); /** use environment variable to switch loggers for local dev */
        if (process.env.DEFAULT_LOGGER === 'bun') return loggerService.getBunLogger();
        return loggerService.getDefaultLogger();
    },
    /**
     * Legacy log shim — prefer `LOGGER.default.info/debug/error` in new code.
     *
     * Routes the supplied value to the active logger:
     * - `Error` instances are logged via `logger.error`
     * - strings are logged at debug level as-is
     * - everything else is `JSON.stringify`ed and logged at debug level
     *
     * @param error Any value to log.
     */
    async log(error: any) {
        const logger = this.default;
        if (error instanceof Error) {
            logger.error(error);
            return;
        }
        logger.debug(typeof error === 'string' ? error : JSON.stringify(error));
    },
    /**
     * Closes every cached logger connection. Call this during graceful
     * shutdown or between test cases to release SQLite handles and file
     * descriptors.
     */
    closeAll() {
        LoggerService.getInstance().closeAll();
    }
}

class LoggerService {
    private static instance: LoggerService;
    private connections: Map<string, Logger> = new Map();

    private constructor() {}

    static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    getDefaultLogger(): Logger {
        if (!this.connections.has('default')) {
            this.connections.set('default', new DefaultLogger());
        }
        return this.connections.get('default')!;
    }

    getBunLogger(): Logger {
        if (!this.connections.has('bun')) {
            this.connections.set('bun', new BunLogger());
        }
        return this.connections.get('bun')!;
    }

    getFileLogger (): Logger {
        if (!this.connections.has('file')) {
            this.connections.set('file', new FileLogger());
        }
        return this.connections.get('file')!;
    }

    closeAll(): void {
        for (const logger of this.connections.values()) {
            logger.close?.();
        }
        this.connections.clear();
    }
}
