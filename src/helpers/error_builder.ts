import { MessageFlags, Colors } from 'discord.js';
import type { AttachmentBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
const errorMsg = 'There was an error while executing the "{interaction}" command.';
import LOGGER from '../services/logging_service.js';
import EMBED_BUILDER from './embed_builder.js';

/**
 * Builds a user-facing ephemeral error response for a failing slash command.
 *
 * The returned payload contains an embed with a randomly-selected response
 * image, red accent colour, and a descriptive title naming the failing
 * command. Intended to be passed directly to
 * `interaction.followUp(...)`.
 *
 * @param interaction The interaction that triggered the error. Used to pull
 *                    the command name for the title.
 * @param error       The thrown error. `error.message` is surfaced in the embed.
 * @returns A discord.js reply payload with `isError: true` set for flow control.
 */
async function buildError(interaction: CommandInteraction, error: any) {
    console.error(`Error executing ${interaction?.commandName ?? 'unknown'} command`);
    return await buildErrorHelper(error, errorMsg.replace('{interaction}', interaction?.commandName ?? 'unknown'));
}

/**
 * Builds an ephemeral error response when the source of the error is
 * unknown (i.e. no interaction context is available). Used by the top-level
 * `interactionCreate` handler as a last-resort fallback.
 *
 * @param error The thrown error.
 * @returns A discord.js reply payload ready to pass to `interaction.followUp(...)`.
 */
async function buildUnknownError(error: any) {
    return await buildErrorHelper(error, "Leave me alone! I'm not talking to you! (there was an unexpected error)");
}

async function buildErrorHelper(error: any, errorMessage: string) {
    LOGGER.log(error);
    const returnEmbed = (await new EMBED_BUILDER().constructEmbedWithRandomFile(error.message)) as {
        embeds: [EmbedBuilder];
        files: [AttachmentBuilder];
    };
    const embed = returnEmbed.embeds[0];
    embed.setTitle(errorMessage).setColor(Colors.Red);
    return {
        embeds: [embed.toJSON()],
        files: [returnEmbed.files[0]],
        flags: MessageFlags.Ephemeral,
        isError: true,
    };
}

export { buildError, buildUnknownError };
