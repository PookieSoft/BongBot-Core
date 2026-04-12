import { GatewayIntentBits, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Message, InteractionReplyOptions, Interaction, ApplicationCommandDataResolvable, ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, CacheType } from 'discord.js';
import { ExtendedClient } from '../extended_client.js';
import { validateRequiredConfig } from './index.js';
import LOGGER from '../services/logging_service.js';
import { buildUnknownError } from '../helpers/error_builder.js';
import { getRepoInfoFromAPI, generateCard } from '../helpers/info_card.js';
import crypto from 'crypto';

type BotEventHandler = (bot: ExtendedClient, additionalFunctions: string[], ...args: any[]) => Promise<void>;

const handlerMap: Map<string, BotEventHandler> = new Map([
    ['interactionCreate', async (bot, funcs, interaction) => await interactionCreateHandler(interaction, bot, funcs)]
]);

/**
 * Spins up a BongBot with only the default `interactionCreate` handler wired
 * in. This is the fastest way to get a working bot for simple use cases.
 *
 * Internally delegates to {@link startBot}.
 *
 * @param owner           GitHub owner/org the bot runs for (used for the info card).
 * @param repo            GitHub repository name the bot runs for.
 * @param commandBuilder  Factory that receives the constructed client and returns
 *                        the list of slash commands to register.
 * @returns A logged-in, ready-to-use {@link ExtendedClient}.
 *
 * @example
 * ```ts
 * import { basicStart } from 'bongbot-core';
 * const bot = await basicStart('PookieSoft', 'BongBot', (client) => [...]);
 * ```
 */
export async function basicStart(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder
    });
}

/**
 * Starts a BongBot and attaches an explicit list of Discord event handlers on
 * top of the defaults. Use this when you want the bot to respond to events
 * beyond plain slash commands.
 *
 * Internally delegates to {@link startBot}.
 *
 * @param owner           GitHub owner/org the bot runs for.
 * @param repo            GitHub repository name the bot runs for.
 * @param commandBuilder  Factory returning the list of slash commands to register.
 * @param handlers        Discord.js event names to enable (e.g. `['interactionCreate']`).
 *                        Only handlers present in the internal handler map are wired up.
 * @returns A logged-in, ready-to-use {@link ExtendedClient}.
 */
export async function startWithHandlers(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>, handlers: string[]): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder,
        handlers: handlers
    });
}

/**
 * Starts a BongBot and wires up additional per-command hook functions that run
 * after a command's `execute` completes. Each name in `additionalFunctions`
 * must exist as a method on the command object to be invoked.
 *
 * Internally delegates to {@link startBot}.
 *
 * @param owner               GitHub owner/org the bot runs for.
 * @param repo                GitHub repository name the bot runs for.
 * @param commandBuilder      Factory returning the list of slash commands to register.
 * @param additionalFunctions Names of extra post-execute hook functions to invoke
 *                            on each command (e.g. `['trackUsage']`).
 * @returns A logged-in, ready-to-use {@link ExtendedClient}.
 */
export async function startWithFunctions(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>, additionalFunctions: string[]): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder,
        additionalFunctions: additionalFunctions
    });
}

/**
 * Core bootstrap routine that all `*Start` helpers ultimately call. Prefer
 * this directly when you need the full set of options in one place.
 *
 * Responsibilities:
 * 1. Validates required environment variables via {@link validateRequiredConfig}.
 * 2. Generates a fresh session id (`process.env.SESSION_ID`) for correlation.
 * 3. Fetches GitHub deployment info for the info card.
 * 4. Constructs an {@link ExtendedClient} with sensible default intents.
 * 5. Registers the requested event handlers and slash commands.
 * 6. Logs in with `DISCORD_API_KEY` and posts the deployment info card on ready.
 *
 * @param config See {@link BotStartConfig} for the accepted fields.
 * @returns A logged-in, ready-to-use {@link ExtendedClient}.
 * @throws If required env vars are missing, or if command registration fails.
 */
export async function startBot(config: BotStartConfig): Promise<ExtendedClient> {
    const {
        owner,
        repo,
        commandBuilder,
        additionalFunctions = [],
        handlers = ['interactionCreate']
    } = config;

    /** validate and assign session */
    validateRequiredConfig();
    process.env.SESSION_ID = crypto.randomUUID();

    const data = await getRepoInfoFromAPI(owner, repo);
    const token: string = process.env.DISCORD_API_KEY!;
    const bot: ExtendedClient = new ExtendedClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }, LOGGER.default, data);
    const commands: Array<ApplicationCommandDataResolvable> = commandBuilder(bot);
    for (const [eventName, handler] of handlerMap) {
        if (!handlers?.includes(eventName)) continue;
        bot.on(eventName, async (...args) => {
            try {
                await handler(bot, additionalFunctions, ...args);
            } catch (err) {
                bot.logger!.error(err as Error);
            }
        });
    }
    bot.on('clientReady', async () => {
        try {
            await bot.application!.commands.set(commands);
            console.log('Commands Initiated!');
            await postDeploymentMessage(bot);
        } catch (error) {
            bot.logger!.error(error as Error);
            throw new Error('Issue setting up commands or post-deployment message');
        }
    });
    /** login to bot */
    bot.login(token);
    console.log('BongBot Online!');
    console.log(`sessionId: ${process.env.SESSION_ID}`);
    return bot;
}
async function interactionCreateHandler(interaction: Interaction, bot: ExtendedClient, additionalFunctions: string[]): Promise<void> {

    if (!interaction.isCommand()) { return; }

    try {
        const command = bot.commands!.get(interaction.commandName);
        if (!command) return;
        await interaction.deferReply({ flags: command.msgFlag || MessageFlags.Loading });
        const response = await command.execute(interaction, bot);
        if (response?.isError === true && interaction.replied) {
            await interaction.deleteReply();
        }
        const message = await interaction.followUp(response);
        for (const funcName of additionalFunctions) {
            if (command && typeof (command as any)[funcName] === 'function') {
                await (command as any)[funcName](interaction, message);
            }
        }
    } catch (error) {
        if (interaction.replied) { await interaction.deleteReply(); }
        await interaction.followUp(await buildUnknownError(error) as InteractionReplyOptions);
    }

}


const postDeploymentMessage = async (bot: ExtendedClient) => {
    if (!process.env.DISCORD_CHANNEL_ID) { bot.logger!.error(new Error('DISCORD_CHANNEL_ID not set')); return; }
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    if (!('send' in channel && typeof channel.send === 'function')) return;
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter((msg: Message) =>
            msg.author.id === bot.user!.id &&
            msg.embeds.some(embed =>
                embed.title?.includes(bot!.deploymentInfo.repo) ||
                embed.description?.includes(bot!.deploymentInfo.repo)
            )
        );
        await Promise.allSettled(botMessages.map(m => m.delete()));
    } catch (err: any) {
        console.warn(`Warning: Could not delete messages. The bot might be missing 'Manage Messages' permissions. Error: ${err.message}`);
    }
    // Send the composed embed to the channel.
    const card = await generateCard(bot);
    await channel.send({ embeds: [card] });
};

/**
 * Registers an array of {@link Command} objects onto a bot and returns the
 * JSON command payload ready to pass to Discord's application command API.
 *
 * Invalid entries (missing `data`) are silently skipped so callers can freely
 * conditionally include commands without guarding the array themselves.
 *
 * @param bot            The bot instance whose `commands` collection will be populated.
 * @param commandsArray  Commands to register.
 * @returns Array of command payloads suitable for `client.application.commands.set(...)`.
 *
 * @example
 * ```ts
 * import { basicStart, commandBuilder } from 'bongbot-core';
 * import quote from './commands/quote.js';
 *
 * const bot = await basicStart('PookieSoft', 'BongBot', (client) =>
 *   commandBuilder(client, [quote])
 * );
 * ```
 */
export function commandBuilder(bot: ExtendedClient, commandsArray: Command[]): Array<any> {
    const commands: Array<any> = [];
    for (const command of commandsArray) {
        /** skip invalid commands */
        if (!command?.data) {
            continue;
        }
        bot.commands!.set(command.data.name, command);
        commands.push(command.data.toJSON());
    }
    return commands;
}

/**
 * Options accepted by {@link startBot}.
 */
export interface BotStartConfig {
    /** GitHub owner/org used to fetch repository info for the deployment card. */
    owner: string;
    /** GitHub repository name used to fetch repository info for the deployment card. */
    repo: string;
    /** Factory that receives the constructed client and returns the slash commands to register. */
    commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>;
    /** Optional list of post-execute hook method names to invoke on each command. */
    additionalFunctions?: string[];
    /** Discord.js event names to enable. Defaults to `['interactionCreate']`. */
    handlers?: string[];
}

/**
 * Shape of a slash command module registered with the bot.
 *
 * Extra properties are allowed so individual commands can expose hook functions
 * such as analytics trackers, which are then invoked via `additionalFunctions`.
 */
export interface Command {
    /** The slash command definition as built with discord.js builders. */
    data:
        | SlashCommandBuilder
        | SlashCommandOptionsOnlyBuilder
        | SlashCommandSubcommandsOnlyBuilder;
    /**
     * Called when a user invokes this command. Returned value is forwarded to
     * `interaction.followUp(...)`.
     */
    execute(
        interaction: ChatInputCommandInteraction<CacheType>,
        client: any
    ): Promise<any>;
    /** Arbitrary hook functions referenced by `additionalFunctions` in {@link BotStartConfig}. */
    [key: string]: any;
}