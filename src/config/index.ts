/**
 * Central runtime configuration object for BongBot.
 *
 * Values are resolved from environment variables at module load time with safe
 * defaults where appropriate. Import as the default export to read any setting,
 * e.g. `import config from 'bongbot-core'`.
 *
 * @property discord.apikey              Discord bot token (from `DISCORD_API_KEY`).
 * @property apis.quotedb.url            Base URL for the QuoteDB API (defaults to the public endpoint).
 * @property apis.quotedb.apikey         QuoteDB API key (from `QUOTEDB_API_KEY`).
 * @property apis.quotedb.user_id        QuoteDB user id (from `QUOTEDB_USER_ID`).
 * @property apis.google.url             Base URL for Google APIs.
 * @property apis.google.apikey          Google API key (from `GOOGLE_API_KEY`).
 * @property apis.google.cx              Google custom search engine id (from `GOOGLE_CX`).
 * @property apis.openai.active          Whether the OpenAI integration is enabled (from `OPENAI_ACTIVE`).
 * @property apis.openai.apikey          OpenAI API key (from `OPENAI_API_KEY`).
 * @property apis.openai.model           OpenAI model identifier (defaults to `gpt-4o`).
 * @property apis.googleai.active        Whether the Google AI integration is enabled (from `GOOGLEAI_ACTIVE`).
 * @property apis.googleai.apikey        Google AI API key (from `GOOGLEAI_API_KEY`).
 * @property apis.googleai.model         Google AI text model identifier.
 * @property apis.googleai.image_model   Google AI image model identifier.
 * @property media.file_root             Root directory for static media. Resolves to `./src/` under Jest and `./dist/` in production.
 */
const config = {
    discord: {
        apikey: process.env.DISCORD_API_KEY || null
    },
    apis: {
        quotedb: {
            url: process.env.QUOTEDB_URL || "https://quotes.elmu.dev/api/v1/quotes",
            apikey: process.env.QUOTEDB_API_KEY || null,
            user_id: process.env.QUOTEDB_USER_ID || null
        },
        google: {
            url: "https://www.googleapis.com",
            apikey: process.env.GOOGLE_API_KEY || null,
            cx: process.env.GOOGLE_CX || null
        },
        openai: {
            url: "https://api.openai.com",
            active: process.env.OPENAI_ACTIVE === 'true', // Convert string 'true' to boolean
            apikey: process.env.OPENAI_API_KEY || null,
            model: process.env.OPENAI_MODEL || 'gpt-4o'
        },
        googleai: {
            active: process.env.GOOGLEAI_ACTIVE === 'true',
            apikey: process.env.GOOGLEAI_API_KEY || null,
            model: process.env.GOOGLEAI_MODEL || "gemini-2.5-flash-lite",
            image_model: process.env.GOOGLEAI_IMAGE_MODEL || "gemini-2.5-flash-image-preview"
        }
    },
    media : {
        file_root: process.env.JEST_WORKER_ID !== undefined ? './src/' : './dist/'
    }
};

/**
 * Validates that required environment variables are set.
 * Throws an error with helpful message if any required variables are missing.
 * Call this early in application startup to fail fast.
 * 
 * @throws {Error} If any required environment variables are missing.
 */
export function validateRequiredConfig(): void {
    const errors: string[] = [];

    // Discord API key is always required
    if (!config.discord.apikey) {
        errors.push('DISCORD_API_KEY is required');
    }

    // If OpenAI is active, API key is required
    if (config.apis.openai.active && !config.apis.openai.apikey) {
        errors.push('OPENAI_API_KEY is required when OPENAI_ACTIVE=true');
    }

    // If Google AI is active, API key is required
    if (config.apis.googleai.active && !config.apis.googleai.apikey) {
        errors.push('GOOGLEAI_API_KEY is required when GOOGLEAI_ACTIVE=true');
    }

    if (errors.length > 0) {
        throw new Error(
            `Missing required environment variables:\n  - ${errors.join('\n  - ')}\n\n` +
            'Please set these in your .env file or environment.'
        );
    }
}

export default config;

/**
 * Resolves a path relative to the configured media root (`config.media.file_root`).
 *
 * Use this when loading bundled assets (images, responses, etc.) so the same
 * code works both under Jest (reads from `./src/`) and in production builds
 * (reads from `./dist/`).
 *
 * @param resolved_path Path fragment relative to the media root. Leading slashes are not required.
 * @returns The fully-qualified path on disk.
 *
 * @example
 * ```ts
 * import { getFilePath } from 'bongbot-core';
 * const path = getFilePath('responses/greeting.gif');
 * ```
 */
export function getFilePath(resolved_path: string): string {
    return `${config.media.file_root}/${resolved_path}`;
}

/**
 * Convenience re-export of `config.apis` for modules that only need the API
 * configuration block.
 */
export const apis = config.apis;