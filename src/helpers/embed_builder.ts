import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import type { ExtendedClient } from './interfaces.js';
import randomFile from './random_file.js';
import config from '../config/index.js';
const file_root = config.media.file_root;
const dir = `${file_root}/responses`;

/**
 * Fluent builder for Discord.js embeds with an optional attachment slot.
 *
 * All mutator methods return `this`, so you can chain them:
 *
 * @example
 * ```ts
 * import EMBED_BUILDER from 'bongbot-core';
 *
 * const payload = new EMBED_BUILDER()
 *   .constructEmbedWithImage('logo.png')
 *   .addDefaultFooter(bot)
 *   .build();
 *
 * await interaction.followUp(payload);
 * ```
 */
class EMBED_BUILDER {
    /** Optional attachment sent alongside the embed. */
    attachment?: AttachmentBuilder;
    /** The underlying discord.js embed being assembled. */
    embed: EmbedBuilder;

    /**
     * @param attachment Optional pre-built attachment to associate with the embed.
     */
    constructor(attachment?: AttachmentBuilder) {
        this.attachment = attachment;
        this.embed = new EmbedBuilder();
        return this;
    }

    /**
     * Sets the embed description and points the thumbnail at the currently
     * attached file. Requires the constructor to have been called with an
     * attachment, otherwise this throws.
     *
     * @param description The embed description text.
     * @param filename    Filename of the already-attached file, used for the `attachment://` reference.
     * @throws {Error} If no attachment was provided to the constructor.
     */
    constructEmbedWithAttachment(description: string, filename: string) {
        this.embed.setDescription(description);
        if (!this.attachment) throw new Error('No attachment provided for embed.');
        this.embed.setThumbnail(`attachment://${filename}`);
        return this;
    }

    /**
     * Loads a local file from `./dist/files/` as the embed's main image and
     * stores the resulting attachment on the builder.
     *
     * @param fileName Filename relative to `./dist/files/`.
     */
    constructEmbedWithImage(fileName: string) {
        let attach = new AttachmentBuilder(`./dist/files/${fileName}`);
        this.embed.setImage(`attachment://${fileName}`);
        this.attachment = attach;
        return this;
    }

    /**
     * Picks a random response asset from the configured responses directory,
     * attaches it as the embed thumbnail, sets the description, and returns
     * the finished payload ready to pass to discord.js.
     *
     * Unlike the other construct* methods, this returns the built payload
     * directly rather than `this`, because it is commonly the final step in
     * error-response flows.
     *
     * @param description Embed description to display.
     * @returns The result of {@link EMBED_BUILDER.build}.
     */
    async constructEmbedWithRandomFile(description: string) {
        this.embed.setDescription(description);
        const file = await selectRandomFile(dir);
        let attach = new AttachmentBuilder(`./dist/responses/${file}`);
        this.embed.setThumbnail(`attachment://${file}`);
        this.attachment = attach;
        return this.build();
    }

    /**
     * Adds the standardized BongBot footer — bot version and avatar — plus a
     * timestamp.
     *
     * @param client The client to read version / avatar from.
     */
    addDefaultFooter(client: ExtendedClient) {
        this.embed.setFooter({
            text: `BongBot • ${client?.version ?? 'dev build'}`,
            iconURL: client.user?.displayAvatarURL(),
        });
        this.embed.setTimestamp();
        return this;
    }

    /**
     * Adds a custom footer to the embed.
     *
     * @param text    Footer text.
     * @param iconURL URL to the footer icon image.
     */
    addFooter(text: string, iconURL: string) {
        this.embed.setFooter({ text: text, iconURL: iconURL });
        return this;
    }

    /**
     * Finalises the builder into an object suitable for
     * `interaction.reply` / `interaction.followUp` / `channel.send`.
     *
     * @returns An object containing the embed array and any attached files.
     */
    build(): { embeds: [EmbedBuilder]; files: AttachmentBuilder[] } | string {
        if (!this.attachment) {
            return { embeds: [this.embed], files: [] };
        }
        return { embeds: [this.embed], files: [this.attachment].filter((f) => f) };
    }
}

async function selectRandomFile(dir: string): Promise<string> {
    return new Promise((resolve, reject) => {
        randomFile(dir, (err, file) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(file ?? '');
        });
    });
}

export default EMBED_BUILDER;
