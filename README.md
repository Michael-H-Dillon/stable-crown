# Sable Crown

A shared Expo/React Native MVP for persistent solo role-playing on web, iOS, and Android.

## Run

```bash
npm install
npm run web
```

Use `npm run android` for an Android emulator/device. On macOS, use `npm run ios` for the iOS simulator. The prototype uses device-local persistence and a deterministic game-master adapter, so the complete flow works without credentials.

## Production boundary

The client deliberately contains no model key. `src/engine.ts` defines the provider contract and an offline deterministic implementation. `server/openai-provider.example.ts` shows the trusted-server Responses API boundary. In production, place it behind authenticated endpoints and persist a successful turn, state patch, idempotency key, audit metadata, and quota decrement in one database transaction.

The app currently provides a product-complete vertical slice, not hosted multi-user infrastructure. Replace local authentication/storage with a managed auth service, relational database, and object storage before handling real user data.

## Supabase backend

The Supabase foundation is now included: schema migrations, Row Level Security, Expo client/session setup, player-safe repository queries, username authentication function, and secure AI turn function. See [BACKEND_SETUP.md](./BACKEND_SETUP.md) to create and link the hosted project.

## Deploy the Supabase backend

Run `npx --yes supabase@2 login` and link the intended project
using `npx --yes supabase@2 link --project-ref YOUR_PROJECT_REF` once. Then run:

```powershell
npm run deploy:backend
```

This pushes pending database migrations, then redeploys every local Edge Function
using the installed CLI or `npx --yes supabase@2` when no CLI is on PATH.
The npx fallback downloads the CLI if needed. Functions deploy
with the shared helpers and settings in `supabase/config.toml`. It stops on errors.
If functions fail after migrations succeed, fix the error and rerun; deployment
does not roll back already applied migrations or functions. Existing CLI prompts
are preserved. Frontend hosting and secrets are managed separately.

Use `npm run deploy:backend -- --preview` to print the commands without deploying.

## Pack format

- `templates/world-pack-template.md` is the human/AI authoring guide.
- `templates/world-pack.schema.json` is the canonical portable JSON contract.
- Imports are limited to 500 KB and validated for structure, duplicate IDs, prompt-injection patterns, and disallowed content.
- The client currently imports canonical JSON directly. Markdown parsing belongs on the trusted server so previews and validation behave identically across platforms.

## Checks

```bash
npm run typecheck
npm test
npm run build:web
```
