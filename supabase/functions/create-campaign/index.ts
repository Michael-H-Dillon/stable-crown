import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const safeSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'private-world';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  try {
    const { pack, character } = await req.json();
    if (!pack?.metadata?.title || !Array.isArray(pack.locations) || !pack.locations.length || !character?.name) throw new Error('Invalid campaign data.');
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const slug = safeSlug(pack.id || pack.metadata.title);
    let { data: packRow } = await service.from('world_packs').select('*').eq('slug', slug).eq('owner_id', auth.user.id).maybeSingle();
    if (!packRow) {
      const created = await service.from('world_packs').insert({ owner_id: auth.user.id, title: pack.metadata.title, slug, is_system: false }).select().single();
      if (created.error) throw created.error; packRow = created.data;
    }
    let { data: version } = await service.from('world_pack_versions').select('*').eq('pack_id', packRow.id).eq('version', pack.version || 1).maybeSingle();
    if (!version) {
      const created = await service.from('world_pack_versions').insert({ pack_id: packRow.id, version: pack.version || 1, status: 'ready', schema_version: pack.schemaVersion || '1.0', content: { ...pack, ownerId: auth.user.id } }).select().single();
      if (created.error) throw created.error; version = created.data;
    }
    const title = `${character.name} · ${pack.metadata.title}`;
    const createdCampaign = await service.from('campaigns').insert({ owner_id: auth.user.id, pack_version_id: version.id, title }).select().single();
    if (createdCampaign.error) throw createdCampaign.error;
    const campaign = createdCampaign.data;
    const locationRows = pack.locations.map((location: any, index: number) => ({ campaign_id: campaign.id, name: location.name, location_type: index === 0 ? 'settlement' : 'landmark', public_description: location.description }));
    const createdLocations = await service.from('locations').insert(locationRows).select();
    if (createdLocations.error) throw createdLocations.error;
    const firstLocation = createdLocations.data[0];
    const startingItem = character.background?.id === 'knight' ? 'Mail, Sword, and Warhorse' : character.background?.id === 'lord' ? 'Household Seal and Treasury Key' : character.background?.id === 'serf' ? 'Work Knife and Mended Cloak' : pack.items?.[0]?.name || 'Traveler’s kit';
    const initialState = { locationId: firstLocation.id, health: 100, resolve: 88, inventory: [startingItem, 'Rain-soaked sealed letter'], relationships: {}, memories: ['A badly wounded male courier handed you a sealed letter before collapsing at your feet.', 'The courier warned you to trust no one wearing the silver ash.'], unresolvedThreads: ['Why did the courier choose you?', 'Who wears the silver ash?'], summary: 'Inside Gloamspire during the succession convocation, a badly wounded courier handed you a rain-soaked sealed letter, warned you about the silver ash, and collapsed at your feet while Oren Voss watched.', sceneFacts: ['The courier has already handed over the letter.', 'The courier is badly wounded, conscious, and down at your feet.', 'Oren Voss is watching from across the hall.'] };
    const playerEntity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: character.name, public_description: character.background?.description || '' }).select().single();
    if (playerEntity.error) throw playerEntity.error;
    const playerCharacter = await service.from('characters').insert({ campaign_id: campaign.id, entity_id: playerEntity.data.id, name: character.name, pronouns: character.pronouns, background: character.background, traits: { player: true, strength: character.strength, weakness: character.weakness, motivation: character.motivation }, status: initialState }).select().single();
    if (playerCharacter.error) throw playerCharacter.error;
    await service.schema('private').from('authoritative_entity_state').insert({ entity_id: playerEntity.data.id, exact_location_id: firstLocation.id, status: initialState });
    for (let index = 0; index < (pack.npcs || []).length; index++) {
      const npc = pack.npcs[index];
      const entity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: npc.name, public_description: npc.description }).select().single();
      if (entity.error) throw entity.error;
      await service.from('characters').insert({ campaign_id: campaign.id, entity_id: entity.data.id, name: npc.name, background: { name: npc.description }, traits: { player: false }, status: { active: true } });
      const believed = createdLocations.data[Math.min(index, createdLocations.data.length - 1)];
      await service.from('player_knowledge').insert({ campaign_id: campaign.id, viewer_id: auth.user.id, entity_id: entity.data.id, known_status: { label: 'Active' }, believed_location_id: believed?.id, location_precision: index === 0 ? 'exact' : 'settlement', confidence: index === 0 ? 'high' : index === 1 ? 'medium' : 'low', last_confirmed_at: new Date().toISOString(), source_summary: index === 0 ? 'Seen personally' : 'Reported by court informants', resource_estimates: {} });
      await service.schema('private').from('authoritative_entity_state').insert({ entity_id: entity.data.id, exact_location_id: believed?.id, status: { active: true }, private_goals: {} });
    }
    return Response.json({ campaignId: campaign.id }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Campaign could not be created.' }, { status: 400, headers: corsHeaders });
  }
});
