import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockCurrentDateISO = '2024-01-15';

jest.unstable_mockModule('../../src/helpers/utilities.js', () => ({
    default: {
        getCurrentDateISO: jest.fn(() => mockCurrentDateISO),
        formatLocalDateTime: jest.fn(),
    },
}));

jest.unstable_mockModule('fs/promises', () => ({
    default: { access: jest.fn(), writeFile: jest.fn(), appendFile: jest.fn() },
    access: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
}));

describe('NodeLogger', () => {
    let NodeLogger: typeof import('../../src/loggers/node_logger.js').default;
    let mockDb: any;
    let mockRun: jest.Mock;
    let mockPrepare: jest.Mock;
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // @ts-ignore
        mockRun = globalThis.__mockBetterSqliteRun;
        // @ts-ignore
        mockPrepare = globalThis.__mockBetterSqlitePrepare;
        // @ts-ignore
        mockDb = globalThis.__mockBetterSqliteDb;

        mockRun.mockReset();
        mockPrepare.mockReset();
        mockDb.exec.mockReset();
        mockDb.close.mockReset();
        mockPrepare.mockReturnValue({ run: mockRun });

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        jest.resetModules();
        const module = await import('../../src/loggers/node_logger.js');
        NodeLogger = module.default;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should open a database at a path named after the current date', () => {
            new NodeLogger();
            expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS logs'));
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'));
        });

        it('should log the initialization message to console', () => {
            new NodeLogger();
            expect(consoleLogSpy).toHaveBeenCalledWith(
                'Initializing NodeLogger with DB path:',
                expect.stringContaining(`${mockCurrentDateISO}.db`)
            );
        });
    });
});
