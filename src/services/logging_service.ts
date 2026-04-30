import { Logger } from '../helpers/interfaces.js';
import FileLogger from '../loggers/file_logger.js';
import RuntimeLogger from '@pookiesoft/bongbot-core/runtime-logger';

const isBun = 'Bun' in globalThis;
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
     * - `node` — SQLite-backed logger used on the Node runtime. Resolved at
     *   bundle time via the `./runtime-logger` conditional export.
     * - `bun` — SQLite-backed logger used on the Bun runtime. Resolved at
     *   bundle time via the `./runtime-logger` conditional export.
     * - `file` — {@link FileLogger}, useful for local dev.
     *
     * Only the runtime-appropriate SQLite logger is registered, so the wrong
     * implementation is never present in a bundled build.
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
     * Registers a custom logger implementation under `name`, making it
     * selectable via the `DEFAULT_LOGGER` env var or a future `register` call.
     * Registering under an existing key replaces that entry.
     *
     * @example
     * ```ts
     * import { LOGGER } from 'bongbot-core';
     * LOGGER.register('my-logger', MyLogger);
     * process.env.DEFAULT_LOGGER = 'my-logger';
     * LOGGER.default.info('using custom logger');
     * ```
     *
     * @param name    The key used to select this logger.
     * @param LoggerClass  A zero-argument constructor that produces a {@link Logger}.
     */
    register(name: string, LoggerClass: new () => Logger) {
        LoggerService.getInstance().register(name, LoggerClass);
    },
    /**
     * Closes every cached logger connection. Call this during graceful
     * shutdown or between test cases to release SQLite handles and file
     * descriptors.
     */
    closeAll() {
        LoggerService.getInstance().closeAll();
    },
};

class LoggerService {
    private static instance: LoggerService;
    private connections: Map<string, Logger> = new Map();

    private loggerMapping: { [key: string]: new () => Logger } = {};

    private constructor() {
        this.register('default', RuntimeLogger);
        this.register('file', FileLogger);
    }

    static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    getLogger(name: string): Logger {
        let targetName = name;
        const isIncompatible = (isBun && name === 'node') || (!isBun && name === 'bun');

        if (!this.loggerMapping[targetName] || isIncompatible) {
            const reason = !this.loggerMapping[targetName] ? 'not found' : 'runtime incompatible';
            console.warn(`Logger "${targetName}" is ${reason}, switching to "default".`);
            targetName = 'default';
        }
        if (!this.connections.has(targetName)) {
            const LoggerClass = this.loggerMapping[targetName];
            this.connections.set(targetName, new LoggerClass());
        }

        return this.connections.get(targetName)!;
    }

    register(name: string, LoggerClass: new () => Logger): void {
        this.loggerMapping[name] = LoggerClass;
    }

    closeAll(): void {
        for (const logger of this.connections.values()) {
            logger.close?.();
        }
        this.connections.clear();
    }
}
