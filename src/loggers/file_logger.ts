import path from 'path';
import fs from 'fs';
import 'source-map-support/register.js';
import { Logger } from '../helpers/interfaces.js';
import Utilities from '../helpers/utilities.js';
import { ChatInputCommandInteraction } from 'discord.js';

/**
 * @class FileLogger
 * A simple file-based logger that appends log messages to a file named after the current session ID.
 * Logs are stored in the 'logs' directory.
 * This logger is intended for local development and debugging purposes, and uses session id to differentiate log files.
 */
export default class FileLogger implements Logger {
    private logFile: string;

    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        this.logFile = path.join(logsDir, `${process.env.SESSION_ID}.log`);
        try {
            fs.accessSync(this.logFile);
        } catch {
            fs.writeFileSync(this.logFile, 'Logger Initialised\n\n');
        }
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

    private log(message: string, stack: string | undefined, level: string, interaction_id?: string): void {
        const logEntry = `[${interaction_id}] [${Utilities.formatLocalDateTime()}] [${level}] ${message}${stack ? `\nStack Trace: ${stack}` : ''}\n\n`;
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (err) {
            console.error('Failed to append to log file:', err);
        }
    }
}
