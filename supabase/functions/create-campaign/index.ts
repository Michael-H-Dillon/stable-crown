import { prepareCampaign } from '../_shared/prepare-campaign.ts';

import { findCharacterIdentities } from '../_shared/character-identity.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { normalizeCharacterAttributes } from '../_shared/character-attributes.ts';




const titleCaseInventoryItem = (value: unknown) => String(value || '')

  .trim()

  .replace(/[-_]+/g, ' ')

  .replace(/\s+/g, ' ')

  .toLocaleLowerCase()

  .replace(/(^|[\s/])([\p{L}\p{N}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`);



const prepareStartingInventory = (pack: any, character: any, opening: any) => {

  const background = `${character.background?.id || ''} ${character.background?.name || ''} ${character.background?.description || ''}`.toLocaleLowerCase();

  const openingContext = `${opening?.narration || ''} ${(opening?.sceneFacts || []).join(' ')}`.toLocaleLowerCase();

  const supplied = Array.isArray(opening?.startingInventory) ? opening.startingInventory : [];

  const inferred: string[] = [];

  const isKnight = /\bknight\b/.test(background);

  const isNoble = isKnight || /\b(lord|lady|prince|princess|king|queen|noble)\b/.test(background);

  const isMounted = /\b(horse|horseback|mounted|rides?|riding|destrier|courser|palfrey)\b/.test(openingContext);

  const martialSetting = /\b(sword|blade|armed|armou?r|mail|knight|battle|war)\b/.test(`${background} ${openingContext}`);



  if (isNoble && martialSetting) inferred.push('Sword');

  if (isKnight || (isNoble && isMounted)) inferred.push('Horse');

  if (isNoble) inferred.push('Personal Purse');

  if (!supplied.length && !inferred.length) inferred.push(pack.items?.[0]?.name || 'Traveler’s Kit');



  const known = new Set<string>();

  return [...supplied, ...inferred]

    .map(titleCaseInventoryItem)

    .filter((item) => item && !known.has(item.toLocaleLowerCase()) && known.add(item.toLocaleLowerCase()));

};



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

  let setupStage = 'validating the request';

  try {

    const { action = 'create', packVersionId, packId, packVersion, character, campaignName, setup } = await req.json();

    const title = typeof campaignName === 'string' ? campaignName.trim() : '';

    const openingScenePrompt = typeof setup?.openingScenePrompt === 'string' ? setup.openingScenePrompt.trim() : '';

    if (openingScenePrompt.length > 1200) throw new Error('The opening scene prompt must be 1,200 characters or fewer.');

    if (!character?.name) throw new Error('Invalid character data.');

    if (action !== 'identify' && (title.length < 3 || title.length > 80)) throw new Error('Campaign name must be between 3 and 80 characters.');

    service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    const backgroundJobId = req.headers.get('x-background-job-id');

    if (action === 'create' && backgroundJobId) {

      const existingCampaign = await service.from('campaigns').select('id').eq('owner_id', auth.user.id).eq('background_job_id', backgroundJobId).maybeSingle();

      if (existingCampaign.data) return Response.json({ campaignId: existingCampaign.data.id }, { headers: corsHeaders });

    }

    setupStage = 'loading the saved world';

    let version: any = null;

    if (typeof packVersionId === 'string' && packVersionId) {

      const found = await service.from('world_pack_versions').select('*').eq('id', packVersionId).eq('status', 'ready').maybeSingle();

      if (found.error) throw found.error;

      version = found.data;

    } else if (typeof packId === 'string' && Number.isFinite(Number(packVersion))) {

      const slug = safeSlug(packId);

      const rows = await service.from('world_packs').select('id,owner_id,is_system').eq('slug', slug);

      if (rows.error) throw rows.error;

      const accessible = (rows.data || []).find((row: any) => row.is_system || row.owner_id === auth.user.id);

      if (accessible) {

        const found = await service.from('world_pack_versions').select('*').eq('pack_id', accessible.id).eq('version', Number(packVersion)).eq('status', 'ready').maybeSingle();

        if (found.error) throw found.error;

        version = found.data;

      }

    }

    if (!version) throw new Error('This world version could not be found. Refresh the Worlds page and try again.');

    const packAccess = await service.from('world_packs').select('owner_id,is_system').eq('id', version.pack_id).single();

    if (packAccess.error) throw packAccess.error;

    if (!packAccess.data.is_system && packAccess.data.owner_id !== auth.user.id) throw new Error('You do not have access to this world.');

    const { economicProfiles: _retiredProfiles, factionEconomicProfiles: _retiredFactionProfiles, ...packContent } = version.content || {};
    let pack = packContent;

    if (action === 'identify') return Response.json({ candidates: await findCharacterIdentities(pack, String(character.name), service, auth.user.id) }, { headers: corsHeaders });

    if (!pack?.metadata?.title || !Array.isArray(pack.locations) || !pack.locations.length) throw new Error('The saved world data is invalid.');


    if (pack.worldContext) {

      setupStage = 'preparing the campaign cast and opening';

      if (!backgroundJobId) throw new Error('Create this campaign through the background job queue.');

      const prepared = await prepareCampaign(service, auth.user.id, backgroundJobId, pack, character, false, openingScenePrompt);

      if (prepared.pending) return Response.json({ pending: true, stage: 'preparing_campaign' }, { status: 202, headers: corsHeaders });

      pack = prepared.pack;

      if (character.identityMode === 'existing') {

        if (!prepared.character) throw new Error('The existing character’s details were not prepared. Please start a new campaign.');

        Object.assign(character, prepared.character);

      }

    }

    setupStage = 'creating the campaign';

    const createdCampaign = await service.from('campaigns').insert({ owner_id: auth.user.id, pack_version_id: version.id, title, current_chapter_title: pack.openingScenario?.chapterLabel || 'Chapter I', setup_preferences: { ...(setup || {}), preparedWorld: pack.worldContext ? pack : undefined }, background_job_id: backgroundJobId || null }).select().single();

    if (createdCampaign.error) throw createdCampaign.error;

    const campaign = createdCampaign.data;

    createdCampaignId = campaign.id;

    setupStage = 'initializing world locations';

    const duplicateLocationIds = pack.locations.map((location: any) => String(location.id || '').trim()).filter((id: string, index: number, all: string[]) => id && all.indexOf(id) !== index);

    if (duplicateLocationIds.length) throw new Error(`The world contains duplicate location IDs: ${[...new Set(duplicateLocationIds)].slice(0, 5).join(', ')}.`);

    const locationRows = pack.locations.map((location: any, index: number) => ({ campaign_id: campaign.id, pack_location_id: location.id, name: location.name, location_type: index === 0 ? 'settlement' : 'landmark', public_description: location.description }));

    const createdLocations = await service.from('locations').insert(locationRows).select();

    if (createdLocations.error) throw createdLocations.error;

    const locationByPackId = new Map(createdLocations.data.map((location: any) => [location.pack_location_id, location]));

    const opening = pack.openingScenario;

    const firstLocation = locationByPackId.get(opening?.startLocationId) || createdLocations.data[0];

    const inventory = prepareStartingInventory(pack, character, opening);

    const memories = opening?.memories || ['A badly wounded male courier handed you a sealed letter before collapsing at your feet.', 'The courier warned you to trust no one wearing the silver ash.'];

    const threads = opening?.unresolvedThreads || ['Why did the courier choose you?', 'Who wears the silver ash?'];

    const sceneFacts = opening?.sceneFacts || ['The courier has already handed over the letter.', 'The courier is badly wounded, conscious, and down at your feet.', 'Oren Voss is watching from across the hall.'];

    const summary = opening ? opening.narration.replaceAll('{name}', character.name).slice(0, 1000) : 'Inside Gloamspire during the succession convocation, a badly wounded courier handed you a rain-soaked sealed letter, warned you about the silver ash, and collapsed at your feet while Oren Voss watched.';

    const initialState = { locationId: firstLocation.id, health: 100, resolve: 88, condition: 'alive', conflict: null, inventory, relationships: opening?.relationships || {}, memories, unresolvedThreads: threads, summary, sceneFacts, ...(opening?.calendar ? { campaignDate: { calendarName: opening.calendar.name, year: opening.calendar.year, day: opening.calendar.day, segment: opening.calendar.segment } } : {}) };

    setupStage = 'initializing the player character';

    const playerEntity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: character.name, public_description: character.background?.description || '' }).select().single();

    if (playerEntity.error) throw playerEntity.error;

    const playerCharacter = await service.from('characters').insert({ campaign_id: campaign.id, entity_id: playerEntity.data.id, name: character.name, pronouns: character.pronouns, background: character.background, traits: { player: true, strength: character.strength, weakness: character.weakness, motivation: character.motivation, attributes: normalizeCharacterAttributes(character.attributes) }, status: initialState }).select().single();

    if (playerCharacter.error) throw playerCharacter.error;

    const startingPoliticalStatuses: any[] = [];

    const heldTitle = String(character.background?.name || '').trim();

    if (heldTitle) startingPoliticalStatuses.push({ campaign_id: campaign.id, entity_id: playerEntity.data.id, title: heldTitle, kind: 'held', status: 'held', reason: 'Established by the playable character background.' });

    const motivationText = `${character.motivation?.name || ''} ${character.motivation?.description || ''}`;

    if (/\b(crown|king|queen|throne|sovereign)\b/i.test(motivationText)) startingPoliticalStatuses.push({ campaign_id: campaign.id, entity_id: playerEntity.data.id, title: 'Sovereign', kind: 'claim', status: 'contemplated', reason: 'The playable character may pursue sovereignty, but has not declared a claim.' });

    if (startingPoliticalStatuses.length) {

      const politicalWrite = await service.from('campaign_character_titles').insert(startingPoliticalStatuses);

      if (politicalWrite.error) throw politicalWrite.error;

    }

    const playerTruth = await service.from('engine_authoritative_entity_state').insert({ entity_id: playerEntity.data.id, exact_location_id: firstLocation.id, status: initialState });

    if (playerTruth.error) throw playerTruth.error;

    setupStage = 'initializing story memory';

    if (memories.length || sceneFacts.length) await service.from('campaign_memories').upsert([...memories, ...sceneFacts].map((fact: string) => ({ campaign_id: campaign.id, memory_type: 'fact', fact, importance: 9, tags: ['opening'] })), { onConflict: 'campaign_id,fact', ignoreDuplicates: true });

    if (threads.length) await service.from('plot_threads').upsert(threads.map((thread: string) => ({ campaign_id: campaign.id, title: thread, status: 'open', importance: 7 })), { onConflict: 'campaign_id,title', ignoreDuplicates: true });

    if (opening?.calendar) await service.from('campaign_clock').insert({ campaign_id: campaign.id, calendar_name: opening.calendar.name, year_label: opening.calendar.year, day_number: opening.calendar.day, segment: opening.calendar.segment });

    setupStage = 'initializing scheduled world events';

    if (pack.worldEvents?.length) { const events = await service.from('engine_scheduled_campaign_events').insert(pack.worldEvents.map((event: any) => ({ campaign_id: campaign.id, event_key: event.id, name: event.name, description: event.description, earliest_day: event.earliestDay, latest_day: event.latestDay, conditions: event.conditions }))); if (events.error) throw events.error; }

    setupStage = 'initializing preventable canon events';

    if (pack.canonEvents?.length) {
      const canonEvents = await service.from('campaign_canon_events').insert(pack.canonEvents.map((event:any) => ({
        campaign_id:campaign.id,event_key:String(event.eventKey).trim(),name:String(event.name).trim(),description:String(event.description).trim(),
        canonical_timing:String(event.canonicalTiming).trim(),sequence_index:Number(event.sequenceIndex||0),participants:event.participants||[],
        preconditions:event.preconditions||[],expected_outcomes:event.expectedOutcomes||[],prevention_conditions:event.preventionConditions||[],
        knowledge_after:event.knowledgeAfter||[],status:event.initialStatus==='completed'?'completed':'pending',source_basis:String(event.sourceBasis).trim(),
        source_confidence:event.sourceConfidence||'medium',
      })));
      if(canonEvents.error) throw canonEvents.error;
    }

    const entityByPackId = new Map<string, any>();

    entityByPackId.set('player', playerEntity.data);

    setupStage = 'initializing world characters';

    const duplicateNpcNames = (pack.npcs || []).map((npc: any) => String(npc.name || '').trim().toLocaleLowerCase()).filter((name: string, index: number, all: string[]) => name && all.indexOf(name) !== index);

    if (duplicateNpcNames.length) throw new Error(`The world contains duplicate character names: ${[...new Set(duplicateNpcNames)].slice(0, 5).join(', ')}.`);

    for (let index = 0; index < (pack.npcs || []).length; index++) {

      const npc = pack.npcs[index];

      if (String(npc.name).trim().toLocaleLowerCase() === String(character.name).trim().toLocaleLowerCase()) {

        entityByPackId.set(npc.id, playerEntity.data);

        continue;

      }

      const entity = await service.from('world_entities').insert({ campaign_id: campaign.id, entity_type: 'character', canonical_name: npc.name, public_description: npc.description }).select().single();

      if (entity.error) throw entity.error;

      entityByPackId.set(npc.id, entity.data);

      const personality = pack.characterProfiles?.find((profile: any) => profile.npcId === npc.id) || null;

      const generatedAttributes = pack.characterAttributes?.find((entry: any) => entry.npcId === npc.id)?.attributes;
      const npcCharacter = await service.from('characters').insert({ campaign_id: campaign.id, entity_id: entity.data.id, name: npc.name, background: { name: npc.description }, traits: { player: false, personality, attributes: normalizeCharacterAttributes(generatedAttributes) }, status: { active: true, health: 100 } });

      if (npcCharacter.error) throw npcCharacter.error;

      const openingText = `${opening?.narration || ''} ${(opening?.sceneFacts || []).join(' ')}`.toLowerCase();

      const seenInOpening = openingText.includes(npc.name.toLowerCase());

      const profileLocation = personality?.startingLocation ? locationByPackId.get(personality.startingLocation.locationId) : null;

      const believed = seenInOpening ? firstLocation : profileLocation || null;

      const worldDate = seenInOpening && opening?.calendar ? `${opening.calendar.year} · Day ${opening.calendar.day} · ${opening.calendar.segment}` : null;

      const playerKnowledge = await service.from('player_knowledge').insert({ campaign_id: campaign.id, viewer_id: auth.user.id, entity_id: entity.data.id, known_status: { label: 'Alive', lastSeenWorldDate: worldDate }, believed_location_id: believed?.id || null, location_precision: seenInOpening ? 'exact' : profileLocation ? 'settlement' : 'unknown', confidence: seenInOpening ? 'confirmed' : personality?.startingLocation?.confidence || 'unknown', last_confirmed_at: seenInOpening ? new Date().toISOString() : null, source_summary: seenInOpening ? 'Seen during the opening scene' : personality?.startingLocation?.reason || 'Not yet encountered during this campaign', resource_estimates: {} });

      if (playerKnowledge.error) throw playerKnowledge.error;

      const npcTruth = await service.from('engine_authoritative_entity_state').insert({ entity_id: entity.data.id, exact_location_id: believed?.id, status: { active: true }, private_goals: {} });

      if (npcTruth.error) throw npcTruth.error;

      const startingRelationship = Number(opening?.relationships?.[npc.name] ?? 0);

      const relationship = await service.from('campaign_relationships').insert({ campaign_id: campaign.id, entity_id: entity.data.id, entity_name: npc.name, score: Math.max(-100, Math.min(100, startingRelationship)), initialization_checked_at: new Date().toISOString(), initialization_version: 2 });

      if (relationship.error) throw relationship.error;

      const startingRoles = (opening?.relationshipRoles || []).filter((role: any) => String(role.entityName || '').toLowerCase() === String(npc.name).toLowerCase());

      if (startingRoles.length) { const roleWrite = await service.from('campaign_relationship_roles').insert(startingRoles.map((role: any) => ({ campaign_id:campaign.id,entity_id:entity.data.id,entity_name:npc.name,relationship_type:String(role.relationshipType).trim().toLowerCase(),status:'active',private:!!role.private,started_reason:role.reason }))); if (roleWrite.error) throw roleWrite.error; }

    }

    setupStage = 'initializing character connections';

    for (const connection of opening?.characterConnections || []) {

      const source = entityByPackId.get(connection.sourceId);

      const target = entityByPackId.get(connection.targetId);

      if (!source || !target) throw new Error('Starting relationship references a missing character.');

      if (source.id === target.id) continue;

      const write = await service.from('campaign_character_connections').upsert({

        campaign_id: campaign.id, source_entity_id: source.id, target_entity_id: target.id,

        source_name: source.canonical_name, target_name: target.canonical_name,

        relationship_type: connection.relationshipType.trim().toLowerCase(),
        ...(Number.isInteger(connection.sentimentScore) ? {sentiment_score:connection.sentimentScore} : {}),

        status: connection.status || 'active', private: !!connection.private, reason: connection.reason,

      }, { onConflict: 'campaign_id,source_entity_id,target_entity_id,relationship_type' });

      if (write.error) throw write.error;

    }

    setupStage = 'initializing world secrets';

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


    console.error('create-campaign failed', { setupStage, error });

    const detail = error instanceof Error ? error.message : 'Campaign could not be created.';

    return Response.json({ error: `Campaign setup failed while ${setupStage}: ${detail}` }, { status: 400, headers: corsHeaders });

  }

});

