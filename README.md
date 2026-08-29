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
