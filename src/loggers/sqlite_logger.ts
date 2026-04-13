import path from 'path';
import fsp from 'fs/promises';
import 'source-map-support/register.js';
import { Logger } from '../helpers/interfaces.js';
import Utilities from '../helpers/utilities.js';
import { ChatInputCommandInteraction } from 'discord.js';

export interface SqliteStatement {
    run(...params: unknown[]): unknown;
}

export interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
    close(): void;
}

/**
 * @abstract SqliteLogger
 * Shared SQLite-backed logger base class for Node and Bun runtimes.
 *
 * Subclasses supply a runtime-appropriate `SqliteDatabase` instance via
 * `super(db)` and own only their constructor. All logging logic, the DB
 * schema, the prepared statement, and the legacy file fallback live here.
 */
export abstract class SqliteLogger implements Logger {
    private readonly stmt: SqliteStatement;

    protected constructor(private readonly db: SqliteDatabase) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                correlation_id TEXT,
                session_id TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                message TEXT NOT NULL,
                stack TEXT,
                level TEXT NOT NULL
            )
        `);
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
        this.log(`${error.message || error}`, error.stack, 'ERROR', interaction?.id);
        console.error(`${Utilities.formatLocalDateTime()} | An Error Occurred - check logs for details.`);
    }

    close(): void {
        this.db.close();
    }

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
