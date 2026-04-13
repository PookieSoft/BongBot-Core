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
    access: jest.fn(), writeFile: jest.fn(), appendFile: jest.fn(),
}));

const mockBunRun = jest.fn();
const mockBunPrepare = jest.fn(() => ({ run: mockBunRun }));
const mockBunExec = jest.fn();
const mockBunClose = jest.fn();
const MockBunDatabase = jest.fn(() => ({
    prepare: mockBunPrepare,
    exec: mockBunExec,
    close: mockBunClose,
}));

const mockRequireFn = jest.fn((id: string) => {
    if (id === 'bun:sqlite') return { Database: MockBunDatabase };
    throw new Error(`Unexpected require: ${id}`);
});

jest.unstable_mockModule('module', () => ({
    createRequire: jest.fn(() => mockRequireFn),
}));

describe('BunLogger', () => {
    let BunLogger: typeof import('../../src/loggers/bun_logger.js').default;
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockBunRun.mockReset();
        mockBunPrepare.mockReset();
        mockBunExec.mockReset();
        mockBunClose.mockReset();
        MockBunDatabase.mockReset();

        mockBunPrepare.mockReturnValue({ run: mockBunRun });
        MockBunDatabase.mockImplementation(() => ({
            prepare: mockBunPrepare,
            exec: mockBunExec,
            close: mockBunClose,
        }));

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        jest.resetModules();
        const module = await import('../../src/loggers/bun_logger.js');
        BunLogger = module.default;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should load bun:sqlite lazily via createRequire', () => {
            new BunLogger();
            expect(mockRequireFn).toHaveBeenCalledWith('bun:sqlite');
            expect(MockBunDatabase).toHaveBeenCalledWith(expect.stringContaining(`${mockCurrentDateISO}.db`));
        });

        it('should initialize the database schema and prepared statement', () => {
            new BunLogger();
            expect(mockBunExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS logs'));
            expect(mockBunPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'));
        });

        it('should log the initialization message to console', () => {
            new BunLogger();
            expect(consoleLogSpy).toHaveBeenCalledWith(
                'Initializing BunLogger with DB path:',
                expect.stringContaining(`${mockCurrentDateISO}.db`)
            );
        });
    });
});
