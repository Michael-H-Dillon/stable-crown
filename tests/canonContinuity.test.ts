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

test('normal turn context stays bounded as a campaign grows',()=>{
  const source=parse('supabase/functions/resolve-turn/index.ts');
  assert.match(source,/"id,player_text,narration,chapter_number,compacted_at,created_at"[\s\S]*?\.order\("created_at", \{ ascending: false \}\)[\s\S]*?\.limit\(6\)/);
  assert.match(source,/const recentContextTurns: any\[\] = \(recent \|\| \[\]\)\.slice\(0, 6\)/);
  assert.match(source,/chapterSummaries: \[\.\.\.\(chapterSummaries \|\| \[\]\)\]\.slice\(0,1\)/);
  assert.match(source,/\.slice\(0, 3\)[\s\S]*?\.map\(\(note: any\) => note\.contextText\.slice\(0, 1000\)\)/);
  assert.match(source,/A shared settlement is not proof that every resident is in the room/);
  assert.match(source,/characterName\.length >= 2/);
  assert.match(source,/const isOpeningTurn = Number\(turnCount \|\| 0\) === 0/);
  assert.match(source,/establishedOpening: isOpeningTurn \? establishedOpening : \[\]/);
});

test('turn retries use a complete pre-turn checkpoint and preserve billing history',()=>{
  const resolver=parse('supabase/functions/resolve-turn/index.ts');
  const migration=readFileSync('supabase/migrations/202609090001_safe_turn_retries.sql','utf8');
  assert.match(resolver,/const NORMAL_TURN_MAX_USD = 0\.05/);
  assert.match(resolver,/capture_campaign_turn_checkpoint/);
  assert.match(resolver,/retry_checkpointed: true/);
  assert.match(migration,/This turn predates safe retry checkpoints/);
  assert.match(migration,/delete from public\.engine_authoritative_entity_state/);
  assert.match(migration,/insert into public\.engine_authoritative_entity_state/);
  assert.match(migration,/created_at>=v_turn\.created_at/);
  assert.match(migration,/delete from public\.campaign_turns where id=any\(v_removed_turn_ids\)/);
  assert.doesNotMatch(migration,/Only the latest turn can be retried/);
  assert.doesNotMatch(resolver,/Old turn checkpoints could not be pruned/);
  assert.doesNotMatch(migration,/delete from public\.credit_ledger/);
  assert.doesNotMatch(migration,/update public\.profiles set credits_balance/);
});

test('world ledger research can retract memories and repair canon records',()=>{
  const source=parse('supabase/functions/add-campaign-context/index.ts');
  assert.match(source,/memoryCorrections/);
  assert.match(source,/canonCorrections/);
  assert.match(source,/retracted_at/);
});
