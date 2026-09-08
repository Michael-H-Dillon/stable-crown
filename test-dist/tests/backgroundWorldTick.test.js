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
const ai_cost_1 = require("../supabase/functions/_shared/ai-cost");
const world_response_1 = require("../supabase/functions/_shared/world-response");
const player_agency_1 = require("../supabase/functions/_shared/player-agency");
const world_tick_schema_1 = require("../supabase/functions/_shared/world-tick-schema");
function fixture(claimed = true, providerFailure = false) {
    const writes = [];
    const calls = [];
    let claimedOnce = !claimed;
    const tick = { id: 'tick', campaign_id: 'campaign', turn_id: 'ninth', from_day: 2 };
    const service = { from(table) {
            let patch;
            const query = {
                select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
                update(value) { patch = value; writes.push({ table, ...value }); return query; },
                upsert(value) { writes.push({ table, ...value }); return Promise.resolve({}); },
                maybeSingle: async () => {
                    if (table === 'campaign_world_ticks') {
                        if (claimedOnce)
                            return { data: null };
                        claimedOnce = true;
                        return { data: tick };
                    }
                    return { data: { day_number: 2 } };
                },
                single: async () => ({ data: { setup_preferences: { preparedWorld: { metadata: { title: 'Realm' } } } } }),
                then(resolve) {
                    const data = table === 'campaign_turns' ? [{ id: 'ninth', player_text: 'Kill Eddard', narration: 'The attack failed. Eddard remains alive.' }]
                        : table === 'engine_authoritative_entity_state' ? [{ entity_id: 'eddard', status: 'Alive' }] : [];
                    return Promise.resolve({ data: patch ? null : data }).then(resolve);
                },
            };
            return query;
        } };
    const api = {};
    (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/background-world-tick.ts', 'utf8'), {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText, {
        exports: api, AbortSignal, console: { error() { } }, Deno: { env: { get: () => undefined } },
        require: (name) => name.includes('player-agency') ? { PLAYER_AGENCY_RULE: player_agency_1.PLAYER_AGENCY_RULE } : name.includes('world-tick-schema') ? { worldTickSchema: world_tick_schema_1.worldTickSchema }
            : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : name.includes('world-response') ? { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure } : { reportWorldTickCost: async () => { } },
        fetch: async (_url, init) => {
            calls.push(JSON.parse(init.body));
            if (providerFailure)
                throw new Error('Provider timed out');
            return Response.json({ id: 'response', status: 'completed', usage: { input_tokens: 1000, output_tokens: 1000 },
                output: [{ type: 'web_search_call' }], output_text: JSON.stringify({ summary: 'Off-screen activity', factionActions: [], locationChanges: [], worldEventChanges: [], privateDevelopments: [], publicDevelopments: [] }) });
        },
    });
    return { api, service, writes, calls };
}
(0, node_test_1.default)('ticks are due on ninth, eighteenth and twenty-seventh successful turns', () => {
    const { api } = fixture();
    for (const n of [0, 1, 8, 10, 17, 19])
        strict_1.default.equal(api.isWorldTickDue(n), false);
    for (const n of [9, 18, 27])
        strict_1.default.equal(api.isWorldTickDue(n), true);
});
(0, node_test_1.default)('worker uses saved ninth-turn outcome, Luna/high and one optional search', async () => {
    const { api, service, writes, calls } = fixture();
    await api.runBackgroundWorldTick(service, 'tick', 'owner');
    strict_1.default.equal(calls[0].model, 'gpt-5.6-luna');
    strict_1.default.equal(calls[0].reasoning.effort, 'high');
    strict_1.default.equal(calls[0].max_tool_calls, 1);
    strict_1.default.equal(calls[0].tools[0].type, 'web_search');
    const context = JSON.parse(calls[0].input);
    strict_1.default.match(context.recentTurns[0].narration, /attack failed/);
    strict_1.default.equal(context.authoritativeState[0].status, 'Alive');
    strict_1.default.ok(writes.some(row => row.status === 'completed'));
    const cost = writes.find(row => row.table === 'ai_cost_ledger');
    strict_1.default.ok(Math.abs(cost.cost_usd - .0114) < .0000001);
    await api.runBackgroundWorldTick(service, 'tick', 'owner');
    strict_1.default.equal(calls.length, 1, 'duplicate worker does not repeat a paid request');
});
(0, node_test_1.default)('provider failure marks the tick failed without rejecting gameplay', async () => {
    const { api, service, writes } = fixture(true, true);
    await strict_1.default.doesNotReject(api.runBackgroundWorldTick(service, 'tick', 'owner'));
    strict_1.default.ok(writes.some(row => row.status === 'failed'));
});
