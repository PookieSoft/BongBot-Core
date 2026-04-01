import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import type { Message, InteractionReplyOptions, CommandInteraction, Interaction, ApplicationCommandDataResolvable } from 'discord.js';
import type { ExtendedClient } from './helpers/interfaces.js';
import { validateRequiredConfig } from './config/index.js';
import LOGGER from './services/logging_service.js';
import { buildUnknownError } from './helpers/error_builder.js';
import { generateCard } from './helpers/info_card.js';
import crypto from 'crypto';

let GITHUB_REPO_OWNER: string;
let GITHUB_REPO_NAME: string;


export function basicStart(owner: string, repo: string, commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>): ExtendedClient {
    return startWithFunctions(owner, repo, commandBuilder, []);   
}

export function startWithFunctions(owner: string, repo: string,commandBuilder: (bot: ExtendedClient) => Array<ApplicationCommandDataResolvable>, additionalFunctions: string[]): ExtendedClient {
    GITHUB_REPO_OWNER = owner;
    GITHUB_REPO_NAME = repo;
    validateRequiredConfig();
    const token: string = process.env.DISCORD_API_KEY!;
    const bot: ExtendedClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    /** set up logging */
    process.env.SESSION_ID = crypto.randomUUID();
    const commands: Array<ApplicationCommandDataResolvable> = commandBuilder(bot);
    bot.on('interactionCreate', async (interaction: Interaction) => {
        interactionCreateHandler(interaction, bot, additionalFunctions);
    });
    /** set commands on bot ready */
    bot.on('clientReady', async () => {
        try {
            await bot.application!.commands.set(commands);
            console.log('Commands Initiated!');
            await postDeploymentMessage(bot);
        } catch (error) {
            LOGGER.log(error);
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
    if (!process.env.DISCORD_CHANNEL_ID) { LOGGER.log('DISCORD_CHANNEL_ID not set'); return; }
    const channel = await bot.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    if (!('send' in channel && typeof channel.send === 'function')) return;
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter((msg: Message) =>
            msg.author.id === bot.user!.id &&
            msg.embeds.some(embed =>
                embed.title?.includes(GITHUB_REPO_NAME) ||
                embed.description?.includes(GITHUB_REPO_NAME)
            )
        );
        // TODO: [BUGS 1.2] message.delete() is async but not awaited — use Promise.allSettled with error handling
        botMessages?.forEach((message: Message) => message.delete());
    } catch (err: any) {
        console.warn(`Warning: Could not delete messages. The bot might be missing 'Manage Messages' permissions. Error: ${err.message}`);
    }
    // Send the composed embed to the channel.
    const card = await generateCard(bot, { repoOwner: GITHUB_REPO_OWNER, repoName: GITHUB_REPO_NAME });
    await channel.send({ embeds: [card] });
};
