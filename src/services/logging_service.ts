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
     * The active `Logger` implementation, resolved via the `DEFAULT_LOGGER`
     * env var against the registry in {@link LoggerService}. Built-in keys:
     * - `default` — SQLite-backed {@link DefaultLogger} (also used when the
     *   env var is unset or refers to an unknown logger)
     * - `file` — {@link FileLogger}, useful for local dev
     * - `bun` — {@link BunLogger}, for projects running under the Bun runtime
     */
    get default(): Logger {
        return LoggerService.getInstance().getLogger(process.env.DEFAULT_LOGGER || 'default');
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

    private loggerMapping: { [key: string]: new () => Logger } = {
        'default': DefaultLogger,
        'bun': BunLogger,
        'file': FileLogger,
    };

    private constructor() {}

    static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    getLogger(name: string): Logger {
        if (!this.loggerMapping[name]) {
            console.log(`Logger "${name}" not found, defaulting to "default" logger.`);
            return this.getLogger('default');
        }
        if (!this.connections.has(name)) {
            this.connections.set(name, new this.loggerMapping[name]());
        }
        return this.connections.get(name)!;
    }

    closeAll(): void {
        for (const logger of this.connections.values()) {
            logger.close?.();
        }
        this.connections.clear();
    }
}
