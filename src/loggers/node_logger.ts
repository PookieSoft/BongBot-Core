import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import 'source-map-support/register.js';
import Utilities from '../helpers/utilities.js';
import { SqliteDatabase, SqliteLogger } from './sqlite_logger.js';

/**
 * @class NodeLogger
 * SQLite-backed logger for the Node runtime, using the `better-sqlite3` package.
 * Logs are stored in the 'logs' directory with a database file named after the current date (YYYY-MM-DD.db).
 * If database logging fails, it falls back to a legacy file-based logging mechanism.
 */
export default class NodeLogger extends SqliteLogger {
    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        const dbPath = path.join(logsDir, `${Utilities.getCurrentDateISO()}.db`);
        console.log('Initializing NodeLogger with DB path:', dbPath);
        super(new BetterSqlite3(dbPath) as unknown as SqliteDatabase);
    }
}
