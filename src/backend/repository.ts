import { defaultWorld } from '../defaultWorld';
import type { AppData, Campaign, Character, GameState, Intent, StoryTurn, WorldPack } from '../types';
import { requireSupabase } from './supabase';

const asObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

async function functionError(error: any, fallback: string) {
  try { const body = await error?.context?.json?.(); return body?.error || fallback; }
  catch { return error?.message || fallback; }
}

export async function authenticateUsername(username: string, password: string, action: 'signin' | 'signup') {
  const db = requireSupabase();
  const { data, error } = await db.functions.invoke('username-auth', { body: { username, password, action } });
  if (error) throw new Error(await functionError(error, 'Authentication failed.'));
  if (data?.error) throw new Error(data.error);
  if (!data?.access_token || !data?.refresh_token) throw new Error('Authentication did not return a valid session.');
  const session = await db.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (session.error) throw session.error;
  return session.data.session;
}

export async function signOutRemote() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function getProfile() {
  const db = requireSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error) throw error;
  return data;
}

function mapCharacter(row: any): Character {
  const traits = asObject(row.traits);
  return { name: row.name, pronouns: row.pronouns || 'they/them', background: asObject(row.background) as any, strength: asObject(traits.strength) as any, weakness: asObject(traits.weakness) as any, motivation: asObject(traits.motivation) as any };
}

function mapIntent(value: unknown): Intent {
  const intent = asObject(value);
  return { speech: asArray<string>(intent.speech), actions: asArray<string>(intent.actions), targets: asArray<string>(intent.targets), posture: ['cautious', 'bold', 'hostile', 'neutral'].includes(intent.posture) ? intent.posture : 'neutral' };
}

export function applyStateChanges(state: GameState, changes: unknown): GameState {
  const change = asObject(changes); const candidate = asObject(change.nextState || change.state || change);
  return { ...state,
    ...(typeof candidate.locationId === 'string' ? { locationId: candidate.locationId } : {}),
    ...(typeof candidate.health === 'number' ? { health: candidate.health } : {}),
    ...(typeof candidate.resolve === 'number' ? { resolve: candidate.resolve } : {}),
    ...(Array.isArray(candidate.inventory) ? { inventory: candidate.inventory } : {}),
    ...(candidate.relationships && typeof candidate.relationships === 'object' ? { relationships: candidate.relationships } : {}),
    ...(Array.isArray(candidate.memories) ? { memories: candidate.memories } : {}),
    ...(Array.isArray(candidate.unresolvedThreads) ? { unresolvedThreads: candidate.unresolvedThreads } : {}),
    ...(typeof candidate.summary === 'string' ? { summary: candidate.summary } : {}),
  };
}

export async function loadRemoteAppData(): Promise<AppData | null> {
  const db = requireSupabase(); const { data: session } = await db.auth.getSession();
  if (!session.session) return null;
  const profile = await getProfile(); if (!profile) return null;
  const { data: campaignRows, error } = await db.from('campaigns').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  const campaigns: Campaign[] = []; const packs = new Map<string, WorldPack>([[`${defaultWorld.id}:${defaultWorld.version}`, defaultWorld]]);
  for (const row of campaignRows || []) {
    const [{ data: version, error: versionError }, { data: characters, error: characterError }, { data: turnRows, error: turnError }] = await Promise.all([
      db.from('world_pack_versions').select('*').eq('id', row.pack_version_id).single(), db.from('characters').select('*').eq('campaign_id', row.id), db.from('campaign_turns').select('*').eq('campaign_id', row.id).order('created_at', { ascending: true }),
    ]);
    if (versionError || characterError || turnError || !version) throw versionError || characterError || turnError || new Error('Campaign data is incomplete.');
    const pack = version.content as unknown as WorldPack; packs.set(`${pack.id}:${pack.version}`, pack);
    const playerRow = (characters || []).find((item: any) => asObject(item.traits).player) || characters?.[0]; if (!playerRow) continue;
    let state = asObject(playerRow.status) as unknown as GameState;
    const turns: StoryTurn[] = (turnRows || []).map((turn: any) => { state = applyStateChanges(state, turn.state_changes); return { id: turn.id, idempotencyKey: turn.idempotency_key, playerText: turn.player_text, intent: mapIntent(turn.structured_intent), narration: turn.narration, suggestions: asArray<string>(turn.suggestions), createdAt: turn.created_at }; });
    campaigns.push({ id: row.id, ownerId: row.owner_id, title: row.title, packId: pack.id, packVersion: pack.version, character: mapCharacter(playerRow), state, turns, archived: row.status === 'archived', updatedAt: row.updated_at });
  }
  return { user: { id: profile.id, name: profile.display_name, username: profile.username, turnsRemaining: profile.turns_balance }, packs: [...packs.values()], campaigns };
}

export async function createRemoteCampaign(pack: WorldPack, character: Character) {
  const { data, error } = await requireSupabase().functions.invoke('create-campaign', { body: { pack, character } });
  if (error) throw new Error(await functionError(error, 'Campaign could not be created.'));
  if (data?.error) throw new Error(data.error);
  return data.campaignId as string;
}

export async function getWorldDatabase(campaignId: string) {
  const db = requireSupabase();
  const [knowledge, locations, characters, entities, reports] = await Promise.all([
    db.from('player_knowledge').select('*').eq('campaign_id', campaignId).order('updated_at', { ascending: false }), db.from('locations').select('*').eq('campaign_id', campaignId).order('name'), db.from('characters').select('*').eq('campaign_id', campaignId).order('name'), db.from('world_entities').select('*').eq('campaign_id', campaignId), db.from('intel_reports').select('*').eq('campaign_id', campaignId).order('received_at', { ascending: false }),
  ]);
  const failed = [knowledge, locations, characters, entities, reports].find(result => result.error); if (failed?.error) throw failed.error;
  return { knowledge: knowledge.data || [], locations: locations.data || [], characters: characters.data || [], entities: entities.data || [], reports: reports.data || [] };
}

export async function submitRemoteTurn(campaignId: string, playerText: string, idempotencyKey: string) {
  const { data, error } = await requireSupabase().functions.invoke('resolve-turn', { body: { campaignId, playerText, idempotencyKey } });
  if (error) throw new Error(await functionError(error, 'The story could not advance. No turn was charged.'));
  if (data?.error) throw new Error(data.error);
  return { turn: { id: data.id, idempotencyKey: data.idempotency_key, playerText: data.player_text, intent: mapIntent(data.structured_intent), narration: data.narration, suggestions: asArray<string>(data.suggestions), createdAt: data.created_at } as StoryTurn, stateChanges: data.state_changes, usage: data.usage_units || 0 };
}
