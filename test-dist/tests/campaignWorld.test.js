"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const player_agency_1 = require("../supabase/functions/_shared/player-agency");
const ai_cost_1 = require("../supabase/functions/_shared/ai-cost");
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const campaign_world_1 = require("../supabase/functions/_shared/campaign-world");
const defaultWorld_1 = require("../src/defaultWorld");
const packSchema_1 = require("../src/packSchema");
const node_fs_1 = require("node:fs");
const node_vm_1 = require("node:vm");
const typescript_1 = __importDefault(require("typescript"));
const campaign_schema_1 = require("../supabase/functions/_shared/campaign-schema");
const world_response_1 = require("../supabase/functions/_shared/world-response");
const prompt_cache_1 = require("../supabase/functions/_shared/prompt-cache");
const character_attributes_1 = require("../supabase/functions/_shared/character-attributes");
const assessCanonicalCharacterAttributes = async () => ({
    attributes: { strength: 8, agility: 7, endurance: 7, intelligence: 7, perception: 6, willpower: 6, presence: 8 },
    skills: [{ name: 'Swordsmanship', rating: 7 }],
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
(0, node_test_1.default)('canon identity becomes the player, with no duplicate NPC or self-relationship', () => {
    const world = (0, campaign_world_1.personaliseCampaignWorld)(base, additions, '  TYRION LANNISTER  ');
    strict_1.default.deepEqual(world.npcs.map((npc) => npc.name), ['Jon Snow']);
    strict_1.default.deepEqual(world.openingScenario.relationships, { 'Jon Snow': 10 });
    strict_1.default.equal(world.openingScenario.relationshipRoles.length, 0);
    strict_1.default.equal(world.secretSystems[0].initialAwareness[0].entityId, 'player');
});
(0, node_test_1.default)('a second campaign can reuse the same base with a different player', () => {
    const before = JSON.stringify(base);
    (0, campaign_world_1.personaliseCampaignWorld)(base, additions, 'Tyrion Lannister');
    const other = (0, campaign_world_1.personaliseCampaignWorld)(base, { ...additions, canonicalPlayerName: '', secretSystems: [] }, 'Mara');
    strict_1.default.ok(other.npcs.some((npc) => npc.name === 'Tyrion Lannister'));
    strict_1.default.equal(JSON.stringify(base), before);
    strict_1.default.equal('openingScenario' in base, false);
});
(0, node_test_1.default)('invalid campaign references cannot be saved', () => {
    strict_1.default.throws(() => (0, campaign_world_1.personaliseCampaignWorld)(base, { ...additions, openingScenario: { ...additions.openingScenario, startLocationId: 'missing' } }, 'Tyrion Lannister'), /missing location/);
});
(0, node_test_1.default)('campaign relationships preserve NPC ties and remap the canonical player', () => {
    const connection = { sourceId: 'jon', targetId: 'sam', relationshipType: 'friend', status: 'active', private: false, reason: 'Established friendship.' };
    const prepared = { ...additions, npcs: [...additions.npcs, { id: 'sam', name: 'Samwell Tarly', description: 'A friend.' }], openingScenario: { ...additions.openingScenario, characterConnections: [connection, { ...connection, targetId: 'tyrion' }, { ...connection, sourceId: 'tyrion', targetId: 'player' }] } };
    const world = (0, campaign_world_1.personaliseCampaignWorld)(base, prepared, 'Tyrion Lannister');
    strict_1.default.deepEqual(world.openingScenario.characterConnections, [connection, { ...connection, targetId: 'player' }]);
    strict_1.default.equal(prepared.openingScenario.characterConnections[1].targetId, 'tyrion');
    strict_1.default.throws(() => (0, campaign_world_1.personaliseCampaignWorld)(base, { ...prepared, openingScenario: { ...prepared.openingScenario, characterConnections: [{ ...connection, targetId: 'missing' }] } }, 'Tyrion Lannister'), /relationship references a missing character/);
});
(0, node_test_1.default)('world foundations validate without a cast or player opening', () => {
    const foundation = { ...defaultWorld_1.defaultWorld, npcs: [], characterProfiles: [], secretSystems: [], openingScenario: undefined, worldContext: { kind: 'existing', era: 'Before the succession', region: '', genre: '', description: '' } };
    const result = (0, packSchema_1.validatePack)(foundation);
    strict_1.default.equal(result.valid, true, result.errors.join('; '));
    strict_1.default.equal(result.pack?.worldContext?.era, 'Before the succession');
});
for (const uploadedWorld of [false, true])
    (0, node_test_1.default)(`campaign preparation selects settings, records cost and resumes (upload=${uploadedWorld})`, async () => {
        let checkpoint = {};
        let posts = 0;
        const costEntries = [];
        const service = { from() {
                let update;
                const query = {
                    upsert: async (entry) => { costEntries.push(entry); return { error: null }; }, select() { return query; }, eq() { return query; },
                    single: async () => ({ data: { checkpoint } }),
                    update(value) { update = value; return query; },
                    then(resolve) { checkpoint = structuredClone(update.checkpoint); return Promise.resolve({}).then(resolve); },
                };
                return query;
            } };
        const code = typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {
            compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
        }).outputText;
        const exports = {};
        (0, node_vm_1.runInNewContext)(code, {
            exports, structuredClone, AbortSignal, console,
            Deno: { env: { get: () => undefined } },
            require: (name) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema: character_attributes_1.characterAttributesSchema, characterSkillsSchema: character_attributes_1.characterSkillsSchema, normalizeCharacterAttributes: character_attributes_1.normalizeCharacterAttributes, normalizeCharacterSkills: character_attributes_1.normalizeCharacterSkills, randomizedCharacterAttributes: character_attributes_1.randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE: player_agency_1.PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache: prompt_cache_1.withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema: campaign_schema_1.detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld: campaign_world_1.personaliseCampaignWorld } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
            fetch: async (_url, init) => {
                if (init.method === 'POST') {
                    posts++;
                    const request = JSON.parse(init.body);
                    strict_1.default.ok(request.input[0].content[0].text.startsWith(player_agency_1.PLAYER_AGENCY_RULE));
                    strict_1.default.equal(request.input[0].content[0].prompt_cache_breakpoint.mode, 'explicit');
                    strict_1.default.equal(request.input[1].content[0].prompt_cache_breakpoint.mode, 'explicit');
                    strict_1.default.equal(request.model, 'gpt-5.6-luna');
                    strict_1.default.equal(request.reasoning.effort, 'high');
                    strict_1.default.equal(JSON.parse(request.input[2].content).openingSceneRequest, 'Begin beside the wounded king after the hunt.');
                    strict_1.default.equal(request.max_output_tokens, 128000);
                    const properties = request.text.format.schema.properties;
                    strict_1.default.equal(properties.npcs.maxItems, 0);
                    strict_1.default.equal(properties.locations.maxItems, 0);
                    strict_1.default.equal(properties.worldEvents.maxItems, 0);
                    strict_1.default.equal(properties.secretSystems.maxItems, 0);
                    strict_1.default.equal(properties.characterProfiles.maxItems, 6);
                    return Response.json({ id: 'campaign-response', status: 'queued' });
                }
                if (init.method === 'DELETE')
                    return Response.json({ deleted: true });
                return Response.json({ status: 'completed', output_text: JSON.stringify(additions), usage: { output_tokens: 1000 } });
            },
        });
        const first = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' }, uploadedWorld, '  Begin beside the wounded king after the hunt.  ');
        strict_1.default.equal(first.pending, true);
        strict_1.default.equal(checkpoint.campaignResponseId, 'campaign-response');
        const second = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
        strict_1.default.equal(second.pack.npcs.length, 1);
        strict_1.default.equal(checkpoint.preparedWorld.openingScenario.narration, additions.openingScenario.narration);
        const resumed = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
        strict_1.default.equal(resumed.pack.npcs.length, 1);
        strict_1.default.equal(posts, 1);
        strict_1.default.equal(costEntries.length, 1);
        strict_1.default.equal(costEntries[0].operation, 'create_campaign');
        strict_1.default.equal(costEntries[0].reference_id, 'job');
        strict_1.default.equal(costEntries[0].cost_usd, .0012);
    });
(0, node_test_1.default)('existing character preparation supplies established details and survives resume', async () => {
    const detail = { id: 'established', name: 'Established trait', description: 'Supported by the setting at this date.' };
    const canonical = { name: 'Tyrion Lannister', pronouns: 'he/him', background: detail, strength: detail, weakness: detail, motivation: detail };
    let checkpoint = { campaignResponseId: 'ready-response' };
    const service = { from() {
            const query = {
                upsert: async () => ({ error: null }), select() { return query; }, eq() { return query; },
                single: async () => ({ data: { checkpoint } }),
                update(value) { checkpoint = structuredClone(value.checkpoint); return query; },
                then(resolve) { return Promise.resolve({}).then(resolve); },
            };
            return query;
        } };
    const code = typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    (0, node_vm_1.runInNewContext)(code, {
        exports, structuredClone, AbortSignal, console,
        Deno: { env: { get: () => undefined } },
        require: (name) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema: character_attributes_1.characterAttributesSchema, characterSkillsSchema: character_attributes_1.characterSkillsSchema, normalizeCharacterAttributes: character_attributes_1.normalizeCharacterAttributes, normalizeCharacterSkills: character_attributes_1.normalizeCharacterSkills, randomizedCharacterAttributes: character_attributes_1.randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE: player_agency_1.PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache: prompt_cache_1.withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema: campaign_schema_1.detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld: campaign_world_1.personaliseCampaignWorld } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
        fetch: async (_url, init) => init.method === 'DELETE' ? Response.json({ deleted: true }) : Response.json({ status: 'completed', output_text: JSON.stringify({ ...additions, preparedCharacter: canonical }) }),
    });
    const setting = { ...base, worldContext: { kind: 'existing' } };
    const selection = { name: 'Tyrion Lannister (the Imp)', description: 'The younger son of Tywin Lannister.' };
    const request = { name: 'Tyrion', identityMode: 'existing', identitySelection: selection };
    const result = await exports.prepareCampaign(service, 'owner', 'job', setting, request);
    strict_1.default.equal(result.character.name, selection.name);
    strict_1.default.equal(result.character.background.description, detail.description);
    strict_1.default.equal(result.pack.npcs.some((npc) => npc.name === canonical.name), false);
    const resumed = await exports.prepareCampaign(service, 'owner', 'job', setting, request);
    strict_1.default.equal(resumed.character.name, selection.name);
    strict_1.default.equal(resumed.character.identitySelection.description, selection.description);
    strict_1.default.equal(resumed.character.identityMode, 'existing');
});
(0, node_test_1.default)('a stuck provider queue is cancelled before one bounded retry', async () => {
    let checkpoint = { campaignResponseId: 'stuck', campaignResponseStartedAt: Date.now() - 600000 };
    let cancellations = 0;
    const service = { from() {
            const query = { upsert: async () => ({ error: null }), select() { return query; }, eq() { return query; }, single: async () => ({ data: { checkpoint } }),
                update(value) { checkpoint = structuredClone(value.checkpoint); return query; },
                then(resolve) { return Promise.resolve({}).then(resolve); } };
            return query;
        } };
    const exports = {};
    (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/prepare-campaign.ts', 'utf8'), {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText, {
        exports, structuredClone, AbortSignal, console, Deno: { env: { get: () => undefined } },
        require: (name) => name.includes('character-relationships') ? { reviewCharacterRelationships: async () => [] } : name.includes('character-attribute-assessment') ? { assessCanonicalCharacterAttributes } : name.includes('character-attributes') ? { characterAttributesSchema: character_attributes_1.characterAttributesSchema, characterSkillsSchema: character_attributes_1.characterSkillsSchema, normalizeCharacterAttributes: character_attributes_1.normalizeCharacterAttributes, normalizeCharacterSkills: character_attributes_1.normalizeCharacterSkills, randomizedCharacterAttributes: character_attributes_1.randomizedCharacterAttributes } : name.includes('player-agency') ? { PLAYER_AGENCY_RULE: player_agency_1.PLAYER_AGENCY_RULE } : name.includes('prompt-cache') ? { withExplicitPromptCache: prompt_cache_1.withExplicitPromptCache } : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : name.includes('campaign-schema') ? { detailedWorldSchema: campaign_schema_1.detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld: campaign_world_1.personaliseCampaignWorld } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
        fetch: async (url) => { if (url.endsWith('/cancel')) {
            cancellations++;
            return Response.json({ status: 'cancelled' });
        } return Response.json({ status: 'queued' }); },
    });
    strict_1.default.equal((await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' })).pending, true);
    strict_1.default.equal(cancellations, 1);
    strict_1.default.equal(checkpoint.campaignResponseId, undefined);
    strict_1.default.equal(checkpoint.campaignQueueRetries, 1);
    checkpoint.campaignResponseId = 'stuck-again';
    checkpoint.campaignResponseStartedAt = Date.now() - 600000;
    await strict_1.default.rejects(exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' }), /after a retry/);
    strict_1.default.equal(cancellations, 2);
    await strict_1.default.rejects(exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Mara' }), /after a retry/);
    strict_1.default.equal(cancellations, 2);
});
(0, node_test_1.default)('populated imports keep their cast profiles, events, secrets and NPC connections', () => {
    const profile = { npcId: 'jon', values: ['Duty'] };
    const imported = { ...base, npcs: [...base.npcs, ...additions.npcs], characterProfiles: [profile],
        worldEvents: [{ id: 'event', name: 'Existing event' }],
        secretSystems: [{ id: 'secret', initialAwareness: [{ entityId: 'jon', level: 'knows', suspicion: 100 }, { entityId: 'player', level: 'knows', suspicion: 100 }] }],
        openingScenario: { ...additions.openingScenario, characterConnections: [{ sourceId: 'jon', targetId: 'tyrion', relationshipType: 'ally', reason: 'An established tie.' }] },
    };
    const before = JSON.stringify(imported);
    const world = (0, campaign_world_1.personaliseCampaignWorld)(imported, { ...additions, npcs: [], characterProfiles: [{ npcId: 'jon', values: ['Replacement'] }], worldEvents: [], secretSystems: [] }, 'Tyrion Lannister');
    strict_1.default.deepEqual(world.characterProfiles, [profile]);
    strict_1.default.equal(world.worldEvents[0].name, 'Existing event');
    strict_1.default.equal(world.secretSystems[0].initialAwareness.length, 1);
    strict_1.default.equal(world.secretSystems[0].initialAwareness[0].entityId, 'jon');
    strict_1.default.equal(world.openingScenario.characterConnections[0].targetId, 'player');
    strict_1.default.equal(JSON.stringify(imported), before);
});
