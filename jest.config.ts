import type { Config } from 'jest';

const config: Config = {
    testEnvironment: 'node',

    // ✅ Handle TypeScript + ESM via swc (ts-jest does not support TypeScript 7)
    transform: {
        '^.+\\.[tj]sx?$': [
            '@swc/jest',
            {
                jsc: {
                    parser: {
                        syntax: 'typescript',
                        tsx: false,
                        decorators: true,
                    },
                    target: 'esnext',
                    keepClassNames: true,
                },
                // Emit ES modules so Jest's ESM runtime can consume the output
                module: { type: 'es6' },
            },
        ],
    },
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // ✅ Fix imports like "./something.js" inside ESM
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@pookiesoft/bongbot-core/runtime-logger$': '<rootDir>/src/loggers/node_logger',
        '^bun:sqlite$': '<rootDir>/tests/mocks/bun-sqlite.ts',
    },

    // ✅ Optional resolver for tsconfig paths
    resolver: 'ts-jest-resolver',

    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

    // ✅ Ignore transformation for ESM-compatible node_modules
    transformIgnorePatterns: [
        'node_modules/(?!(msw|@mswjs|@bundled-es-modules|until-async|strict-event-emitter|outvariant|@inquirer|statuses)/)',
    ],

    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.{js,ts}', '!**/node_modules/**', '!**/dist/**'],
    coverageReporters: ['text', 'text-summary', 'json', 'json-summary', 'lcov'],
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '/babel.config.js',
        '/jest.config.ts',
        '/tests/utils/*',
        '/tests/mocks/*',
        '/coverage/*',
        '/dist/*',
    ],

    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: './test-results',
                outputName: 'junit.xml',
                ancestorSeparator: ' › ',
                uniqueOutputName: 'false',
                suiteNameTemplate: '{filepath}',
                classNameTemplate: '{classname}',
                titleTemplate: '{title}',
            },
        ],
    ],

    // Cap per-worker memory to keep the suite's footprint predictable in CI
    workerIdleMemoryLimit: '1024MB',
};

export default config;
