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

test('campaign preparation polls once, checkpoints the result, and reuses it on resume', async () => {
  let checkpoint: any = {};
  let posts = 0;
  const service = { from() {
    let update: any;
    const query: any = {
      select() { return query; }, eq() { return query; },
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
    require: (name: string) => name.includes('campaign-schema') ? { detailedWorldSchema } : name.includes('campaign-world') ? { personaliseCampaignWorld } : { responseText, responseFailure },
    fetch: async (_url: string, init: any) => {
      if (init.method === 'POST') { posts++; return Response.json({ id: 'campaign-response', status: 'queued' }); }
      if (init.method === 'DELETE') return Response.json({ deleted: true });
      return Response.json({ status: 'completed', output_text: JSON.stringify(additions), usage: { output_tokens: 1000 } });
    },
  });
  const first = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
  assert.equal(first.pending, true);
  assert.equal(checkpoint.campaignResponseId, 'campaign-response');
  const second = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
  assert.equal(second.pack.npcs.length, 1);
  assert.equal(checkpoint.preparedWorld.openingScenario.narration, additions.openingScenario.narration);
  const resumed = await exports.prepareCampaign(service, 'owner', 'job', base, { name: 'Tyrion Lannister' });
  assert.equal(resumed.pack.npcs.length, 1);
  assert.equal(posts, 1);
});
