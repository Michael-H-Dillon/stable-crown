import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('an already-assessed legacy character is saved once and needs no lookup next turn', async () => {
  const source = readFileSync('supabase/functions/resolve-turn/index.ts', 'utf8');
  const start = source.indexOf('    const unassessedCanonCharacters =');
  const end = source.indexOf('    const activeSceneCharacters =', start);
  assert.ok(start > 0 && end > start);
  const api: any = {};
  const database: any = { id:'player-id', campaign_id:'campaign-id', name:'Test character',
    canon_status:'canonical', attributes_individually_assessed:true, attributes_assessment_version:0,
    traits:{attributes:{strength:8,willpower:6},player:true} };
  let lookups = 0;
  const service = { from: () => {
    let values: any;
    const filters: Array<[string, any]> = [];
    const query: any = {
      update: (next: any) => { values = next; return query; },
      eq: (key: string, value: any) => { filters.push([key,value]); return query; },
      then: (resolve: any) => {
        if (filters.every(([key,value]) => database[key] === value)) Object.assign(database, structuredClone(values));
        return Promise.resolve({error:null}).then(resolve);
      },
    };
    return query;
  } };
  const assessCanonicalCharacterAttributes = async () => {
    lookups++;
    return {attributes:{strength:8,willpower:7},skills:[{name:'Swordsmanship',rating:7}],basis:'Verified',sources:[]};
  };
  const wrapper = `export async function assess(player:any) { ${source.slice(start,end)} }`;
  runInNewContext(ts.transpileModule(wrapper, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports:api, service, assessCanonicalCharacterAttributes, activeSceneCharacterRows:[],
    userData:{user:{id:'owner'}},campaignId:'campaign-id',storedPack:{},campaignClock:{},prior:{},
  });
  await api.assess(structuredClone(database));
  assert.equal(database.attributes_assessment_version,2);
  assert.equal(database.traits.attributes.willpower,7);
  assert.equal(database.traits.skills[0].rating,7);
  await api.assess(structuredClone(database));
  assert.equal(lookups,1);
});
