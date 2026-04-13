import path from 'path';
import { createRequire } from 'module';
import 'source-map-support/register.js';
import Utilities from '../helpers/utilities.js';
import { SqliteDatabase, SqliteLogger } from './sqlite_logger.js';

type BunSqliteModule = {
    Database: new (filename: string) => SqliteDatabase;
};

/**
 * @class BunLogger
 * SQLite-backed logger for the Bun runtime, using the built-in `bun:sqlite` module.
 * Logs are stored in the 'logs' directory with a database file named after the current date (YYYY-MM-DD.db).
 * If database logging fails, it falls back to a legacy file-based logging mechanism.
 *
 * The `bun:sqlite` module is loaded lazily inside the constructor via `createRequire`
 * so that this file remains safe to import under Node — instantiating `BunLogger`
 * outside of Bun will throw, but merely importing it will not.
 */
export default class BunLogger extends SqliteLogger {
    constructor() {
        const requireFn = createRequire(import.meta.url);
        const { Database } = requireFn('bun:sqlite') as BunSqliteModule;
        const logsDir = path.join(process.cwd(), 'logs');
        const dbPath = path.join(logsDir, `${Utilities.getCurrentDateISO()}.db`);
        console.log('Initializing BunLogger with DB path:', dbPath);
        super(new Database(dbPath));
    }
}
