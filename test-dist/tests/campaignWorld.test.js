"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
(0, node_test_1.default)('campaign preparation polls once, checkpoints the result, and reuses it on resume', async () => {
    let checkpoint = {};
    let posts = 0;
    const service = { from() {
            let update;
            const query = {
                select() { return query; }, eq() { return query; },
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
        require: (name) => name.includes('campaign-schema') ? { detailedWorldSchema: campaign_schema_1.detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld: campaign_world_1.personaliseCampaignWorld } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
        fetch: async (_url, init) => {
            if (init.method === 'POST') {
                posts++;
                return Response.json({ id: 'campaign-response', status: 'queued' });
            }
            if (init.method === 'DELETE')
                return Response.json({ deleted: true });
            return Response.json({ status: 'completed', output_text: JSON.stringify(additions), usage: { output_tokens: 1000 } });
        },
    });
    const first = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
    strict_1.default.equal(first.pending, true);
    strict_1.default.equal(checkpoint.campaignResponseId, 'campaign-response');
    const second = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
    strict_1.default.equal(second.pack.npcs.length, 1);
    strict_1.default.equal(checkpoint.preparedWorld.openingScenario.narration, additions.openingScenario.narration);
    const resumed = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
    strict_1.default.equal(resumed.pack.npcs.length, 1);
    strict_1.default.equal(posts, 1);
});
(0, node_test_1.default)('existing character preparation supplies established details and survives resume', async () => {
    const detail = { id: 'established', name: 'Established trait', description: 'Supported by the setting at this date.' };
    const canonical = { name: 'Tyrion Lannister', pronouns: 'he/him', background: detail, strength: detail, weakness: detail, motivation: detail };
    let checkpoint = { campaignResponseId: 'ready-response' };
    const service = { from() {
            const query = {
                select() { return query; }, eq() { return query; },
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
        require: (name) => name.includes('campaign-schema') ? { detailedWorldSchema: campaign_schema_1.detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld: campaign_world_1.personaliseCampaignWorld } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
        fetch: async (_url, init) => init.method === 'DELETE' ? Response.json({ deleted: true }) : Response.json({ status: 'completed', output_text: JSON.stringify({ ...additions, preparedCharacter: canonical }) }),
    });
    const setting = { ...base, worldContext: { kind: 'existing' } };
    const request = { name: 'Tyrion', identityMode: 'existing' };
    const result = await exports.prepareCampaign(service, 'owner', 'job', setting, request);
    strict_1.default.equal(result.character.name, 'Tyrion Lannister');
    strict_1.default.equal(result.character.background.description, detail.description);
    strict_1.default.equal(result.pack.npcs.some((npc) => npc.name === canonical.name), false);
    const resumed = await exports.prepareCampaign(service, 'owner', 'job', setting, request);
    strict_1.default.equal(resumed.character.name, canonical.name);
    strict_1.default.equal(resumed.character.identityMode, 'existing');
});
