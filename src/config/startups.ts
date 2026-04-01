import { GatewayIntentBits, MessageFlags } from 'discord.js';
import type { Message, InteractionReplyOptions, Interaction, ApplicationCommandDataResolvable } from 'discord.js';
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

export async function basicStart(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder
    });
}

export async function startWithHandlers(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>, handlers: string[]): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder,
        handlers: handlers
    });
}

export async function startWithFunctions(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>, additionalFunctions: string[]): Promise<ExtendedClient> {
    return await startBot({
        owner: owner,
        repo: repo,
        commandBuilder: commandBuilder,
        additionalFunctions: additionalFunctions
    });
}

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
    // bot.on('interactionCreate', async (interaction: Interaction) => {
    //     interactionCreateHandler(interaction, bot, additionalFunctions);
    // });
    /** set commands on bot ready */
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
async function interactionCreateHandler(interaction: Interaction, bot: ExtendedClient, additionalFunctions?: string[]): Promise<void> {

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
        for (const funcName of additionalFunctions || []) {
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

export interface BotStartConfig {
    owner: string;
    repo: string;
    commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>;
    additionalFunctions?: string[];
    handlers?: string[];
}