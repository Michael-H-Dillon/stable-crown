import { PLAYER_AGENCY_RULE } from '../supabase/functions/_shared/player-agency';

import { responseTokenCost } from '../supabase/functions/_shared/ai-cost';

import test from 'node:test';

import assert from 'node:assert/strict';

import { personaliseCampaignWorld } from '../supabase/functions/_shared/campaign-world';

import { defaultWorld } from '../src/defaultWorld';

import { validatePack } from '../src/packSchema';

import { readFileSync } from 'node:fs';

import { runInNewContext } from 'node:vm';

import ts from 'typescript';

import { detailedWorldSchema } from '../supabase/functions/_shared/campaign-schema';

import { responseText, responseFailure } from '../supabase/functions/_shared/world-response';
import { withExplicitPromptCache } from '../supabase/functions/_shared/prompt-cache';
import { characterAttributesSchema, characterSkillsSchema, normalizeCharacterAttributes, normalizeCharacterSkills, randomizedCharacterAttributes } from '../supabase/functions/_shared/character-attributes';

const assessCanonicalCharacterAttributes = async () => ({
  attributes: { strength: 8, agility: 7, endurance: 7, intelligence: 7, perception: 6, willpower: 6, presence: 8 },
  skills: [{name:'Swordsmanship',rating:7}],
  basis: 'Test assessment.', sources: ['https://example.com/character'],
});



const base = {

  locations: [{ id: 'winterfell', name: 'Winterfell', description: 'A northern stronghold.' }],

  npcs: [{ id: 'tyrion', name: 'Tyrion Lannister', description: 'A member of House Lannister.' }],

  aiGuidance: [],

};

const additions = {

  canonicalPlayerName: 'Tyrion Lannister', locations: [],

  npcs: [{ id: 'jon', name: 'Jon Snow', description: 'A young man at Winterfell.' }],

  characterProfiles: [{ npcId: 'jon', startingLocation: { locationId: 'winterfell' } }],

  openingScenario: { startLocationId: 'winterfell', narration: 'You stand in the courtyard as Jon approaches.', relationships: [{ name: 'Jon Snow', score: 10 }, { name: 'Tyrion Lannister', score: 20 }], relationshipRoles: [{ entityName: 'Tyrion Lannister', relationshipType: 'self' }] },

  secretSystems: [{ initialAwareness: [{ entityId: 'tyrion', level: 'knows', suspicion: 100 }] }],

};

test('canon identity becomes the player, with no duplicate NPC or self-relationship', () => {

  const world = personaliseCampaignWorld(base, additions, '  TYRION LANNISTER  ');

  assert.deepEqual(world.npcs.map((npc: any) => npc.name), ['Jon Snow']);

  assert.deepEqual(world.openingScenario.relationships, { 'Jon Snow': 10 });

  assert.equal(world.openingScenario.relationshipRoles.length, 0);

  assert.equal(world.secretSystems[0].initialAwareness[0].entityId, 'player');

});

test('a second campaign can reuse the same base with a different player', () => {

  const before = JSON.stringify(base);

  personaliseCampaignWorld(base, additions, 'Tyrion Lannister');

  const other = personaliseCampaignWorld(base, { ...additions, canonicalPlayerName: '', secretSystems: [] }, 'Mara');

  assert.ok(other.npcs.some((npc: any) => npc.name === 'Tyrion Lannister'));

  assert.equal(JSON.stringify(base), before);

  assert.equal('openingScenario' in base, false);

});

test('invalid campaign references cannot be saved', () => {

  assert.throws(() => personaliseCampaignWorld(base, { ...additions, openingScenario: { ...additions.openingScenario, startLocationId: 'missing' } }, 'Tyrion Lannister'), /missing location/);

});



test('campaign relationships preserve NPC ties and remap the canonical player', () => {

  const connection = { sourceId: 'jon', targetId: 'sam', relationshipType: 'friend', status: 'active', private: false, reason: 'Established friendship.' };

  const prepared = { ...additions, npcs: [...additions.npcs, { id: 'sam', name: 'Samwell Tarly', description: 'A friend.' }], openingScenario: { ...additions.openingScenario, characterConnections: [connection, { ...connection, targetId: 'tyrion' }, { ...connection, sourceId: 'tyrion', targetId: 'player' }] } };

  const world = personaliseCampaignWorld(base, prepared, 'Tyrion Lannister');

  assert.deepEqual(world.openingScenario.characterConnections, [connection, { ...connection, targetId: 'player' }]);

  assert.equal(prepared.openingScenario.characterConnections[1].targetId, 'tyrion');

  assert.throws(() => personaliseCampaignWorld(base, { ...prepared, openingScenario: { ...prepared.openingScenario, characterConnections: [{ ...connection, targetId: 'missing' }] } }, 'Tyrion Lannister'), /relationship references a missing character/);

});

test('world foundations validate without a cast or player opening', () => {

  const foundation = { ...defaultWorld, npcs: [], characterProfiles: [], secretSystems: [], openingScenario: undefined, worldContext: { kind: 'existing', era: 'Before the succession', region: '', genre: '', description: '' } };

  const result = validatePack(foundation);

  assert.equal(result.valid, true, result.errors.join('; '));

  assert.equal(result.pack?.worldContext?.era, 'Before the succession');

});



for (const uploadedWorld of [false, true]) test(`campaign preparation selects settings, records cost and resumes (upload=${uploadedWorld})`, async () => {

  let checkpoint: any = {};

  let posts = 0;

  const costEntries: any[] = [];

  const service = { from() {

    let update: any;

    const query: any = {

      upsert: async (entry: any) => { costEntries.push(entry); return { error: null }; }, select() { return query; }, eq() { return query; },

      single: async () => ({ data: { checkpoint } }),

      update(value: any) { update = value; return query; },

      then(resolve: any) { checkpoint = structuredClone(update.checkpoint); return Promise.resolve({}).then(resolve); },

    };

    return query;

  } };

  const code = ts.transpileModule(readFileSync('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {

    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },

  }).outputText;

  const exports: any = {};

  runInNewContext(code, {

    exports, structuredClone, AbortSignal, console,

    Deno: { env: { get: () => undefined } },

    require: (name: string) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema, characterSkillsSchema, normalizeCharacterAttributes, normalizeCharacterSkills, randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld } : { responseText, responseFailure },

    fetch: async (_url: string, init: any) => {

      if (init.method === 'POST') {

        posts++;

        const request = JSON.parse(init.body);

        assert.ok(request.input[0].content[0].text.startsWith(PLAYER_AGENCY_RULE));

        assert.equal(request.input[0].content[0].prompt_cache_breakpoint.mode, 'explicit');

        assert.equal(request.input[1].content[0].prompt_cache_breakpoint.mode, 'explicit');

        assert.equal(request.model, 'gpt-5.6-luna');

        assert.equal(request.reasoning.effort, 'high');

        assert.equal(JSON.parse(request.input[2].content).openingSceneRequest, 'Begin beside the wounded king after the hunt.');

        assert.equal(request.max_output_tokens, 128000);

        const properties = request.text.format.schema.properties;

        assert.equal(properties.npcs.maxItems, 0);

        assert.equal(properties.locations.maxItems, 0);

        assert.equal(properties.worldEvents.maxItems, 0);

        assert.equal(properties.secretSystems.maxItems, 0);

        assert.equal(properties.characterProfiles.maxItems, 6);

        return Response.json({ id: 'campaign-response', status: 'queued' });

      }

      if (init.method === 'DELETE') return Response.json({ deleted: true });

      return Response.json({ status: 'completed', output_text: JSON.stringify(additions), usage: { output_tokens: 1000 } });

    },

  });

  const first = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' }, uploadedWorld, '  Begin beside the wounded king after the hunt.  ');

  assert.equal(first.pending, true);

  assert.equal(checkpoint.campaignResponseId, 'campaign-response');

  const second = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });

  assert.equal(second.pack.npcs.length, 1);

  assert.equal(checkpoint.preparedWorld.openingScenario.narration, additions.openingScenario.narration);

  const resumed = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });

  assert.equal(resumed.pack.npcs.length, 1);

  assert.equal(posts, 1);

  assert.equal(costEntries.length, 1);

  assert.equal(costEntries[0].operation, 'create_campaign');

  assert.equal(costEntries[0].reference_id, 'job');

  assert.equal(costEntries[0].cost_usd, .0012);

});





test('existing character preparation supplies established details and survives resume', async () => {

  const detail = { id: 'established', name: 'Established trait', description: 'Supported by the setting at this date.' };

  const canonical = { name: 'Tyrion Lannister', pronouns: 'he/him', background: detail, strength: detail, weakness: detail, motivation: detail };

  let checkpoint: any = { campaignResponseId: 'ready-response' };

  const service = { from() {

    const query: any = {

      upsert: async () => ({ error: null }), select() { return query; }, eq() { return query; },

      single: async () => ({ data: { checkpoint } }),

      update(value: any) { checkpoint = structuredClone(value.checkpoint); return query; },

      then(resolve: any) { return Promise.resolve({}).then(resolve); },

    };

    return query;

  } };

  const code = ts.transpileModule(readFileSync('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {

    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },

  }).outputText;

  const exports: any = {};

  runInNewContext(code, {

    exports, structuredClone, AbortSignal, console,

    Deno: { env: { get: () => undefined } },

    require: (name: string) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema, characterSkillsSchema, normalizeCharacterAttributes, normalizeCharacterSkills, randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld } : { responseText, responseFailure },

    fetch: async (_url: string, init: any) => init.method === 'DELETE' ? Response.json({ deleted: true }) : Response.json({ status: 'completed', output_text: JSON.stringify({ ...additions, preparedCharacter: canonical }) }),

  });

  const setting = { ...base, worldContext: { kind: 'existing' } };

  const selection = { name: 'Tyrion Lannister (the Imp)', description: 'The younger son of Tywin Lannister.' };

  const request = { name: 'Tyrion', identityMode: 'existing', identitySelection: selection };

  const result = await exports.prepareCampaign(service, 'owner', 'job', setting, request);

  assert.equal(result.character.name, selection.name);

  assert.equal(result.character.background.description, detail.description);

  assert.equal(result.pack.npcs.some((npc: any) => npc.name === canonical.name), false);

  const resumed = await exports.prepareCampaign(service, 'owner', 'job', setting, request);

  assert.equal(resumed.character.name, selection.name);

  assert.equal(resumed.character.identitySelection.description, selection.description);

  assert.equal(resumed.character.identityMode, 'existing');

});





test('a stuck provider queue is cancelled before one bounded retry', async () => {

  let checkpoint: any = { campaignResponseId: 'stuck', campaignResponseStartedAt: Date.now() - 600000 };

  let cancellations = 0;

  const service = { from() {

    const query: any = { upsert: async () => ({ error: null }), select() { return query; }, eq() { return query; }, single: async () => ({ data: { checkpoint } }),

      update(value: any) { checkpoint = structuredClone(value.checkpoint); return query; },

      then(resolve: any) { return Promise.resolve({}).then(resolve); } };

    return query;

  } };

  const exports: any = {};

  runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {

    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },

  }).outputText, {

    exports, structuredClone, AbortSignal, console, Deno: { env: { get: () => undefined } },

    require: (name: string) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema, characterSkillsSchema, normalizeCharacterAttributes, normalizeCharacterSkills, randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld } : { responseText, responseFailure },

    fetch: async (url: string) => { if (url.endsWith('/cancel')) { cancellations++; return Response.json({ status: 'cancelled' }); } return Response.json({ status: 'queued' }); },

  });

  assert.equal((await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' })).pending, true);

  assert.equal(cancellations, 1);

  assert.equal(checkpoint.campaignResponseId, undefined);

  assert.equal(checkpoint.campaignQueueRetries, 1);

  checkpoint.campaignResponseId = 'stuck-again';

  checkpoint.campaignResponseStartedAt = Date.now() - 600000;

  await assert.rejects(exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' }), /after a retry/);

  assert.equal(cancellations, 2);

  await assert.rejects(exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' }), /after a retry/);

  assert.equal(cancellations, 2);

});





test('populated imports keep their cast profiles, events, secrets and NPC connections', () => {

  const profile = { npcId: 'jon', values: ['Duty'] };

  const imported = { ...base, npcs: [...base.npcs, ...additions.npcs], characterProfiles: [profile],

    worldEvents: [{ id: 'event', name: 'Existing event' }],

    secretSystems: [{ id: 'secret', initialAwareness: [{ entityId: 'jon', level: 'knows', suspicion: 100 }, { entityId: 'player', level: 'knows', suspicion: 100 }] }],

    openingScenario: { ...additions.openingScenario, characterConnections: [{ sourceId: 'jon', targetId: 'tyrion', relationshipType: 'ally', reason: 'An established tie.' }] },

  };

  const before = JSON.stringify(imported);

  const world = personaliseCampaignWorld(imported, { ...additions, npcs: [], characterProfiles: [{ npcId: 'jon', values: ['Replacement'] }], worldEvents: [], secretSystems: [] }, 'Tyrion Lannister');

  assert.deepEqual(world.characterProfiles, [profile]);

  assert.equal(world.worldEvents[0].name, 'Existing event');

  assert.equal(world.secretSystems[0].initialAwareness.length, 1);

  assert.equal(world.secretSystems[0].initialAwareness[0].entityId, 'jon');

  assert.equal(world.openingScenario.characterConnections[0].targetId, 'player');

  assert.equal(JSON.stringify(imported), before);

});

