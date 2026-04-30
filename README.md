# BongBot-Core

![Build Status](https://img.shields.io/github/actions/workflow/status/PookieSoft/BongBot-Core/deploy.yml?label=Production%20Deploy&logo=github)
![Coverage](https://codecov.io/gh/PookieSoft/BongBot-Core/branch/main/graph/badge.svg)
![License](https://img.shields.io/github/license/PookieSoft/BongBot-Core?v=2)
![Node Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen?logo=node.js)

Core Package for re-usable aspects of BongBot family Discord Bots.
Functions included in the package include:

- Standard config validation to ensure bots will operate at runtime
- Logging Frameworks used by Bots
- Caller Utilities used by Bots
- Consolodated "infocard" used by bots
- Expanded embed builder and error builder frameworks
- common bot initialisation scripts

The package is published as an NPM package and has typescript compatability.
Install using `npm i @pookiesoft/bongbot-core

## Configuration

Configuration is loaded from environment variables. Required and optional variables:

| Variable               | Required                  | Default                                 | Description                                                                 |
| ---------------------- | ------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `DISCORD_API_KEY`      | Yes                       | —                                       | Discord bot token.                                                          |
| `QUOTEDB_URL`          | No                        | `https://quotes.elmu.dev/api/v1/quotes` | Base URL for the QuoteDB API. Override to point at a different instance.    |
| `QUOTEDB_API_KEY`      | No                        | `null`                                  | API key for QuoteDB.                                                        |
| `QUOTEDB_USER_ID`      | No                        | `null`                                  | User ID for QuoteDB.                                                        |
| `GOOGLE_API_KEY`       | No                        | `null`                                  | Google API key.                                                             |
| `GOOGLE_CX`            | No                        | `null`                                  | Google Custom Search engine ID.                                             |
| `OPENAI_ACTIVE`        | No                        | `false`                                 | Set to `true` to enable OpenAI integration. Requires `OPENAI_API_KEY`.      |
| `OPENAI_API_KEY`       | If `OPENAI_ACTIVE=true`   | `null`                                  | OpenAI API key.                                                             |
| `OPENAI_MODEL`         | No                        | `gpt-4o`                                | OpenAI model name.                                                          |
| `GOOGLEAI_ACTIVE`      | No                        | `false`                                 | Set to `true` to enable Google AI integration. Requires `GOOGLEAI_API_KEY`. |
| `GOOGLEAI_API_KEY`     | If `GOOGLEAI_ACTIVE=true` | `null`                                  | Google AI API key.                                                          |
| `GOOGLEAI_MODEL`       | No                        | `gemini-2.5-flash-lite`                 | Google AI text model.                                                       |
| `GOOGLEAI_IMAGE_MODEL` | No                        | `gemini-2.5-flash-image-preview`        | Google AI image model.                                                      |
