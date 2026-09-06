# Contributing

Use Node.js 24 or later.

```sh
npm ci
npm test
npm run build
```

`npm run build` runs `tsc`, so it doubles as the type check. There is no separate typecheck script.

Use four spaces, PascalCase class names, camelCase identifiers, and snake_case file names. Run `npx prettier --write` on what you change; `.prettierrc` sets a print width of 120, single quotes, and LF endings. Put imports first, then constants, the main export, helpers in call order, and interfaces.

Add unit tests for new code. Tests run on Jest with ts-jest in ESM mode, and MSW mocks HTTP. Register a handler in `tests/mocks/handlers.ts` when several suites need the same URL, and call `server.use()` inside a test for one that is specific to it. `tests/setup.ts` starts and stops the server, so individual files do not.

The bots depend on this package's exports, so treat every exported signature as public API. Add new parameters as optional and last, and export the types describing them from `src/index.ts`.

Label every pull request `major`, `minor`, or `patch`. The release workflow reads that label to choose the version bump and falls back to `patch` when none is set. Keep runtime dependencies small and explain why a new package is necessary. Do not commit credentials, logs, generated reports, or database files.
