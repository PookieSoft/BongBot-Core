import type { ChatInputCommandInteraction, Client, Collection } from 'discord.js';

export interface ExtendedClient extends Client {
    version: string;
    commands: Collection<string, any>;
    logger: Logger;
    deploymentInfo: GithubInfo;
}

export interface GithubBranchResponse {
    commit: {
        sha: string;
        commit: {
            message: string;
        };
    };
}

export interface GithubTagResponse {
    tag_name: string;
}

export interface GithubInfo {
    repoUrl: string;
    owner: string;
    repo: string;
    branchName: string;
    commitUrl: string;
    shortHash: string;
    commitMessage: string;
    tag: string;
}

export interface Logger {
    info(message: string, stack?: string, interaction?: ChatInputCommandInteraction): void;
    debug(message: string, stack?: string, interaction?: ChatInputCommandInteraction): void;
    error(error: Error, interaction?: ChatInputCommandInteraction): void;
    close?(): void;
}

