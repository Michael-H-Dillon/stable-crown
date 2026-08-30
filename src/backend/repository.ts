import { defaultWorld } from '../defaultWorld';
import type { AppData, Campaign, Character, GameState, Intent, StoryTurn, WorldPack } from '../types';
import { requireSupabase } from './supabase';

const asObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const safeSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'private-world';

async function functionError(error: any, fallback: string) {
  try { const body = await error?.context?.json?.(); return body?.error || fallback; }
  catch { return error?.message || fallback; }
}

export async function authenticateUsername(username: string, password: string, action: 'signin' | 'signup', email?: string) {
  const db = requireSupabase();
  const { data, error } = await db.functions.invoke('username-auth', { body: { username, password, email, action } });
  if (error) throw new Error(await functionError(error, 'Authentication failed.'));
  if (data?.error) throw new Error(data.error);
  if (!data?.access_token || !data?.refresh_token) throw new Error('Authentication did not return a valid session.');
  const session = await db.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (session.error) throw session.error;
  return session.data.session;
}

export async function requestAccountRecovery(email: string, action: 'username' | 'password') {
  const { data, error } = await requireSupabase().functions.invoke('account-recovery', { body: { email, action } });
  if (error) throw new Error(await functionError(error, 'Recovery could not be requested.'));
  return data?.message || 'If that email belongs to an account, recovery instructions have been sent.';
}

export async function updateRecoveredPassword(password: string) {
  const db = requireSupabase();
  const { error } = await db.auth.updateUser({ password });
  if (error) throw error;
  await db.auth.signOut();
}

export async function signOutRemote() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function deleteRemoteAccount(password: string) {
  const db = requireSupabase();
  const { data, error } = await db.functions.invoke('delete-account', { method: 'POST', body: { password } });
  if (error) throw new Error(await functionError(error, 'Your account could not be deleted. Nothing was changed.'));
  if (!data?.deleted) throw new Error(data?.error || 'Your account could not be deleted. Nothing was changed.');
  await db.auth.signOut({ scope: 'local' });
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
  return { name: row.name, pronouns: row.pronouns || 'he/him', background: asObject(row.background) as any, strength: asObject(traits.strength) as any, weakness: asObject(traits.weakness) as any, motivation: asObject(traits.motivation) as any };
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
    ...(candidate.campaignDate && typeof candidate.campaignDate === 'object' ? { campaignDate: candidate.campaignDate } : {}),
    ...(['alive', 'wounded', 'incapacitated', 'dead'].includes(candidate.condition) ? { condition: candidate.condition } : {}),
    ...('conflict' in candidate ? { conflict: candidate.conflict } : {}),
  };
}

export async function loadRemoteAppData(): Promise<AppData | null> {
  const db = requireSupabase(); const { data: session } = await db.auth.getSession();
  if (!session.session) return null;
  const profile = await getProfile(); if (!profile) return null;
  const [{ data: campaignRows, error }, { data: accessiblePackRows, error: packsError }] = await Promise.all([
    db.from('campaigns').select('*').order('updated_at', { ascending: false }),
    db.from('world_packs').select('id,owner_id,is_system,world_pack_versions(*)'),
  ]);
  if (error) throw error;
  if (packsError) throw packsError;
  const campaigns: Campaign[] = []; const packs = new Map<string, WorldPack>([[`${defaultWorld.id}:${defaultWorld.version}`, defaultWorld]]);
  for (const packRow of accessiblePackRows || []) for (const version of asArray<any>((packRow as any).world_pack_versions)) {
    const pack = version.content as unknown as WorldPack;
    if (pack?.id && version.status === 'ready') packs.set(`${pack.id}:${pack.version}`, pack);
  }
  for (const row of campaignRows || []) {
    const [{ data: version, error: versionError }, { data: characters, error: characterError }, { data: turnRows, error: turnError }, { data: latestSummary, error: summaryError }] = await Promise.all([
      db.from('world_pack_versions').select('*').eq('id', row.pack_version_id).single(), db.from('characters').select('*').eq('campaign_id', row.id), db.from('campaign_turns').select('*').eq('campaign_id', row.id).is('compacted_at', null).order('created_at', { ascending: true }), db.from('chapter_summaries').select('summary,title,chapter_number').eq('campaign_id', row.id).order('chapter_number', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (versionError || characterError || turnError || summaryError || !version) throw versionError || characterError || turnError || summaryError || new Error('Campaign data is incomplete.');
    const pack = version.content as unknown as WorldPack; packs.set(`${pack.id}:${pack.version}`, pack);
    const playerRow = (characters || []).find((item: any) => asObject(item.traits).player) || characters?.[0]; if (!playerRow) continue;
    let state = asObject(playerRow.status) as unknown as GameState;
    const turns: StoryTurn[] = (turnRows || []).map((turn: any) => { state = applyStateChanges(state, turn.state_changes); const date = state.campaignDate; return { id: turn.id, idempotencyKey: turn.idempotency_key, playerText: turn.player_text, intent: mapIntent(turn.structured_intent), narration: turn.narration, suggestions: asArray<string>(turn.suggestions), createdAt: turn.created_at, dateLabel: date ? `${date.year} · DAY ${date.day} · ${date.segment.toUpperCase()}` : undefined }; });
    const visibleChapter = turnRows?.length ? Math.max(...turnRows.map((item: any) => Number(item.chapter_number || 1))) : row.current_chapter || 1;
    const visibleTitle = visibleChapter < Number(row.current_chapter || 1) ? latestSummary?.title : row.current_chapter_title;
    campaigns.push({ id: row.id, ownerId: row.owner_id, title: row.title, packId: pack.id, packVersion: pack.version, character: mapCharacter(playerRow), state, turns, currentChapter: visibleChapter, chapterTitle: visibleTitle || (visibleChapter === 1 ? pack.openingScenario?.chapterLabel : `Chapter ${visibleChapter}`), chapterSummary: latestSummary?.summary, archived: row.status === 'archived', updatedAt: row.updated_at });
  }
  return { user: { id: profile.id, name: profile.display_name, username: profile.username, email: profile.email || undefined, turnsRemaining: profile.turns_balance }, packs: [...packs.values()], campaigns };
}

export async function saveRemoteWorldPack(pack: WorldPack): Promise<WorldPack> {
  const db = requireSupabase();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw authError || new Error('Sign in before saving a world.');
  const slug = safeSlug(pack.id || pack.metadata.title);
  let { data: packRow, error: packError } = await db.from('world_packs').select('*').eq('owner_id', auth.user.id).eq('slug', slug).maybeSingle();
  if (packError) throw packError;
  if (!packRow) {
    const created = await db.from('world_packs').insert({ owner_id: auth.user.id, title: pack.metadata.title, slug, is_system: false }).select().single();
    if (created.error) throw created.error;
    packRow = created.data;
  }
  const { data: latest, error: versionError } = await db.from('world_pack_versions').select('version').eq('pack_id', packRow.id).order('version', { ascending: false }).limit(1).maybeSingle();
  if (versionError) throw versionError;
  const version = Math.max(pack.version || 1, (latest?.version || 0) + 1);
  const canonical: WorldPack = { ...pack, ownerId: auth.user.id, version, status: 'ready' };
  const saved = await db.from('world_pack_versions').insert({ pack_id: packRow.id, version, status: 'ready', schema_version: canonical.schemaVersion, content: canonical as any }).select().single();
  if (saved.error) throw saved.error;
  return canonical;
}

export async function deleteRemoteWorldPack(pack: WorldPack) {
  const db = requireSupabase();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw authError || new Error('Sign in before deleting a world.');
  const { data: row, error: lookupError } = await db.from('world_packs').select('id').eq('owner_id', auth.user.id).eq('is_system', false).eq('slug', safeSlug(pack.id || pack.metadata.title)).maybeSingle();
  if (lookupError) throw lookupError;
  if (!row) throw new Error('This private world could not be found or does not belong to your account.');
  const { data: versions, error: versionsError } = await db.from('world_pack_versions').select('id').eq('pack_id', row.id);
  if (versionsError) throw versionsError;
  const versionIds = (versions || []).map(version => version.id);
  if (versionIds.length) {
    const { data: campaigns, error: campaignsError } = await db.from('campaigns').select('id,title').in('pack_version_id', versionIds);
    if (campaignsError) throw campaignsError;
    if (campaigns?.length) {
      const names = campaigns.slice(0, 3).map(campaign => `“${campaign.title}”`).join(', ');
      const remainder = campaigns.length > 3 ? ` and ${campaigns.length - 3} more` : '';
      throw new Error(`This world cannot be deleted because ${campaigns.length === 1 ? 'a campaign is' : `${campaigns.length} campaigns are`} still using it: ${names}${remainder}. Delete ${campaigns.length === 1 ? 'that campaign' : 'those campaigns'} first, then try again.`);
    }
  }
  const { error } = await db.from('world_packs').delete().eq('id', row.id);
  if (error?.code === '23503') throw new Error('This world is still used by one or more campaigns. Delete those campaigns first, then try again.');
  if (error) throw error;
}

export async function createRemoteCampaign(pack: WorldPack, character: Character, campaignName: string) {
  const { data, error } = await requireSupabase().functions.invoke('create-campaign', { body: { pack, character, campaignName } });
  if (error) throw new Error(await functionError(error, 'Campaign could not be created.'));
  if (data?.error) throw new Error(data.error);
  return data.campaignId as string;
}

export async function deleteRemoteCampaign(campaignId: string) {
  const { error } = await requireSupabase().from('campaigns').delete().eq('id', campaignId);
  if (error) throw error;
}

export async function getWorldDatabase(campaignId: string) {
  const db = requireSupabase();
  const [knowledge, locations, characters, entities, reports, relationships, relationshipHistory, resourceAccounts, resourceTransactions, chapterSummaries] = await Promise.all([
    db.from('player_knowledge').select('*').eq('campaign_id', campaignId).order('updated_at', { ascending: false }), db.from('locations').select('*').eq('campaign_id', campaignId).order('name'), db.from('characters').select('*').eq('campaign_id', campaignId).order('name'), db.from('world_entities').select('*').eq('campaign_id', campaignId), db.from('intel_reports').select('*').eq('campaign_id', campaignId).order('received_at', { ascending: false }),
    db.from('campaign_relationships').select('*').eq('campaign_id', campaignId), db.from('relationship_history').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }), db.from('resource_accounts').select('*').eq('campaign_id', campaignId).order('name'), db.from('resource_transactions').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(200),
    db.from('chapter_summaries').select('*').eq('campaign_id', campaignId).order('chapter_number', { ascending: false }),
  ]);
  const failed = [knowledge, locations, characters, entities, reports, relationships, relationshipHistory, resourceAccounts, resourceTransactions, chapterSummaries].find(result => result.error); if (failed?.error) throw failed.error;
  return { knowledge: knowledge.data || [], locations: locations.data || [], characters: characters.data || [], entities: entities.data || [], reports: reports.data || [], relationships: relationships.data || [], relationshipHistory: relationshipHistory.data || [], resourceAccounts: resourceAccounts.data || [], resourceTransactions: resourceTransactions.data || [], chapterSummaries: chapterSummaries.data || [] };
}

export async function submitRemoteTurn(campaignId: string, playerText: string, idempotencyKey: string) {
  const { data, error } = await requireSupabase().functions.invoke('resolve-turn', { body: { campaignId, playerText, idempotencyKey } });
  if (error) throw new Error(await functionError(error, 'The story could not advance. No turn was charged.'));
  if (data?.error) throw new Error(data.error);
  const turnState = asObject(data.state_changes); const nextState = turnState.nextState as GameState | undefined; const date = nextState?.campaignDate;
  return { turn: { id: data.id, idempotencyKey: data.idempotency_key, playerText: data.player_text, intent: mapIntent(data.structured_intent), narration: data.narration, suggestions: asArray<string>(data.suggestions), createdAt: data.created_at, dateLabel: date ? `${date.year} · DAY ${date.day} · ${date.segment.toUpperCase()}` : undefined } as StoryTurn, stateChanges: data.state_changes, usage: data.usage_units || 0, chapterTransition: turnState.chapterTransition === true, chapterNumber: typeof turnState.chapterNumber === 'number' ? turnState.chapterNumber : undefined, chapterTitle: typeof turnState.chapterTitle === 'string' ? turnState.chapterTitle : undefined, chapterSummary: typeof turnState.chapterSummary === 'string' ? turnState.chapterSummary : undefined };
}
