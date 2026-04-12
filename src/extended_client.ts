import { Client, ClientOptions, Collection } from 'discord.js';
import { GithubInfo, Logger } from './helpers/interfaces.js';

/**
 * `Client` subclass used throughout BongBot. Adds required, non-nullable
 * accessors for the logger, commands collection, deployment info and
 * version so downstream code can reference them without null checks.
 */
export class ExtendedClient extends Client {
    /** Logger instance associated with this bot. Guaranteed non-null. */
    readonly logger: Logger;
    /** In-memory registry of slash commands keyed by command name. */
    readonly commands: Collection<string, any> = new Collection();
    /** Release tag used as the user-facing version (sourced from `deploymentInfo.tag`). */
    readonly version: string;
    /** GitHub deployment metadata used by the info card and footer. */
    readonly deploymentInfo: GithubInfo;

    /**
     * @param options Standard discord.js {@link ClientOptions}.
     * @param logger  Logger implementation for this bot instance.
     * @param data    GitHub deployment metadata (usually from `getRepoInfoFromAPI`).
     */
    constructor(options: ClientOptions, logger: Logger, data: GithubInfo) {
        super(options);
        this.logger = logger;
        this.version = data.tag;
        this.deploymentInfo = data;
    }

}