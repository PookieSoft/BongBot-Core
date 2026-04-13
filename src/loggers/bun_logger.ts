import path from 'path';
import fsp from 'fs/promises';
import { createRequire } from 'module';

import 'source-map-support/register.js';
import { Logger } from '../helpers/interfaces.js';
import Utilities from '../helpers/utilities.js';
import { ChatInputCommandInteraction } from 'discord.js';

type BunSqliteStatement = {
    run(...params: unknown[]): unknown;
};

type BunSqliteDatabase = {
    exec(sql: string): void;
    prepare(sql: string): BunSqliteStatement;
    close(): void;
};

type BunSqliteModule = {
    Database: new (filename: string) => BunSqliteDatabase;
};

/**
 * @class BunLogger
 * SQLite-backed logger for the Bun runtime, using the built-in `bun:sqlite` module.
 * Logs are stored in the 'logs' directory with a database file named after the current date (YYYY-MM-DD.db).
 * If database logging fails, it falls back to a legacy file-based logging mechanism.
 * Logs include session ID, timestamp, message, stack trace, and log level.
 *
 * The `bun:sqlite` module is loaded lazily inside the constructor via `createRequire`
 * so that this file remains safe to import under Node — instantiating `BunLogger`
 * outside of Bun will throw, but merely importing it will not.
 */
export default class BunLogger implements Logger {
    private db: BunSqliteDatabase;
    private stmt: BunSqliteStatement;

    constructor() {
        const requireFn = createRequire(import.meta.url);
        const { Database } = requireFn('bun:sqlite') as BunSqliteModule;

        const logsDir = path.join(process.cwd(), 'logs');
        const dbPath = path.join(logsDir, `${Utilities.getCurrentDateISO()}.db`);
        console.log('Initializing BunLogger with DB path:', dbPath);
        this.db = new Database(dbPath);
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                correlation_id TEXT,
                session_id TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                message TEXT NOT NULL,
                stack TEXT,
                level TEXT NOT NULL
            )
        `;
        this.db.exec(createTableSQL);
        this.stmt = this.db.prepare(`
            INSERT INTO logs (message, stack, level, session_id, correlation_id)
            VALUES (?, ?, ?, ?, ?)
        `);
    }

    info(message: string, stack?: string, interaction?: ChatInputCommandInteraction): void {
        this.log(message, stack, 'INFO', interaction?.id);
        console.info(`${Utilities.formatLocalDateTime()} | ${message}`);
    }

    debug(message: string, stack?: string, interaction?: ChatInputCommandInteraction): void {
        this.log(message, stack, 'DEBUG', interaction?.id);
        console.debug(`${Utilities.formatLocalDateTime()} | ${message}`);
    }

    error(error: Error, interaction?: ChatInputCommandInteraction): void {
        const resolvedStack = error.stack;
        this.log(`${error.message || error}`, resolvedStack, 'ERROR', interaction?.id);
        console.error(`${Utilities.formatLocalDateTime()} | An Error Occurred - check logs for details.`);
    }

    close(): void { this.db.close(); }

    private log(message: string, stack: string | undefined, level: string, interaction_id?: string): void {
        try {
            this.stmt.run(message, stack || null, level, process.env.SESSION_ID, interaction_id || null);
        } catch (err) {
            console.error('Failed to log to DB:', err, 'falling back to legacy file logger');
            this.logLegacy(message, stack).catch((error) => { console.error('Failed to log to legacy file:', error); });
        }
    }

    private async logLegacy(message: string, stack: string | undefined): Promise<void> {
        const logsDir = path.join(process.cwd(), 'logs');
        const logFile = path.join(logsDir, `${Utilities.getCurrentDateISO()}.log`);
        if (!await fsp.access(logFile).then(() => true).catch(() => false)) {
            await fsp.writeFile(logFile, 'Logger Initialised\n\n');
        }
        fsp.appendFile(logFile, `${Utilities.formatLocalDateTime()} | ${message}\n${stack ? stack + '\n' : ''}\n`).catch((err) => {
            console.error('Failed to append to log file:', err);
        });
    }
}
