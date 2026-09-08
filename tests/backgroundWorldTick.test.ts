import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { responseTokenCost } from '../supabase/functions/_shared/ai-cost';
import { responseText, responseFailure } from '../supabase/functions/_shared/world-response';
import { PLAYER_AGENCY_RULE } from '../supabase/functions/_shared/player-agency';
import { worldTickSchema } from '../supabase/functions/_shared/world-tick-schema';

function fixture(claimed = true, providerFailure = false) {
  const writes: any[] = [];
  const calls: any[] = [];
  let claimedOnce = !claimed;
  const tick = { id:'tick',campaign_id:'campaign',turn_id:'ninth',from_day:2 };
  const service = { from(table: string) {
    let patch: any;
    const query: any = {
      select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
      update(value: any) { patch = value; writes.push({ table, ...value }); return query; },
      upsert(value: any) { writes.push({ table,...value }); return Promise.resolve({}); },
      maybeSingle: async () => {
        if (table === 'campaign_world_ticks') {
          if (claimedOnce) return {data:null};
          claimedOnce = true; return { data:tick };
        }
        return { data:{ day_number:2 } };
      },
      single: async () => ({ data:{setup_preferences:{preparedWorld:{metadata:{title:'Realm'}}}} }),
      then(resolve: any) {
        const data = table === 'campaign_turns' ? [{id:'ninth',player_text:'Kill Eddard',narration:'The attack failed. Eddard remains alive.'}]
          : table === 'engine_authoritative_entity_state' ? [{entity_id:'eddard',status:'Alive'}] : [];
        return Promise.resolve({data:patch ? null : data}).then(resolve);
      },
    }; return query;
  } };
  const api: any = {};
  runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/background-world-tick.ts','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText, {
    exports:api, AbortSignal, console:{error() {}}, Deno:{env:{get:()=>undefined}},
    require:(name: string) => name.includes('player-agency') ? {PLAYER_AGENCY_RULE} : name.includes('world-tick-schema') ? {worldTickSchema}
      : name.includes('ai-cost') ? {responseTokenCost} : name.includes('world-response') ? {responseText,responseFailure} : {reportWorldTickCost:async()=>{}},
    fetch:async (_url: any,init: any) => {
      calls.push(JSON.parse(init.body));
      if (providerFailure) throw new Error('Provider timed out');
      return Response.json({id:'response',status:'completed',usage:{input_tokens:1000,output_tokens:1000},
        output:[{type:'web_search_call'}], output_text:JSON.stringify({summary:'Off-screen activity',factionActions:[],locationChanges:[],worldEventChanges:[],privateDevelopments:[],publicDevelopments:[]})});
    },
  });
  return {api,service,writes,calls};
}

test('ticks are due on ninth, eighteenth and twenty-seventh successful turns', () => {
  const {api}=fixture();
  for(const n of [0,1,8,10,17,19]) assert.equal(api.isWorldTickDue(n),false);
  for(const n of [9,18,27]) assert.equal(api.isWorldTickDue(n),true);
});
test('worker uses saved ninth-turn outcome, Luna/high and one optional search', async () => {
  const {api,service,writes,calls}=fixture();
  await api.runBackgroundWorldTick(service,'tick','owner');
  assert.equal(calls[0].model,'gpt-5.6-luna');
  assert.equal(calls[0].reasoning.effort,'high');
  assert.equal(calls[0].max_tool_calls,1);
  assert.equal(calls[0].tools[0].type,'web_search');
  const context=JSON.parse(calls[0].input);
  assert.match(context.recentTurns[0].narration,/attack failed/);
  assert.equal(context.authoritativeState[0].status,'Alive');
  assert.ok(writes.some(row=>row.status==='completed'));
  const cost=writes.find(row=>row.table==='ai_cost_ledger');
  assert.ok(Math.abs(cost.cost_usd-.0114)<.0000001);
  await api.runBackgroundWorldTick(service,'tick','owner');
  assert.equal(calls.length,1,'duplicate worker does not repeat a paid request');
});
test('provider failure marks the tick failed without rejecting gameplay', async () => {
  const {api,service,writes}=fixture(true,true);
  await assert.doesNotReject(api.runBackgroundWorldTick(service,'tick','owner'));
  assert.ok(writes.some(row=>row.status==='failed'));
});
