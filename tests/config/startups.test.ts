import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mock crypto ────────────────────────────────────────────────────────────────
const mockRandomUUID = jest.fn().mockReturnValue('test-session-uuid');
jest.unstable_mockModule('crypto', () => ({
    default: { randomUUID: mockRandomUUID },
    randomUUID: mockRandomUUID,
}));

// ── Mock discord.js ────────────────────────────────────────────────────────────
class MockSlashCommandBuilder {
    name: string = '';
    setName(name: string) { this.name = name; return this; }
    toJSON() { return { name: this.name }; }
}

jest.unstable_mockModule('discord.js', () => ({
    GatewayIntentBits: { Guilds: 1, GuildMessages: 512, MessageContent: 32768 },
    MessageFlags: { Loading: 64, Ephemeral: 64 },
    SlashCommandBuilder: MockSlashCommandBuilder,
}));

// ── Mock ./index.js (validateRequiredConfig) ───────────────────────────────────
const mockValidateRequiredConfig = jest.fn();
jest.unstable_mockModule('../../src/config/index.js', () => ({
    validateRequiredConfig: mockValidateRequiredConfig,
}));

// ── Mock logging service ───────────────────────────────────────────────────────
const mockLoggerError = jest.fn();
const mockLogger = { error: mockLoggerError };
jest.unstable_mockModule('../../src/services/logging_service.js', () => ({
    default: {
        // LOGGER is the default import; LOGGER.default is passed to ExtendedClient
        default: mockLogger,
    },
}));

// ── Mock error_builder ─────────────────────────────────────────────────────────
const mockBuildUnknownError = jest.fn<any>().mockResolvedValue({
    embeds: [{ title: 'Unexpected error' }],
    flags: 64,
    isError: true,
});
jest.unstable_mockModule('../../src/helpers/error_builder.js', () => ({
    buildUnknownError: mockBuildUnknownError,
}));

// ── Mock info_card ─────────────────────────────────────────────────────────────
const mockGetRepoInfoFromAPI = jest.fn<any>().mockResolvedValue({
    repoUrl: 'https://github.com/TestOwner/TestRepo',
    owner: 'TestOwner',
    repo: 'TestRepo',
    branchName: 'main',
    commitUrl: 'https://github.com/TestOwner/TestRepo/commit/abc123',
    shortHash: 'abc123',
    commitMessage: 'Initial commit',
    tag: 'v1.0.0',
});
const mockGenerateCard = jest.fn<any>().mockResolvedValue({ title: 'TestRepo Info' });
jest.unstable_mockModule('../../src/helpers/info_card.js', () => ({
    getRepoInfoFromAPI: mockGetRepoInfoFromAPI,
    generateCard: mockGenerateCard,
}));

// ── Mock ExtendedClient ────────────────────────────────────────────────────────
// Bot instance is rebuilt in beforeEach so each test gets a fresh mock
let capturedEventHandlers: Map<string, Function>;
let mockBotInstance: any;

const MockExtendedClientCtor = jest.fn(() => mockBotInstance);

jest.unstable_mockModule('../../src/extended_client.js', () => ({
    ExtendedClient: MockExtendedClientCtor,
}));

// ── Helper: build a fresh mock bot ────────────────────────────────────────────
function buildMockBot() {
    capturedEventHandlers = new Map();

    const bot: any = {
        commands: new Map(),
        logger: mockLogger,
        user: {
            id: 'bot-user-id',
            displayAvatarURL: jest.fn(() => 'http://example.com/avatar.png'),
        },
        application: {
            commands: { set: jest.fn<any>().mockResolvedValue(undefined) },
        },
        channels: { fetch: jest.fn() },
        deploymentInfo: {
            repo: 'TestRepo',
            owner: 'TestOwner',
            branchName: 'main',
        },
        on: jest.fn((event: string, handler: Function) => {
            capturedEventHandlers.set(event, handler);
            return bot;
        }),
        login: jest.fn(),
    };

    return bot;
}

// ── Helper: trigger a captured bot event ──────────────────────────────────────
async function triggerEvent(eventName: string, ...args: any[]) {
    const handler = capturedEventHandlers.get(eventName);
    if (!handler) throw new Error(`No handler registered for "${eventName}"`);
    await handler(...args);
}

// ── Helper: create a mock interaction ─────────────────────────────────────────
function buildMockInteraction(overrides: Partial<{
    isCommand: boolean;
    commandName: string;
    replied: boolean;
    response: any;
    msgFlag: any;
}> = {}) {
    const {
        isCommand = true,
        commandName = 'test-cmd',
        replied = false,
        response = { content: 'reply content' },
        msgFlag = undefined,
    } = overrides;

    const mockCommand = {
        msgFlag,
        execute: jest.fn<any>().mockResolvedValue(response),
    };

    const interaction: any = {
        isCommand: jest.fn(() => isCommand),
        commandName,
        replied,
        deferReply: jest.fn<any>().mockResolvedValue(undefined),
        followUp: jest.fn<any>().mockResolvedValue({ id: 'msg-id' }),
        deleteReply: jest.fn<any>().mockResolvedValue(undefined),
        _mockCommand: mockCommand,
    };

    return { interaction, mockCommand };
}

// ── Helper: Discord Collection-like mock ───────────────────────────────────────
// postDeploymentMessage calls messages.filter(...).map(...) — Discord.js
// Collection methods that plain Maps do not have.
function createMockCollection(entries: [string, any][]) {
    const values = entries.map(([, v]) => v);
    return {
        filter: (fn: (v: any) => boolean) => {
            const filtered = values.filter(fn);
            return { map: (fn2: (v: any) => any) => filtered.map(fn2) };
        },
    };
}

// ── Import the module under test (after all mocks are registered) ──────────────
const {
    basicStart,
    startWithHandlers,
    startWithFunctions,
    startBot,
    commandBuilder,
} = await import('../../src/config/startups.js');

// ══════════════════════════════════════════════════════════════════════════════
describe('startups', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBotInstance = buildMockBot();
        process.env.DISCORD_API_KEY = 'mock-discord-token';
        process.env.DISCORD_CHANNEL_ID = 'mock-channel-id';
    });

    afterEach(() => {
        delete process.env.DISCORD_API_KEY;
        delete process.env.DISCORD_CHANNEL_ID;
        delete process.env.SESSION_ID;
    });

    // ── commandBuilder ──────────────────────────────────────────────────────────
    describe('commandBuilder', () => {
        test('should add valid SlashCommand commands to bot.commands and return JSON array', () => {
            const validCommand = {
                data: new MockSlashCommandBuilder(),
                execute: jest.fn(),
            };
            (validCommand.data as any).name = 'ping';

            const result = commandBuilder(mockBotInstance, [validCommand]);

            expect(mockBotInstance.commands.get('ping')).toBe(validCommand);
            expect(result).toEqual([{ name: 'ping' }]);
        });

        test('should skip commands whose data is not a SlashCommandBuilder instance', () => {
            const invalidCommand = { data: { name: 'bad' }, execute: jest.fn() };
            const result = commandBuilder(mockBotInstance, [invalidCommand]);

            expect(result).toHaveLength(0);
            expect(mockBotInstance.commands.size).toBe(0);
        });

        test('should handle a mix of valid and invalid commands', () => {
            const validCmd = { data: new MockSlashCommandBuilder(), execute: jest.fn() };
            (validCmd.data as any).name = 'valid';
            const invalidCmd = { data: null, execute: jest.fn() };

            const result = commandBuilder(mockBotInstance, [validCmd, invalidCmd]);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({ name: 'valid' });
        });

        test('should return an empty array for an empty commands input', () => {
            const result = commandBuilder(mockBotInstance, []);
            expect(result).toHaveLength(0);
        });

        test('should register multiple valid commands', () => {
            const cmd1 = { data: new MockSlashCommandBuilder(), execute: jest.fn() };
            const cmd2 = { data: new MockSlashCommandBuilder(), execute: jest.fn() };
            (cmd1.data as any).name = 'cmd1';
            (cmd2.data as any).name = 'cmd2';

            const result = commandBuilder(mockBotInstance, [cmd1, cmd2]);

            expect(result).toHaveLength(2);
            expect(mockBotInstance.commands.size).toBe(2);
        });
    });

    // ── startBot ────────────────────────────────────────────────────────────────
    describe('startBot', () => {
        const defaultConfig = {
            owner: 'TestOwner',
            repo: 'TestRepo',
            commandBuilder: jest.fn(() => []),
        };

        test('should call validateRequiredConfig', async () => {
            await startBot(defaultConfig);
            expect(mockValidateRequiredConfig).toHaveBeenCalledTimes(1);
        });

        test('should set process.env.SESSION_ID to a UUID', async () => {
            await startBot(defaultConfig);
            expect(process.env.SESSION_ID).toBe('test-session-uuid');
            expect(mockRandomUUID).toHaveBeenCalledTimes(1);
        });

        test('should call getRepoInfoFromAPI with owner and repo', async () => {
            await startBot(defaultConfig);
            expect(mockGetRepoInfoFromAPI).toHaveBeenCalledWith('TestOwner', 'TestRepo');
        });

        test('should create an ExtendedClient with Guilds, GuildMessages, MessageContent intents', async () => {
            await startBot(defaultConfig);
            expect(MockExtendedClientCtor).toHaveBeenCalledTimes(1);
            const [intentsConfig] = MockExtendedClientCtor.mock.calls[0] as any[];
            expect(intentsConfig.intents).toBeDefined();
        });

        test('should call the commandBuilder callback with the bot instance', async () => {
            const commandBuilderFn = jest.fn((bot) => []);
            await startBot({ ...defaultConfig, commandBuilder: commandBuilderFn });
            expect(commandBuilderFn).toHaveBeenCalledWith(mockBotInstance);
        });

        test('should register the interactionCreate handler by default', async () => {
            await startBot(defaultConfig);
            expect(capturedEventHandlers.has('interactionCreate')).toBe(true);
        });

        test('should register clientReady handler', async () => {
            await startBot(defaultConfig);
            expect(capturedEventHandlers.has('clientReady')).toBe(true);
        });

        test('should NOT register interactionCreate handler when excluded from handlers list', async () => {
            await startBot({ ...defaultConfig, handlers: [] });
            expect(capturedEventHandlers.has('interactionCreate')).toBe(false);
        });

        test('should register only the handlers specified in the config', async () => {
            await startBot({ ...defaultConfig, handlers: ['interactionCreate'] });
            // Only interactionCreate (plus clientReady which is always registered)
            expect(capturedEventHandlers.has('interactionCreate')).toBe(true);
        });

        test('should call bot.login with the DISCORD_API_KEY token', async () => {
            await startBot(defaultConfig);
            expect(mockBotInstance.login).toHaveBeenCalledWith('mock-discord-token');
        });

        test('should return the bot instance', async () => {
            const result = await startBot(defaultConfig);
            expect(result).toBe(mockBotInstance);
        });

        test('should use default additionalFunctions of [] when not provided', async () => {
            // Should not throw when no additionalFunctions specified
            await expect(startBot(defaultConfig)).resolves.not.toThrow();
        });
    });

    // ── basicStart / startWithHandlers / startWithFunctions wrappers ────────────
    describe('basicStart', () => {
        test('should call startBot with owner, repo, and commandBuilder', async () => {
            const cmdBuilder = jest.fn((bot) => []);
            const result = await basicStart('Owner', 'Repo', cmdBuilder);

            expect(mockGetRepoInfoFromAPI).toHaveBeenCalledWith('Owner', 'Repo');
            expect(cmdBuilder).toHaveBeenCalledWith(mockBotInstance);
            expect(result).toBe(mockBotInstance);
        });
    });

    describe('startWithHandlers', () => {
        test('should call startBot and register only the specified handlers', async () => {
            const cmdBuilder = jest.fn(() => []);
            await startWithHandlers('Owner', 'Repo', cmdBuilder, []);

            expect(capturedEventHandlers.has('interactionCreate')).toBe(false);
        });

        test('should pass through the handlers array to startBot', async () => {
            const cmdBuilder = jest.fn(() => []);
            await startWithHandlers('Owner', 'Repo', cmdBuilder, ['interactionCreate']);

            expect(capturedEventHandlers.has('interactionCreate')).toBe(true);
        });
    });

    describe('startWithFunctions', () => {
        test('should call startBot and pass additionalFunctions into the handler', async () => {
            const cmdBuilder = jest.fn(() => []);
            const { interaction, mockCommand } = buildMockInteraction();
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await startWithFunctions('Owner', 'Repo', cmdBuilder, ['onPostExecute']);
            await triggerEvent('interactionCreate', interaction);

            // The handler ran (deferReply was called), confirming additionalFunctions were passed in
            expect(interaction.deferReply).toHaveBeenCalled();
        });
    });

    // ── interactionCreate handler ───────────────────────────────────────────────
    describe('interactionCreate handler', () => {
        beforeEach(async () => {
            await startBot({
                owner: 'TestOwner',
                repo: 'TestRepo',
                commandBuilder: jest.fn(() => []),
            });
        });

        test('should return early without action for non-command interactions', async () => {
            const { interaction } = buildMockInteraction({ isCommand: false });
            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deferReply).not.toHaveBeenCalled();
            expect(interaction.followUp).not.toHaveBeenCalled();
        });

        test('should return early when command is not found in bot.commands', async () => {
            const { interaction } = buildMockInteraction({ commandName: 'unknown-cmd' });
            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deferReply).not.toHaveBeenCalled();
            expect(interaction.followUp).not.toHaveBeenCalled();
        });

        test('should defer reply with the command msgFlag', async () => {
            const { interaction, mockCommand } = buildMockInteraction({ msgFlag: 64 });
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
        });

        test('should defer reply with MessageFlags.Loading when command has no msgFlag', async () => {
            const { interaction, mockCommand } = buildMockInteraction({ msgFlag: undefined });
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            // MessageFlags.Loading is 64 in our mock
            expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
        });

        test('should call command.execute with the interaction and bot', async () => {
            const { interaction, mockCommand } = buildMockInteraction();
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(mockCommand.execute).toHaveBeenCalledWith(interaction, mockBotInstance);
        });

        test('should follow up with the response from command.execute', async () => {
            const response = { content: 'Hello!' };
            const { interaction, mockCommand } = buildMockInteraction({ response });
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.followUp).toHaveBeenCalledWith(response);
        });

        test('should not deleteReply when execute returns undefined (response?.isError nullish path)', async () => {
            // response is undefined → response?.isError is undefined, which !== true
            // This covers the optional-chain nullish branch on `response?.isError`
            const { interaction, mockCommand } = buildMockInteraction({ replied: true });
            mockCommand.execute.mockResolvedValueOnce(undefined);
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deleteReply).not.toHaveBeenCalled();
            expect(interaction.followUp).toHaveBeenCalledWith(undefined);
        });

        test('should delete reply and follow up with error when response isError is true and interaction replied', async () => {
            const errorResponse = { content: 'Oops', isError: true };
            const { interaction, mockCommand } = buildMockInteraction({
                response: errorResponse,
                replied: true,
            });
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
            expect(interaction.followUp).toHaveBeenCalledWith(errorResponse);
        });

        test('should NOT delete reply when response isError is true but interaction has not replied', async () => {
            const errorResponse = { content: 'Oops', isError: true };
            const { interaction, mockCommand } = buildMockInteraction({
                response: errorResponse,
                replied: false,
            });
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deleteReply).not.toHaveBeenCalled();
        });

        test('should call additional functions on the command if they exist', async () => {
            // Set up bot with additionalFunctions
            mockBotInstance = buildMockBot();
            await startBot({
                owner: 'TestOwner',
                repo: 'TestRepo',
                commandBuilder: jest.fn(() => []),
                additionalFunctions: ['afterExecute'],
            });

            const afterExecute = jest.fn<any>().mockResolvedValue(undefined);
            const { interaction, mockCommand } = buildMockInteraction();
            (mockCommand as any).afterExecute = afterExecute;
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(afterExecute).toHaveBeenCalledWith(interaction, { id: 'msg-id' });
        });

        test('should skip additional function names that do not exist on the command', async () => {
            mockBotInstance = buildMockBot();
            await startBot({
                owner: 'TestOwner',
                repo: 'TestRepo',
                commandBuilder: jest.fn(() => []),
                additionalFunctions: ['nonExistentFunction'],
            });

            const { interaction, mockCommand } = buildMockInteraction();
            mockBotInstance.commands.set('test-cmd', mockCommand);

            // Should not throw
            await expect(triggerEvent('interactionCreate', interaction)).resolves.not.toThrow();
        });

        test('should catch errors, delete reply if replied, and follow up with unknown error', async () => {
            const thrownError = new Error('Command exploded');
            const { interaction, mockCommand } = buildMockInteraction({ replied: true });
            mockCommand.execute.mockRejectedValueOnce(thrownError);
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
            expect(mockBuildUnknownError).toHaveBeenCalledWith(thrownError);
            expect(interaction.followUp).toHaveBeenCalledWith(
                expect.objectContaining({ isError: true })
            );
        });

        test('should catch errors without deleteReply when interaction has not replied', async () => {
            const thrownError = new Error('Boom');
            const { interaction, mockCommand } = buildMockInteraction({ replied: false });
            mockCommand.execute.mockRejectedValueOnce(thrownError);
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(interaction.deleteReply).not.toHaveBeenCalled();
            expect(mockBuildUnknownError).toHaveBeenCalledWith(thrownError);
        });

        test('should log errors thrown by the outer try/catch via bot.logger', async () => {
            // Make followUp itself throw so the outer catch in startBot's on() handler fires
            const { interaction, mockCommand } = buildMockInteraction({ replied: false });
            mockCommand.execute.mockRejectedValueOnce(new Error('inner error'));
            mockBuildUnknownError.mockRejectedValueOnce(new Error('buildUnknownError also failed'));
            mockBotInstance.commands.set('test-cmd', mockCommand);

            await triggerEvent('interactionCreate', interaction);

            expect(mockLoggerError).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    // ── clientReady handler ─────────────────────────────────────────────────────
    describe('clientReady handler', () => {
        let mockChannel: any;

        beforeEach(async () => {
            mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<any>().mockResolvedValue(undefined),
                messages: {
                    fetch: jest.fn<any>().mockResolvedValue(
                        createMockCollection([
                            ['msg1', {
                                author: { id: 'bot-user-id' },
                                embeds: [{ title: 'TestRepo', description: '' }],
                                delete: jest.fn<any>().mockResolvedValue(undefined),
                            }],
                        ])
                    ),
                },
            };
            mockBotInstance.channels.fetch.mockResolvedValue(mockChannel);

            await startBot({
                owner: 'TestOwner',
                repo: 'TestRepo',
                commandBuilder: jest.fn(() => [{ name: 'ping', type: 1 }]),
            });
        });

        test('should call application.commands.set with the built commands', async () => {
            await triggerEvent('clientReady');
            expect(mockBotInstance.application.commands.set).toHaveBeenCalledWith([{ name: 'ping', type: 1 }]);
        });

        test('should call generateCard and send the embed to the deployment channel', async () => {
            await triggerEvent('clientReady');
            expect(mockGenerateCard).toHaveBeenCalledWith(mockBotInstance);
            expect(mockChannel.send).toHaveBeenCalledWith({
                embeds: [{ title: 'TestRepo Info' }],
            });
        });

        test('should log error and throw when application.commands.set fails', async () => {
            mockBotInstance.application.commands.set.mockRejectedValueOnce(new Error('Discord API error'));

            await expect(triggerEvent('clientReady')).rejects.toThrow(
                'Issue setting up commands or post-deployment message'
            );
            expect(mockLoggerError).toHaveBeenCalledWith(expect.any(Error));
        });

        test('should not send to channel when DISCORD_CHANNEL_ID is not set', async () => {
            delete process.env.DISCORD_CHANNEL_ID;
            await triggerEvent('clientReady');

            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(mockLoggerError).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('DISCORD_CHANNEL_ID') })
            );
        });

        test('should not send when channel fetch returns null', async () => {
            mockBotInstance.channels.fetch.mockResolvedValueOnce(null);
            await triggerEvent('clientReady');
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        test('should not send when channel is not text-based', async () => {
            mockChannel.isTextBased.mockReturnValueOnce(false);
            await triggerEvent('clientReady');
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        test('should attempt to delete previous bot deployment messages', async () => {
            const mockDelete = jest.fn<any>().mockResolvedValue(undefined);
            const previousBotMessage = {
                author: { id: 'bot-user-id' },
                embeds: [{ title: 'TestRepo', description: null }],
                delete: mockDelete,
            };

            mockChannel.messages.fetch.mockResolvedValueOnce(
                createMockCollection([['msg-old', previousBotMessage]])
            );

            await triggerEvent('clientReady');
            expect(mockDelete).toHaveBeenCalledTimes(1);
        });

        test('should delete a message matched via embed description when title is absent', async () => {
            // Covers the right-hand side of the || in the filter:
            //   embed.title?.includes(repo) || embed.description?.includes(repo)
            // When title is null, ?.includes() is undefined (falsy), so || evaluates the right side.
            const mockDelete = jest.fn<any>().mockResolvedValue(undefined);
            const descriptionMatchMessage = {
                author: { id: 'bot-user-id' },
                embeds: [{ title: null, description: 'TestRepo deployment info' }],
                delete: mockDelete,
            };

            mockChannel.messages.fetch.mockResolvedValueOnce(
                createMockCollection([['msg-desc', descriptionMatchMessage]])
            );

            await triggerEvent('clientReady');
            expect(mockDelete).toHaveBeenCalledTimes(1);
        });

        test('should not delete messages where neither embed title nor description references the repo', async () => {
            // Covers the filter predicate fully returning false:
            //   embed.title?.includes(repo) is false AND embed.description?.includes(repo) is false
            const mockDelete = jest.fn<any>().mockResolvedValue(undefined);
            const unrelatedMessage = {
                author: { id: 'bot-user-id' },
                embeds: [{ title: 'Unrelated title', description: 'Unrelated description' }],
                delete: mockDelete,
            };

            mockChannel.messages.fetch.mockResolvedValueOnce(
                createMockCollection([['msg-unrelated', unrelatedMessage]])
            );

            await triggerEvent('clientReady');
            expect(mockDelete).not.toHaveBeenCalled();
        });

        test('should not delete messages authored by a different user even if embed references the repo', async () => {
            // Covers the msg.author.id === bot.user!.id false branch in the filter
            const mockDelete = jest.fn<any>().mockResolvedValue(undefined);
            const otherUserMessage = {
                author: { id: 'different-user-id' },
                embeds: [{ title: 'TestRepo', description: '' }],
                delete: mockDelete,
            };

            mockChannel.messages.fetch.mockResolvedValueOnce(
                createMockCollection([['msg-other-user', otherUserMessage]])
            );

            await triggerEvent('clientReady');
            expect(mockDelete).not.toHaveBeenCalled();
        });

        test('should warn and continue when message deletion fails (missing permissions)', async () => {
            mockChannel.messages.fetch.mockRejectedValueOnce(new Error('Missing Permissions'));

            // Should not re-throw; warns and continues
            await expect(triggerEvent('clientReady')).resolves.not.toThrow();
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });
});