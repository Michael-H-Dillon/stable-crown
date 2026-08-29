# Supabase backend setup

The backend code is part of this repository. The hosted Supabase project is the only external resource that must be created and linked.

## 1. Create and link Supabase

From the `sable-crown` directory:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Copy `.env.example` to `.env.local` and fill in the project URL and publishable key shown in Supabase's Connect panel. Never place the service-role key or OpenAI key in an `EXPO_PUBLIC_` variable.

## 2. Configure secure function secrets

```powershell
npx supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_KEY
npx supabase secrets set OPENAI_MODEL=gpt-5.4-mini
npx supabase functions deploy username-auth
npx supabase functions deploy create-campaign
npx supabase functions deploy resolve-turn
```

Supabase automatically supplies the function runtime with its project URL and server credentials.

## 3. Architecture

- `public.player_knowledge` contains only facts the signed-in player is permitted to see.
- `public.intel_reports` records sightings, rumours, sources, age, and confidence.
- `private.authoritative_entity_state` contains exact locations, resources, and hidden goals. It is inaccessible to the Expo client.
- `resolve-turn` reads both layers server-side, calls OpenAI, and returns only player-safe narration and state.
- `create-campaign` pins the chosen pack version and initializes the player-safe and authoritative campaign records.
- Row Level Security restricts exposed records to campaign members and the current viewer.

Before production launch, move the final turn insert, authoritative state changes, knowledge changes, credit deduction, and ledger insert into one database transaction RPC. The function currently documents this boundary but intentionally does not claim full transaction safety.

## 4. Generate exact database types

The project includes a minimal hand-maintained type file so it builds before linking. Once linked, replace it with generated types:

```powershell
npx supabase gen types typescript --linked --schema public > src/backend/types.ts
```

## Local fallback

If `.env.local` is absent, the existing local prototype continues to work. This allows UI work without a hosted backend, but accounts and campaigns remain device-local until the app's screens are switched to the repository in `src/backend/repository.ts`.
