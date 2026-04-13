import path from 'path';
import 'source-map-support/register.js';
import { Database } from 'bun:sqlite';
import Utilities from '../helpers/utilities.js';
import { SqliteLogger } from './sqlite_logger.js';

/**
 * @class BunLogger
 * SQLite-backed logger for the Bun runtime, using the built-in `bun:sqlite` module.
 * Logs are stored in the 'logs' directory with a database file named after the current date (YYYY-MM-DD.db).
 * If database logging fails, it falls back to a legacy file-based logging mechanism.
 *
 * Only bundled in Bun targets via conditional exports.
 */
export default class BunLogger extends SqliteLogger {
    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        const dbPath = path.join(logsDir, `${Utilities.getCurrentDateISO()}.db`);
        console.log('Initializing BunLogger with DB path:', dbPath);
        super(new Database(dbPath));
    }
}