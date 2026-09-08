import type { buildWorldRequest } from "../worldWizard";
import { defaultWorld } from '../defaultWorld';
import type { AppData, Campaign, CampaignSetupOptions, Character, GameState, Intent, StoryTurn, WorldPack } from '../types';
import { requireSupabase } from './supabase';

const asObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const safeSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'private-world';

export interface BackgroundJob {
  id: string;
  job_type: 'generate_world' | 'create_campaign' | 'audit_world_ledger' | 'context_research';
  status: 'queued' | 'running' | 'stalled' | 'completed' | 'failed';
  payload: { world?: string; character?: string; startingPoint?: string; campaignName?: string; campaignId?: string; context?: string };
  result?: { pack?: WorldPack; generationCost?: number; importCost?: number; creditsRemaining?: number; campaignId?: string; cost?: number; recognized?: { characters?: string[]; updatedCharacters?: string[]; locations?: string[]; summary?: string } } | null;
  error_message?: string | null;
  attempts: number;
  progress_stage: string;
  progress_percent: number;
  progress_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  last_activity_at?: string | null;
  updated_at: string;
}

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

export async function quoteTurnNarration(turnId: string): Promise<{ cached: boolean; audioUrl?: string; downloadUrl?: string; expiresAt?: string; cost: number; estimatedTokens: number }> {
  const { data, error } = await requireSupabase().functions.invoke('generate-narration', { body: { turnId, action: 'quote' } });
  if (error) throw new Error(await functionError(error, 'Narration could not be prepared.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function generateTurnNarration(turnId: string): Promise<{ cached: boolean; audioUrl: string; downloadUrl?: string; expiresAt?: string; cost: number; estimatedTokens: number; creditsRemaining?: number }> {
  const { data, error } = await requireSupabase().functions.invoke('generate-narration', { body: { turnId, action: 'generate' } });
  if (error) throw new Error(await functionError(error, 'Narration could not be generated. No Crowns were charged.'));
  if (data?.error || !data?.audioUrl) throw new Error(data?.error || 'Narration audio was not returned.');
  return data;
}

export async function quoteOpeningNarration(campaignId: string): Promise<{ cached: boolean; audioUrl?: string; downloadUrl?: string; expiresAt?: string; cost: number; estimatedTokens: number }> {
  const { data, error } = await requireSupabase().functions.invoke('generate-narration', { body: { campaignId, source: 'opening', action: 'quote' } });
  if (error) throw new Error(await functionError(error, 'Opening narration could not be prepared.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function generateOpeningNarration(campaignId: string): Promise<{ cached: boolean; audioUrl: string; downloadUrl?: string; expiresAt?: string; cost: number; estimatedTokens: number; creditsRemaining?: number }> {
  const { data, error } = await requireSupabase().functions.invoke('generate-narration', { body: { campaignId, source: 'opening', action: 'generate' } });
  if (error) throw new Error(await functionError(error, 'Opening narration could not be generated. No Crowns were charged.'));
  if (data?.error || !data?.audioUrl) throw new Error(data?.error || 'Narration audio was not returned.');
  return data;
}

export async function listRemoteNarrationAvailability(campaignId: string): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('turn_narrations')
    .select('turn_id,source_kind')
    .eq('campaign_id', campaignId)
    .eq('status', 'ready')
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return (data || []).map((row: any) => row.source_kind === 'opening' ? 'opening' : row.turn_id).filter(Boolean);
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
  const legacyAttributes = asObject(traits.attributes);
  const attributes = Object.keys(legacyAttributes).length ? {
    strength: Number(legacyAttributes.strength) || 5, agility: Number(legacyAttributes.agility) || 5,
    endurance: Number(legacyAttributes.endurance) || 5, intelligence: Number(legacyAttributes.intelligence) || 5,
    perception: Number(legacyAttributes.perception) || 5, willpower: Number(legacyAttributes.willpower) || 5,
    presence: Number(legacyAttributes.presence) || 5,
  } : {};
  const skills = Array.isArray(traits.skills) ? [...traits.skills] : [];
  if (Number.isInteger(Number(legacyAttributes.combatSkill)) && !skills.some((skill:any) => /combat|weapon|fight|duel|archery|gun|unarmed|sword/i.test(String(skill?.name || '')))) {
    skills.push({name:'Combat',rating:Math.max(1,Math.min(10,Number(legacyAttributes.combatSkill)))});
  }
  return { name: row.name, pronouns: row.pronouns || 'he/him', background: asObject(row.background) as any, strength: asObject(traits.strength) as any, weakness: asObject(traits.weakness) as any, motivation: asObject(traits.motivation) as any,
    ...(Object.keys(attributes).length ? { attributes: attributes as any } : {}), ...(skills.length ? { skills: skills as any } : {}) };
}

function publicWorldContent(value: unknown): Record<string, unknown> {
  const content = { ...asObject(value) };
  delete content.economicProfiles;
  delete content.factionEconomicProfiles;
  return content;
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
  // The first job-list check resumes pending work; loading data need not dispatch another request.
  const profile = await getProfile(); if (!profile) return null;
  const [{ data: campaignRows, error }, { data: accessiblePackRows, error: packsError }] = await Promise.all([
    db.from('campaigns').select('*').order('updated_at', { ascending: false }),
    db.from('world_packs').select('id,owner_id,is_system,world_pack_versions(*)'),
  ]);
  if (error) throw error;
  if (packsError) throw packsError;
  const campaigns: Campaign[] = []; const packs = new Map<string, WorldPack>([[`${defaultWorld.id}:${defaultWorld.version}`, defaultWorld]]);
  for (const packRow of accessiblePackRows || []) for (const version of asArray<any>((packRow as any).world_pack_versions)) {
    const pack = { ...publicWorldContent(version.content), databaseVersionId: version.id } as unknown as WorldPack;
    if (pack?.id && version.status === 'ready') packs.set(`${pack.id}:${pack.version}`, pack);
  }
  for (const row of campaignRows || []) {
    const [{ data: version, error: versionError }, { data: characters, error: characterError }, { data: turnRows, error: turnError }, { data: latestSummary, error: summaryError }] = await Promise.all([
      db.from('world_pack_versions').select('*').eq('id', row.pack_version_id).single(), db.from('characters').select('*').eq('campaign_id', row.id), db.from('campaign_turns').select('*').eq('campaign_id', row.id).is('compacted_at', null).order('created_at', { ascending: true }), db.from('chapter_summaries').select('summary,title,chapter_number').eq('campaign_id', row.id).order('chapter_number', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (versionError || characterError || turnError || summaryError || !version) throw versionError || characterError || turnError || summaryError || new Error('Campaign data is incomplete.');
    const pack = { ...publicWorldContent(version.content), databaseVersionId: version.id } as unknown as WorldPack; packs.set(`${pack.id}:${pack.version}`, pack);
    const playerRow = (characters || []).find((item: any) => asObject(item.traits).player) || characters?.[0]; if (!playerRow) continue;
    const state = asObject(playerRow.status) as unknown as GameState;
    const turns: StoryTurn[] = (turnRows || []).map((turn: any) => {
      const storedTurnState = asObject(asObject(turn.state_changes).nextState) as unknown as GameState;
      const date = storedTurnState.campaignDate;
      const turnTitle = typeof turn.turn_title === 'string' && turn.turn_title.trim()
        ? turn.turn_title
        : date ? `${date.year} · DAY ${date.day} · ${date.segment.toUpperCase()}` : undefined;
      return { id: turn.id, idempotencyKey: turn.idempotency_key, playerText: turn.player_text, intent: mapIntent(turn.structured_intent), narration: turn.narration, suggestions: asArray<string>(turn.suggestions), createdAt: turn.created_at, turnTitle, dateLabel: turnTitle };
    });
    const visibleChapter = turnRows?.length ? Math.max(...turnRows.map((item: any) => Number(item.chapter_number || 1))) : row.current_chapter || 1;
    const visibleTitle = visibleChapter < Number(row.current_chapter || 1) ? latestSummary?.title : row.current_chapter_title;
    campaigns.push({ preparedWorld: asObject(row.setup_preferences).preparedWorld as WorldPack | undefined, id: row.id, ownerId: row.owner_id, title: row.title, packId: pack.id, packVersion: pack.version, character: mapCharacter(playerRow), state, turns, currentChapter: visibleChapter, chapterTitle: visibleTitle || (visibleChapter === 1 ? pack.openingScenario?.chapterLabel : `Chapter ${visibleChapter}`), chapterSummary: latestSummary?.summary, archived: row.status === 'archived', updatedAt: row.updated_at });
  }
  return { user: { id: profile.id, name: profile.display_name, username: profile.username, email: profile.email || undefined, creditsRemaining: profile.credits_balance }, packs: [...packs.values()], campaigns };
}

export async function updateRemoteCampaignMetadata(
  campaignId: string,
  metadata: { title: string },
): Promise<{ title: string; updated_at: string }> {
  const db = requireSupabase();
  const title = metadata.title.trim();
  if (title.length < 3 || title.length > 80)
    throw new Error("Campaign titles must contain between 3 and 80 characters.");
  const { data, error } = await db
    .from("campaigns")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("title,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function saveRemoteWorldPack(pack: WorldPack): Promise<{ pack: WorldPack; cost: number; creditsRemaining: number }> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('import_world_pack', { p_pack: pack as any });
  if (error) throw error;
  const result = data as any;
  if (!result?.pack) throw new Error('The imported world was not returned by the server.');
  return { pack: result.pack as WorldPack, cost: Number(result.cost), creditsRemaining: Number(result.creditsRemaining) };
}

export async function generateRemoteWorldPack(request: ReturnType<typeof buildWorldRequest>): Promise<{ pack: WorldPack; generationCost: number; importCost: number; creditsRemaining: number }> {
  const data = await enqueueAndWaitForJob('generate_world', { action: 'generate', ...request });
  if (!data?.pack) throw new Error('The AI returned no world pack.');
  return { pack: data.pack as WorldPack, generationCost: Number(data.generationCost || 0), importCost: Number(data.importCost || 0), creditsRemaining: Number(data.creditsRemaining || 0) };
}

export async function queueRemoteWorldPack(request: ReturnType<typeof buildWorldRequest>): Promise<{ jobId: string; creditsRemaining?: number }> {
  const db = requireSupabase();
  const queued = await db.functions.invoke('background-jobs', { body: { action: 'enqueue', jobType: 'generate_world', payload: { action: 'generate', ...request }, idempotencyKey: crypto.randomUUID() } });
  if (queued.error) throw new Error(await functionError(queued.error, 'The background job could not be started.'));
  if (!queued.data?.jobId) throw new Error('The server did not return a background job ID.');
  backgroundJobList = undefined;
  return { jobId: queued.data.jobId as string, creditsRemaining: typeof queued.data.creditsRemaining === 'number' ? queued.data.creditsRemaining : undefined };
}

export const BACKGROUND_JOB_POLL_MS = 1_000;
let backgroundJobList: { session: string; startedAt: number; idle: boolean; inFlight: boolean; request: Promise<BackgroundJob[]> } | undefined;
export async function listRemoteBackgroundJobs(): Promise<BackgroundJob[]> {
  const db = requireSupabase();
  const { data } = await db.auth.getSession();
  const session = data.session?.access_token || '';
  // Home, Worlds and the ledger share one request per polling window.
  if (backgroundJobList?.session === session && (backgroundJobList.idle || backgroundJobList.inFlight || Date.now() - backgroundJobList.startedAt < BACKGROUND_JOB_POLL_MS)) return backgroundJobList.request;
  let request!: Promise<BackgroundJob[]>;
  request = (async () => {
    const response = await db.functions.invoke('background-jobs', { body: { action: 'list' }, signal: AbortSignal.timeout(9000) });
    if (response.error) throw new Error(await functionError(response.error, 'Background jobs could not be loaded.'));
    const jobs: BackgroundJob[] = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
    if (backgroundJobList?.request === request) {
      backgroundJobList.idle = !jobs.some(job => ['queued', 'running', 'stalled'].includes(job.status) || (job.status === 'failed' && job.attempts < 2));
    }
    return jobs;
  })().finally(() => {
    if (backgroundJobList?.request === request) backgroundJobList.inFlight = false;
  });
  backgroundJobList = { session, startedAt: Date.now(), idle: false, inFlight: true, request };
  return request;
}

export async function getWorldJobNotificationPreferences() {
  const db = requireSupabase(); const auth = await db.auth.getUser(); if (!auth.data.user) throw new Error('Sign in to manage notifications.');
  const row = await db.from('profiles').select('world_job_email_notifications,world_job_push_notifications').eq('id',auth.data.user.id).single();
  if (row.error) throw row.error;
  return { email: !!row.data.world_job_email_notifications, push: !!row.data.world_job_push_notifications };
}

export async function setWorldJobNotificationPreferences(preferences: { email: boolean; push: boolean }) {
  const db = requireSupabase(); const auth = await db.auth.getUser(); if (!auth.data.user) throw new Error('Sign in to manage notifications.');
  const update = await db.from('profiles').update({ world_job_email_notifications: preferences.email, world_job_push_notifications: preferences.push }).eq('id',auth.data.user.id);
  if (update.error) throw update.error;
}

export async function registerWorldJobPushToken(token: string, platform: string) {
  const db = requireSupabase(); const auth = await db.auth.getUser(); if (!auth.data.user) throw new Error('Sign in to enable push notifications.');
  const saved = await db.from('push_notification_devices').upsert({ owner_id: auth.data.user.id, expo_push_token: token, platform, enabled: true, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,expo_push_token' });
  if (saved.error) throw saved.error;
}

export async function deleteRemoteWorldPack(pack: WorldPack) {
  const db = requireSupabase();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw authError || new Error('Sign in before deleting a world.');
  let row: { id: string } | null = null;
  if (pack.databaseVersionId) {
    const versionLookup = await db
      .from('world_pack_versions')
      .select('pack_id,world_packs!inner(id,owner_id,is_system)')
      .eq('id', pack.databaseVersionId)
      .eq('world_packs.owner_id', auth.user.id)
      .eq('world_packs.is_system', false)
      .maybeSingle();
    if (versionLookup.error) throw versionLookup.error;
    if (versionLookup.data?.pack_id) row = { id: versionLookup.data.pack_id };
  }
  // Older locally cached packs may predate databaseVersionId. Keep their slug
  // lookup as a fallback, but never use it instead of the exact version link.
  if (!row && !pack.databaseVersionId) {
    const lookup = await db.from('world_packs').select('id').eq('owner_id', auth.user.id).eq('is_system', false).eq('slug', safeSlug(pack.id || pack.metadata.title)).maybeSingle();
    if (lookup.error) throw lookup.error;
    row = lookup.data;
  }
  // Deletion is idempotent. A rapid repeated press, stale tab, or a retry after
  // the first request succeeded should converge on the same deleted state.
  if (!row) return;
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
  const { data: deleted, error } = await db.from('world_packs').delete().eq('id', row.id).eq('owner_id', auth.user.id).eq('is_system', false).select('id');
  if (error?.code === '23503') throw new Error('This world is still used by one or more campaigns. Delete those campaigns first, then try again.');
  if (error) throw error;
  if (!deleted?.some(item => item.id === row.id)) throw new Error('The database did not confirm that this world was deleted. Refresh the page and try again.');
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function enqueueAndWaitForJob(jobType: 'generate_world' | 'create_campaign', payload: Record<string, unknown>, onProgress?: (job: BackgroundJob) => void) {
  const db = requireSupabase(); const idempotencyKey = crypto.randomUUID();
  const queued = await db.functions.invoke('background-jobs', { body: { action: 'enqueue', jobType, payload, idempotencyKey } });
  if (queued.error) throw new Error(await functionError(queued.error, 'The background job could not be started.'));
  const jobId = queued.data?.jobId; if (!jobId) throw new Error('The server did not return a background job ID.');
  backgroundJobList = undefined;
  let statusFailures = 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await wait(BACKGROUND_JOB_POLL_MS);
    const status = await db.functions.invoke('background-jobs', { body: { action: 'status', jobId }, signal: AbortSignal.timeout(20000) });
    if (status.error) {
      if (++statusFailures >= 5) throw new Error('Unable to check campaign progress. The job may still be running; check your campaigns before starting another.');
      continue;
    }
    statusFailures = 0;
    onProgress?.(status.data as BackgroundJob);
    if (status.data?.status === 'completed') return status.data.result;
    if (status.data?.status === 'failed') throw new Error(status.data.error_message || 'The background job failed.');
  }
  throw new Error('This job is still running in the background. You can safely close the app; the result will appear when you return.');
}

export async function createRemoteCampaign(pack: WorldPack, character: Character, campaignName: string, setup: CampaignSetupOptions = (character as Character & { campaignSetup?: CampaignSetupOptions }).campaignSetup || {}, onProgress?: (job: BackgroundJob) => void) {
  const data = await enqueueAndWaitForJob('create_campaign', { action: 'create', packVersionId: pack.databaseVersionId, packId: pack.id, packVersion: pack.version, character, campaignName, setup }, onProgress);
  return data.campaignId as string;
}

export async function queueRemoteCampaign(pack: WorldPack, character: Character, campaignName: string): Promise<BackgroundJob> {
  const setup = (character as Character & { campaignSetup?: CampaignSetupOptions }).campaignSetup;
  const response = await requireSupabase().functions.invoke('background-jobs', { body: {
    action: 'enqueue', jobType: 'create_campaign', idempotencyKey: crypto.randomUUID(),
    payload: { action: 'create', packVersionId: pack.databaseVersionId, packId: pack.id, packVersion: pack.version, character, campaignName, setup },
  } });
  backgroundJobList = undefined;
  if (response.error) throw new Error(await functionError(response.error, 'Campaign preparation could not be queued.'));
  if (!response.data?.jobId) throw new Error('The server did not confirm a campaign job.');
  const now = new Date().toISOString();
  return { id: response.data.jobId, job_type: 'create_campaign', status: response.data.status || 'queued', payload: { campaignName },
    attempts: 0, progress_stage: response.data.progressStage || 'queued', progress_percent: response.data.progressPercent || 0,
    progress_message: response.data.progressMessage || 'Campaign preparation queued.', created_at: now, updated_at: now };
}

export async function deleteRemoteCampaign(campaignId: string) {
  const { error } = await requireSupabase().from('campaigns').delete().eq('id', campaignId);
  if (error) throw error;
}

export async function findExistingCharacters(pack: WorldPack, name: string): Promise<Array<{ name: string; description: string }>> {
  const { data, error } = await requireSupabase().functions.invoke('create-campaign', { body: {
    action: 'identify', packVersionId: pack.databaseVersionId, packId: pack.id, packVersion: pack.version, character: { name },
  } });
  if (error) throw new Error(await functionError(error, 'Character search failed. Please try again.'));
  if (!Array.isArray(data?.candidates)) throw new Error('Character search returned no usable response.');
  return data.candidates;
}

export async function getWorldDatabase(campaignId: string) {
  const db = requireSupabase();
  const [knowledge, locations, characters, entities, reports, relationships, relationshipHistory, relationshipRoles, relationshipRoleHistory, traitHistory, chapterSummaries, politicalStatuses, contextNotes, characterConnections] = await Promise.all([
    db.from('player_knowledge').select('*').eq('campaign_id', campaignId).order('updated_at', { ascending: false }), db.from('locations').select('*').eq('campaign_id', campaignId).order('name'), db.from('characters').select('*').eq('campaign_id', campaignId).order('name'), db.from('world_entities').select('*').eq('campaign_id', campaignId), db.from('intel_reports').select('*').eq('campaign_id', campaignId).order('received_at', { ascending: false }),
    db.from('campaign_relationships').select('*').eq('campaign_id', campaignId), db.from('relationship_history').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }), db.from('campaign_relationship_roles').select('*').eq('campaign_id',campaignId).order('started_at'), db.from('campaign_relationship_role_history').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:false}), db.from('character_trait_history').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    db.from('chapter_summaries').select('*').eq('campaign_id', campaignId).order('chapter_number', { ascending: false }),
    db.from('campaign_character_titles').select('*').eq('campaign_id', campaignId).order('updated_at', { ascending: false }),
    db.from('campaign_context_notes').select('id,context_text,status,crowns_charged,created_at').eq('campaign_id', campaignId).eq('status','active').order('created_at',{ascending:false}),
    db.from('campaign_character_connections').select('*').eq('campaign_id', campaignId).order('created_at'),
  ]);
  const failed = [knowledge, locations, characters, entities, reports, relationships, relationshipHistory, relationshipRoles, relationshipRoleHistory, traitHistory, chapterSummaries, politicalStatuses, contextNotes, characterConnections].find(result => result.error); if (failed?.error) throw failed.error;
  return { knowledge: knowledge.data || [], locations: locations.data || [], characters: characters.data || [], entities: entities.data || [], reports: reports.data || [], relationships: relationships.data || [], relationshipHistory: relationshipHistory.data || [], relationshipRoles: relationshipRoles.data || [], relationshipRoleHistory: relationshipRoleHistory.data || [], traitHistory: traitHistory.data || [], chapterSummaries: chapterSummaries.data || [], politicalStatuses: politicalStatuses.data || [], contextNotes: contextNotes.data || [], characterConnections: characterConnections.data || [] };
}

export async function addRemoteCampaignContext(campaignId: string, context: string) {
  const { data, error } = await requireSupabase().functions.invoke('add-campaign-context', { body: { campaignId, context: context.trim() } });
  if (error) throw new Error(await functionError(error, 'The campaign context could not be added. No Crowns were charged.'));
  if (data?.error) throw new Error(data.error);
  return data as { id: string; cost: number; creditsRemaining: number; apiCostUsd: number; recognized?: { characters: string[]; updatedCharacters: string[]; locations: string[]; summary: string } };
}

export async function queueRemoteCampaignContext(campaignId: string, context: string): Promise<{ jobId: string; creditsRemaining: number }> {
  const response = await requireSupabase().functions.invoke('background-jobs', { body: { action: 'enqueue', jobType: 'context_research', payload: { campaignId, context: context.trim() }, idempotencyKey: crypto.randomUUID() } });
  backgroundJobList = undefined;
  if (response.error) throw new Error(await functionError(response.error, 'The research job could not be started. No Crowns were reserved.'));
  if (response.data?.error) throw new Error(response.data.error);
  if (!response.data?.jobId) throw new Error('The server did not return a research job ID.');
  return { jobId: String(response.data.jobId), creditsRemaining: Number(response.data.creditsRemaining) };
}

export async function submitRemoteTurn(campaignId: string, playerText: string, idempotencyKey: string) {
  const { data, error } = await requireSupabase().functions.invoke('resolve-turn', { body: { campaignId, playerText, idempotencyKey } });
  if (error) throw new Error(await functionError(error, 'The story could not advance. No turn was charged.'));
  if (data?.error) throw new Error(data.error);
  const turnState = asObject(data.state_changes); const nextState = turnState.nextState as GameState | undefined; const date = nextState?.campaignDate;
  const turnTitle = typeof data.turn_title === 'string' && data.turn_title.trim()
    ? data.turn_title
    : date ? `${date.year} · DAY ${date.day} · ${date.segment.toUpperCase()}` : undefined;
  return { turn: { id: data.id, idempotencyKey: data.idempotency_key, playerText: data.player_text, intent: mapIntent(data.structured_intent), narration: data.narration, suggestions: asArray<string>(data.suggestions), createdAt: data.created_at, turnTitle, dateLabel: turnTitle } as StoryTurn, stateChanges: data.state_changes, usage: data.usage_units || 0, chapterTransition: turnState.chapterTransition === true, chapterNumber: typeof turnState.chapterNumber === 'number' ? turnState.chapterNumber : undefined, chapterTitle: typeof turnState.chapterTitle === 'string' ? turnState.chapterTitle : undefined, chapterSummary: typeof turnState.chapterSummary === 'string' ? turnState.chapterSummary : undefined };
}

export interface CampaignRespawnPoint {
  turnId: string;
  chapterNumber: number;
  turnNumber: number;
  title: string;
  playerText: string;
  createdAt: string;
  chapterStart: boolean;
}

export async function listCampaignRespawnPoints(campaignId: string): Promise<CampaignRespawnPoint[]> {
  const db = requireSupabase();
  const { data, error } = await db.from('campaign_turns')
    .select('id,chapter_number,turn_title,player_text,created_at,state_changes')
    .eq('campaign_id', campaignId).order('created_at', { ascending: true });
  if (error) throw error;
  let priorChapter = 0;
  return (data || []).map((turn: any, index: number) => {
    const chapterNumber = Number(turn.chapter_number || 1);
    const chapterStart = chapterNumber !== priorChapter;
    priorChapter = chapterNumber;
    const state = asObject(asObject(turn.state_changes).nextState);
    return {
      turnId: turn.id, chapterNumber, turnNumber: index + 1, chapterStart,
      title: String(turn.turn_title || `Chapter ${chapterNumber} · Turn ${index + 1}`),
      playerText: String(turn.player_text || '').slice(0, 180), createdAt: turn.created_at,
      alive: state.condition !== 'dead' && Number(state.health ?? 1) > 0,
    };
  }).filter((point: any) => point.alive).map(({ alive: _alive, ...point }: any) => point);
}

export async function respawnRemoteCampaign(campaignId: string, restoreTurnId: string) {
  const { data, error } = await (requireSupabase() as any).rpc('respawn_campaign', {
    p_campaign_id: campaignId, p_restore_turn_id: restoreTurnId, p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw error;
  return data as { campaignId: string; cost: number; creditsRemaining: number };
}

export async function saveTurnResponseFeedback(campaignId: string, turnId: string, rating: 'helpful' | 'unhelpful', reasonCategory?: 'continuity' | 'character' | 'pacing' | 'tone' | 'outcome' | 'other', explanation?: string) {
  const db = requireSupabase();
  const auth = await db.auth.getUser();
  if (!auth.data.user) throw new Error('Sign in to rate this response.');
  const saved = await db.from('turn_response_feedback').upsert({ owner_id: auth.data.user.id, campaign_id: campaignId, turn_id: turnId, rating, reason_category: rating === 'unhelpful' ? reasonCategory || 'other' : null, explanation: rating === 'unhelpful' ? String(explanation || '').trim().slice(0, 1000) || null : null, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,turn_id' });
  if (saved.error) throw saved.error;
}
