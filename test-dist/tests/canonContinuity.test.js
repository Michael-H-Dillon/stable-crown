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
(0, node_test_1.default)('world ledger research can retract memories and repair canon records', () => {
    const source = parse('supabase/functions/add-campaign-context/index.ts');
    strict_1.default.match(source, /memoryCorrections/);
    strict_1.default.match(source, /canonCorrections/);
    strict_1.default.match(source, /retracted_at/);
});
