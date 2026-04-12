/**
 * Grab-bag of small helper functions shared across the bot. All members are
 * static; you never need to instantiate this class.
 */
export default class Utilities {
    /**
     * Returns the current local date and time as a single space-separated
     * string suitable for log lines (e.g. `"4/12/2026 10:15:00 AM"`).
     */
    static formatLocalDateTime(): string {
        return new Date().toLocaleString().replace(', ', ' ');
    }

    /**
     * Returns today's date in ISO 8601 `YYYY-MM-DD` form. Useful for naming
     * per-day log files and database rollovers.
     */
    static getCurrentDateISO(): string {
        return new Date().toISOString().slice(0, 10);
    }
}
