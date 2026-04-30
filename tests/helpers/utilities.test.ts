import { describe, test, expect } from '@jest/globals';

const { default: Utilities } = await import('../../src/helpers/utilities.js');

describe('Utilities', () => {
    test('formatLocalDateTime should return a non-empty string', () => {
        const result = Utilities.formatLocalDateTime();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    test('formatLocalDateTime should not contain a comma followed by space', () => {
        const result = Utilities.formatLocalDateTime();
        expect(result).not.toContain(', ');
    });

    test('getCurrentDateISO should return a date string in YYYY-MM-DD format', () => {
        const result = Utilities.getCurrentDateISO();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("getCurrentDateISO should return today's date", () => {
        const result = Utilities.getCurrentDateISO();
        const expected = new Date().toISOString().slice(0, 10);
        expect(result).toBe(expected);
    });
});
