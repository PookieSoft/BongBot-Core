import { EmbedBuilder, Colors } from 'discord.js';
import type { ExtendedClient, GithubInfo, GithubBranchResponse, GithubTagResponse } from '../helpers/interfaces.js';

let apiResponse: GithubInfo | undefined;
const timestamp = Math.floor(Date.now() / 1000);

/**
 * Fetches the latest release tag and most recent commit on the default
 * branch for the given GitHub repository and normalises them into a
 * {@link GithubInfo} payload used by the deployment info card.
 *
 * The default branch is read from `process.env.BRANCH` and falls back to
 * `main`. If either API call fails, a sentinel payload containing `'N/A'`
 * placeholder values is returned so that bot startup is never blocked by a
 * transient GitHub outage.
 *
 * @param owner GitHub owner or organisation.
 * @param repo  GitHub repository name.
 * @returns A {@link GithubInfo}-shaped object, always resolved (never throws).
 */
export const getRepoInfoFromAPI = async (owner: string, repo: string) => {
    const repoApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = { 'User-Agent': 'Node.js-Deploy-Script' };

    try {
        // 1. Fetch latest release
        const releaseResponse = await fetch(`${repoApiUrl}/releases/latest`, { headers });
        if (!releaseResponse.ok) throw new Error (`Release fetch failed: ${releaseResponse.statusText}`);
        const tagsData: GithubTagResponse = await releaseResponse.json() as GithubTagResponse;
        const tag = tagsData.tag_name;
        const defaultBranch = process.env.BRANCH ?? 'main';
        // 2. Fetch the latest commit from that default branch
        const branchesResponse = await fetch(`${repoApiUrl}/branches/${defaultBranch}`, { headers });
        if (!branchesResponse.ok) throw new Error(`Branches fetch failed: ${branchesResponse.statusText}`);
        const branchesData: GithubBranchResponse = await branchesResponse.json() as GithubBranchResponse;
        const latestCommit = branchesData.commit;
        const commitMessage = latestCommit.commit.message.split('\n')[0]; // Get first line only
        const shortHash = latestCommit.sha.substring(0, 7);

        return {
            repoUrl: `https://github.com/${owner}/${repo}`,
            owner: owner,
            repo: repo,
            branchName: defaultBranch,
            commitUrl: `https://github.com/${owner}/${repo}/commit/${shortHash}`,
            shortHash: shortHash,
            commitMessage,
            tag
        };
    } catch (error: any) {
        console.warn(`Warning: Could not retrieve info from GitHub API. ${error.message}`);
        return {
            repoUrl: `https://github.com/${owner}/${repo}`,
            owner: owner,
            repo: repo,
            branchName: 'N/A',
            commitUrl: `https://github.com/${owner}/${repo}`,
            shortHash: 'N/A',
            commitMessage: 'Could not fetch from API.',
            tag: 'N/A'
        };
    }
};

/**
 * Builds the BongBot "deployment info" embed shown when the bot comes online.
 *
 * Relies on `bot.deploymentInfo` being populated — normally set by
 * {@link startBot} via {@link getRepoInfoFromAPI}. The card includes:
 * - Latest commit hash, message and link
 * - Repository link
 * - Start timestamp, Node version, and library
 * - Version footer (release tag in prod, `dev build` elsewhere)
 *
 * @param bot The running client; its `deploymentInfo` drives the card contents.
 * @returns A discord.js `EmbedBuilder` ready to send.
 */
export const generateCard = async (bot: ExtendedClient) => {
    const info = bot.deploymentInfo!;
    const isBun = typeof Bun !== 'undefined';
    return new EmbedBuilder()
        .setTitle('🤖 BongBot Info Card')
        .setColor(Colors.Purple)
        .setThumbnail(bot.user?.displayAvatarURL() || null)
        .setDescription(`**Latest Commit on \`${info.branchName}\`:**\n>>> [${info.shortHash} - ${info.commitMessage}](${info.commitUrl})`)
        .addFields(
            { name: '📂 Repository', value: `[${info.owner}/${info.repo}](${info.repoUrl})`, inline: false },
            { name: '⏱️ Last Started', value: `<t:${timestamp}:f>`, inline: true },
            { name: `📦 ${isBun ? 'Bun' : 'Node.js'}`, value: `${isBun ? Bun.version : process.versions.node}`, inline: true },
            { name: '📚 Library', value: 'discord.js', inline: true }
        )
        .setFooter({ text: `BongBot • ${process.env.ENV === 'prod' ? info.tag : 'dev build' }`, iconURL: bot.user?.displayAvatarURL() })
        .setTimestamp();
}
