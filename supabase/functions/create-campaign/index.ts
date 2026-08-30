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
  let service: any;
  let createdCampaignId: string | undefined;
  try {
    const { pack, character } = await req.json();
    if (!pack?.metadata?.title || !Array.isArray(pack.locations) || !pack.locations.length || !character?.name) throw new Error('Invalid campaign data.');
    service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const slug = safeSlug(pack.id || pack.metadata.title);
    const isSystemPack = pack.ownerId === 'system';
    let packQuery = service.from('world_packs').select('*').eq('slug', slug);
    packQuery = isSystemPack ? packQuery.eq('is_system', true).is('owner_id', null) : packQuery.eq('is_system', false).eq('owner_id', auth.user.id);
    let { data: packRow, error: packLookupError } = await packQuery.maybeSingle();
    if (packLookupError) throw packLookupError;
    if (!packRow) {
      const created = await service.from('world_packs').insert({ owner_id: isSystemPack ? null : auth.user.id, title: pack.metadata.title, slug, is_system: isSystemPack }).select().single();
      if (created.error) throw created.error; packRow = created.data;
    }
    let { data: version } = await service.from('world_pack_versions').select('*').eq('pack_id', packRow.id).eq('version', pack.version || 1).maybeSingle();
    if (!version) {
      const created = await service.from('world_pack_versions').insert({ pack_id: packRow.id, version: pack.version || 1, status: 'ready', schema_version: pack.schemaVersion || '1.0', content: { ...pack, ownerId: isSystemPack ? 'system' : auth.user.id } }).select().single();
      if (created.error) throw created.error; version = created.data;
    }
    const title = `${character.name} · ${pack.metadata.title}`;
    const createdCampaign = await service.from('campaigns').insert({ owner_id: auth.user.id, pack_version_id: version.id, title }).select().single();
    if (createdCampaign.error) throw createdCampaign.error;
    const campaign = createdCampaign.data;
    createdCampaignId = campaign.id;
    const locationRows = pack.locations.map((location: any, index: number) => ({ campaign_id: campaign.id, name: location.name, location_type: index === 0 ? 'settlement' : 'landmark', public_description: location.description }));
    const createdLocations = await service.from('locations').insert(locationRows).select();
    if (createdLocations.error) throw createdLocations.error;
    const locationByPackId = new Map(pack.locations.map((location: any, index: number) => [location.id, createdLocations.data[index]]));
    const opening = pack.openingScenario;
    const firstLocation = locationByPackId.get(opening?.startLocationId) || createdLocations.data[0];
    const fallbackItem = character.background?.id === 'knight' ? 'Mail, Sword, and Warhorse' : character.background?.id === 'lord' ? 'Household Seal and Treasury Key' : character.background?.id === 'serf' ? 'Work Knife and Mended Cloak' : pack.items?.[0]?.name || 'Traveler’s kit';
    const inventory = opening?.startingInventory?.length ? opening.startingInventory : [fallbackItem, 'Rain-soaked sealed letter'];
    const memories = opening?.memories || ['A badly wounded male courier handed you a sealed letter before collapsing at your feet.', 'The courier warned you to trust no one wearing the silver ash.'];
    const threads = opening?.unresolvedThreads || ['Why did the courier choose you?', 'Who wears the silver ash?'];
    const sceneFacts = opening?.sceneFacts || ['The courier has already handed over the letter.', 'The courier is badly wounded, conscious, and down at your feet.', 'Oren Voss is watching from across the hall.'];
    const summary = opening ? opening.narration.replaceAll('{name}', character.name).slice(0, 1000) : 'Inside Gloamspire during the succession convocation, a badly wounded courier handed you a rain-soaked sealed letter, warned you about the silver ash, and collapsed at your feet while Oren Voss watched.';
    const initialState = { locationId: firstLocation.id, health: 100, resolve: 88, inventory, relationships: opening?.relationships || {}, memories, unresolvedThreads: threads, summary, sceneFacts, ...(opening?.calendar ? { campaignDate: { calendarName: opening.calendar.name, year: opening.calendar.year, day: opening.calendar.day, segment: opening.calendar.segment } } : {}) };
    const playerEntity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: character.name, public_description: character.background?.description || '' }).select().single();
    if (playerEntity.error) throw playerEntity.error;
    const playerCharacter = await service.from('characters').insert({ campaign_id: campaign.id, entity_id: playerEntity.data.id, name: character.name, pronouns: character.pronouns, background: character.background, traits: { player: true, strength: character.strength, weakness: character.weakness, motivation: character.motivation }, status: initialState }).select().single();
    if (playerCharacter.error) throw playerCharacter.error;
    const playerTruth = await service.from('engine_authoritative_entity_state').insert({ entity_id: playerEntity.data.id, exact_location_id: firstLocation.id, status: initialState });
    if (playerTruth.error) throw playerTruth.error;
    if (memories.length || sceneFacts.length) await service.from('campaign_memories').upsert([...memories, ...sceneFacts].map((fact: string) => ({ campaign_id: campaign.id, memory_type: 'fact', fact, importance: 9, tags: ['opening'] })), { onConflict: 'campaign_id,fact', ignoreDuplicates: true });
    if (threads.length) await service.from('plot_threads').upsert(threads.map((thread: string) => ({ campaign_id: campaign.id, title: thread, status: 'open', importance: 7 })), { onConflict: 'campaign_id,title', ignoreDuplicates: true });
    if (opening?.calendar) await service.from('campaign_clock').insert({ campaign_id: campaign.id, calendar_name: opening.calendar.name, year_label: opening.calendar.year, day_number: opening.calendar.day, segment: opening.calendar.segment });
    if (pack.worldEvents?.length) { const events = await service.from('engine_scheduled_campaign_events').insert(pack.worldEvents.map((event: any) => ({ campaign_id: campaign.id, event_key: event.id, name: event.name, description: event.description, earliest_day: event.earliestDay, latest_day: event.latestDay, conditions: event.conditions }))); if (events.error) throw events.error; }
    const entityByPackId = new Map<string, any>();
    entityByPackId.set('player', playerEntity.data);
    for (let index = 0; index < (pack.npcs || []).length; index++) {
      const npc = pack.npcs[index];
      const entity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: npc.name, public_description: npc.description }).select().single();
      if (entity.error) throw entity.error;
      entityByPackId.set(npc.id, entity.data);
      const npcCharacter = await service.from('characters').insert({ campaign_id: campaign.id, entity_id: entity.data.id, name: npc.name, background: { name: npc.description }, traits: { player: false }, status: { active: true } });
      if (npcCharacter.error) throw npcCharacter.error;
      const believed = createdLocations.data[Math.min(index, createdLocations.data.length - 1)];
      const playerKnowledge = await service.from('player_knowledge').insert({ campaign_id: campaign.id, viewer_id: auth.user.id, entity_id: entity.data.id, known_status: { label: 'Active' }, believed_location_id: believed?.id, location_precision: index === 0 ? 'exact' : 'settlement', confidence: index === 0 ? 'high' : index === 1 ? 'medium' : 'low', last_confirmed_at: new Date().toISOString(), source_summary: index === 0 ? 'Seen personally' : 'Reported by court informants', resource_estimates: {} });
      if (playerKnowledge.error) throw playerKnowledge.error;
      const npcTruth = await service.from('engine_authoritative_entity_state').insert({ entity_id: entity.data.id, exact_location_id: believed?.id, status: { active: true }, private_goals: {} });
      if (npcTruth.error) throw npcTruth.error;
    }
    for (const secretConfig of (pack.secretSystems || [])) {
      const secret = await service.from('engine_campaign_secrets').insert({ campaign_id: campaign.id, secret_key: secretConfig.id, name: secretConfig.name, description: secretConfig.description, stakes: secretConfig.stakes, evidence_types: secretConfig.evidenceTypes }).select().single();
      if (secret.error) throw secret.error;
      if (secretConfig.initialAwareness.length) { const awareness = await service.from('engine_entity_secret_awareness').insert(secretConfig.initialAwareness.map((state: any) => { const entity = entityByPackId.get(state.entityId); return { campaign_id: campaign.id, secret_id: secret.data.id, entity_id: entity?.id || null, entity_name: entity?.canonical_name || state.entityId, awareness: state.level, suspicion: state.suspicion, reasons: [] }; })); if (awareness.error) throw awareness.error; }
    }
    return Response.json({ campaignId: campaign.id }, { headers: corsHeaders });
  } catch (error) {
    if (createdCampaignId && service) {
      const cleanup = await service.from('campaigns').delete().eq('id', createdCampaignId);
      if (cleanup.error) console.error('create-campaign rollback failed', { campaignId: createdCampaignId, error: cleanup.error });
    }
    console.error('create-campaign failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Campaign could not be created.' }, { status: 400, headers: corsHeaders });
  }
});
