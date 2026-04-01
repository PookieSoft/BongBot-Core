import { Client, ClientOptions, Collection } from 'discord.js';
import { GithubInfo, Logger } from './helpers/interfaces.js';

export class ExtendedClient extends Client {
    // Force the logger to be present
    readonly logger: Logger; 
    public commands: Collection<string, any> = new Collection();
    readonly version: string;
    readonly deploymentInfo: GithubInfo;

    constructor(options: ClientOptions, logger: Logger, data: GithubInfo) {
        super(options);
        this.logger = logger;
        this.version = data.tag;
        this.deploymentInfo = data;
    }


}