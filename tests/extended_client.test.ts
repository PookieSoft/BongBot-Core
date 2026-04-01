import { jest, describe, test, expect } from '@jest/globals';

jest.unstable_mockModule('discord.js', () => {
    class MockClient {
        constructor(public options: any) {}
    }
    class MockCollection extends Map {}
    return {
        Client: MockClient,
        ClientOptions: {},
        Collection: MockCollection,
    };
});

const { ExtendedClient } = await import('../src/extended_client.js');

describe('ExtendedClient', () => {
    const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    };

    const mockData = {
        repoUrl: 'https://github.com/test/repo',
        owner: 'test',
        repo: 'repo',
        branchName: 'main',
        commitUrl: 'https://github.com/test/repo/commit/abc1234',
        shortHash: 'abc1234',
        commitMessage: 'test commit',
        tag: 'v1.0.0',
    };

    test('sets logger, version, and deploymentInfo from constructor args', () => {
        const client = new ExtendedClient({ intents: [] } as any, mockLogger as any, mockData);
        expect(client.logger).toBe(mockLogger);
        expect(client.version).toBe('v1.0.0');
        expect(client.deploymentInfo).toBe(mockData);
    });

    test('initializes commands as empty Collection', () => {
        const client = new ExtendedClient({ intents: [] } as any, mockLogger as any, mockData);
        expect(client.commands).toBeInstanceOf(Map);
        expect(client.commands.size).toBe(0);
    });

    test('passes options to parent Client constructor', () => {
        const options = { intents: [1, 2, 3] } as any;
        const client = new ExtendedClient(options, mockLogger as any, mockData);
        expect((client as any).options).toEqual(options);
    });
});
