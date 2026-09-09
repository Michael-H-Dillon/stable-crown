import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const parse=(path:string)=>{
  const source=readFileSync(path,'utf8');
  const ast:any=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,`${path} must parse`);
  return source;
};

test('player annotations are separated into action, private intent, knowledge and canon guidance',()=>{
  const source=parse('supabase/functions/_shared/player-directives.ts');
  const api:any={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api});
  const result=api.parsePlayerDirectives('[I leave the room] (I do not want Pycelle to hear) (Renly does not know the children are illegitimate) (OOC: follow the books)');
  assert.equal(result.actions.length,1);
  assert.equal(result.privateIntent.length,1);
  assert.equal(result.knowledgeCorrections.length,1);
  assert.equal(result.canonGuidance.length,1);
});

test('campaign preparation creates preventable private canon trajectories',()=>{
  const source=parse('supabase/functions/_shared/prepare-campaign.ts');
  assert.match(source,/canonEvents must contain 8–20/);
  assert.match(source,/expected trajectory, never plot armour or an unavoidable script/);
  assert.match(source,/generic scenario hook must never replace or contradict an established event/);
});

test('turn resolution uses conditional Sol planning, hidden facts and evidence-gated divergence',()=>{
  const source=parse('supabase/functions/resolve-turn/index.ts');
  assert.match(source,/canonCriticalEvents\.length\?AI_MODELS\.canonPlanning/);
  assert.match(source,/reasoning: \{ effort: canonCriticalEvents\.length \? "high"/);
  assert.match(source,/String\(event\.status\|\|''\).*==='due'/);
  assert.match(source,/if\(!playerDirectives\.canonGuidance\.length\) return false/);
  assert.match(source,/engine_hidden_campaign_facts/);
  assert.match(source,/changed canon without campaign evidence/);
  assert.match(source,/Never summarize past a private interval/);
});

test('routine turns use the fast Luna path and priority service',()=>{
  const source=parse('supabase/functions/resolve-turn/index.ts');
  assert.match(source,/OPENAI_TURN_SERVICE_TIER"\) \|\| "priority"/);
  assert.match(source,/const reasoningEffort = complexTurn \? STORY_REASONING\.complex : STORY_REASONING\.routine/);
});

test('canon adjudication uses bounded relevant context',()=>{
  const source=parse('supabase/functions/resolve-turn/index.ts');
  assert.match(source,/reportTurnCost/);
  assert.match(source,/edgeRuntime\?\.waitUntil/);
  assert.doesNotMatch(source,/The turn exceeded its protected API budget/);
  assert.match(source,/history: relevantWorldHistory/);
  assert.match(source,/hiddenAuthoritativeFacts:relevantHiddenFacts/);
  assert.match(source,/knownEvidence: relevantSecretEvidence/);
  assert.match(source,/playerKnowledge: relevantKnowledge/);
});

test('world ledger research can retract memories and repair canon records',()=>{
  const source=parse('supabase/functions/add-campaign-context/index.ts');
  assert.match(source,/memoryCorrections/);
  assert.match(source,/canonCorrections/);
  assert.match(source,/retracted_at/);
});
