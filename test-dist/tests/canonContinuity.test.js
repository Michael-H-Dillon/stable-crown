"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_vm_1 = require("node:vm");
const typescript_1 = __importDefault(require("typescript"));
const parse = (path) => {
    const source = (0, node_fs_1.readFileSync)(path, 'utf8');
    const ast = typescript_1.default.createSourceFile(path, source, typescript_1.default.ScriptTarget.Latest, true);
    strict_1.default.equal(ast.parseDiagnostics.length, 0, `${path} must parse`);
    return source;
};
(0, node_test_1.default)('player annotations are separated into action, private intent, knowledge and canon guidance', () => {
    const source = parse('supabase/functions/_shared/player-directives.ts');
    const api = {};
    (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule(source, { compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 } }).outputText, { exports: api });
    const result = api.parsePlayerDirectives('[I leave the room] (I do not want Pycelle to hear) (Renly does not know the children are illegitimate) (OOC: follow the books)');
    strict_1.default.equal(result.actions.length, 1);
    strict_1.default.equal(result.privateIntent.length, 1);
    strict_1.default.equal(result.knowledgeCorrections.length, 1);
    strict_1.default.equal(result.canonGuidance.length, 1);
});
(0, node_test_1.default)('campaign preparation creates preventable private canon trajectories', () => {
    const source = parse('supabase/functions/_shared/prepare-campaign.ts');
    strict_1.default.match(source, /canonEvents must contain 8–20/);
    strict_1.default.match(source, /expected trajectory, never plot armour or an unavoidable script/);
    strict_1.default.match(source, /generic scenario hook must never replace or contradict an established event/);
});
(0, node_test_1.default)('turn resolution uses conditional Sol planning, hidden facts and evidence-gated divergence', () => {
    const source = parse('supabase/functions/resolve-turn/index.ts');
    strict_1.default.match(source, /canonCriticalEvents\.length\?AI_MODELS\.canonPlanning/);
    strict_1.default.match(source, /reasoning: \{ effort: canonCriticalEvents\.length \? "high"/);
    strict_1.default.match(source, /String\(event\.status\|\|''\).*==='due'/);
    strict_1.default.match(source, /if\(!playerDirectives\.canonGuidance\.length\) return false/);
    strict_1.default.match(source, /engine_hidden_campaign_facts/);
    strict_1.default.match(source, /changed canon without campaign evidence/);
    strict_1.default.match(source, /Never summarize past a private interval/);
});
(0, node_test_1.default)('routine turns use the fast Luna path and priority service', () => {
    const source = parse('supabase/functions/resolve-turn/index.ts');
    strict_1.default.match(source, /OPENAI_TURN_SERVICE_TIER"\) \|\| "priority"/);
    strict_1.default.match(source, /const reasoningEffort = complexTurn \? STORY_REASONING\.complex : STORY_REASONING\.routine/);
});
(0, node_test_1.default)('canon adjudication uses bounded relevant context', () => {
    const source = parse('supabase/functions/resolve-turn/index.ts');
    strict_1.default.match(source, /reportTurnCost/);
    strict_1.default.match(source, /edgeRuntime\?\.waitUntil/);
    strict_1.default.doesNotMatch(source, /The turn exceeded its protected API budget/);
    strict_1.default.match(source, /history: relevantWorldHistory/);
    strict_1.default.match(source, /hiddenAuthoritativeFacts:relevantHiddenFacts/);
    strict_1.default.match(source, /knownEvidence: relevantSecretEvidence/);
    strict_1.default.match(source, /playerKnowledge: relevantKnowledge/);
});
(0, node_test_1.default)('normal turn context stays bounded as a campaign grows', () => {
    const source = parse('supabase/functions/resolve-turn/index.ts');
    strict_1.default.match(source, /"id,player_text,narration,chapter_number,compacted_at,created_at"[\s\S]*?\.order\("created_at", \{ ascending: false \}\)[\s\S]*?\.limit\(6\)/);
    strict_1.default.match(source, /const recentContextTurns: any\[\] = \(recent \|\| \[\]\)\.slice\(0, 6\)/);
    strict_1.default.match(source, /chapterSummaries: \[\.\.\.\(chapterSummaries \|\| \[\]\)\]\.slice\(0,1\)/);
    strict_1.default.match(source, /\.slice\(0, 3\)[\s\S]*?\.map\(\(note: any\) => note\.contextText\.slice\(0, 1000\)\)/);
    strict_1.default.match(source, /A shared settlement is not proof that every resident is in the room/);
    strict_1.default.match(source, /characterName\.length >= 2/);
    strict_1.default.match(source, /const isOpeningTurn = Number\(turnCount \|\| 0\) === 0/);
    strict_1.default.match(source, /establishedOpening: isOpeningTurn \? establishedOpening : \[\]/);
});
(0, node_test_1.default)('turn retries use a complete pre-turn checkpoint and preserve billing history', () => {
    const resolver = parse('supabase/functions/resolve-turn/index.ts');
    const migration = (0, node_fs_1.readFileSync)('supabase/migrations/202609090001_safe_turn_retries.sql', 'utf8');
    strict_1.default.match(resolver, /const NORMAL_TURN_MAX_USD = 0\.05/);
    strict_1.default.match(resolver, /capture_campaign_turn_checkpoint/);
    strict_1.default.match(resolver, /retry_checkpointed: true/);
    strict_1.default.match(migration, /This turn predates safe retry checkpoints/);
    strict_1.default.match(migration, /delete from public\.engine_authoritative_entity_state/);
    strict_1.default.match(migration, /insert into public\.engine_authoritative_entity_state/);
    strict_1.default.match(migration, /created_at>=v_turn\.created_at/);
    strict_1.default.match(migration, /delete from public\.campaign_turns where id=any\(v_removed_turn_ids\)/);
    strict_1.default.doesNotMatch(migration, /Only the latest turn can be retried/);
    strict_1.default.doesNotMatch(resolver, /Old turn checkpoints could not be pruned/);
    strict_1.default.doesNotMatch(migration, /delete from public\.credit_ledger/);
    strict_1.default.doesNotMatch(migration, /update public\.profiles set credits_balance/);
});
(0, node_test_1.default)('world ledger research can retract memories and repair canon records', () => {
    const source = parse('supabase/functions/add-campaign-context/index.ts');
    strict_1.default.match(source, /memoryCorrections/);
    strict_1.default.match(source, /canonCorrections/);
    strict_1.default.match(source, /retracted_at/);
});
