import { requireSupabase } from './supabase';

export async function getProfile() {
  const db = requireSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error) throw error;
  return data;
}

export async function listCampaigns() {
  const { data, error } = await requireSupabase().from('campaigns').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getWorldDatabase(campaignId: string) {
  const db = requireSupabase();
  const [knowledge, locations, characters] = await Promise.all([
    db.from('player_knowledge').select('*').eq('campaign_id', campaignId).order('updated_at', { ascending: false }),
    db.from('locations').select('*').eq('campaign_id', campaignId).order('name'),
    db.from('characters').select('*').eq('campaign_id', campaignId).order('name'),
  ]);
  if (knowledge.error) throw knowledge.error;
  if (locations.error) throw locations.error;
  if (characters.error) throw characters.error;
  return { knowledge: knowledge.data, locations: locations.data, characters: characters.data };
}

export async function submitRemoteTurn(campaignId: string, playerText: string, idempotencyKey: string) {
  const { data, error } = await requireSupabase().functions.invoke('resolve-turn', { body: { campaignId, playerText, idempotencyKey } });
  if (error) throw error;
  return data;
}
