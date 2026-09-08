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
const world_response_1 = require("../supabase/functions/_shared/world-response");
(0, node_test_1.default)('only a research token limit can recover, once; never accept truncated pack JSON', () => {
    const payload = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
    strict_1.default.equal((0, world_response_1.canRecoverResearch)(payload, 'researching', 0), true);
    strict_1.default.equal((0, world_response_1.canRecoverResearch)(payload, 'researching', 1), false);
    strict_1.default.equal((0, world_response_1.canRecoverResearch)(payload, 'building', 0), false);
    strict_1.default.equal((0, world_response_1.canRecoverResearch)({ ...payload, incomplete_details: { reason: 'content_filter' } }, 'researching', 0), false);
    strict_1.default.match((0, world_response_1.responseFailure)(payload, 'researching'), /response limit/);
    strict_1.default.match((0, world_response_1.responseFailure)({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }, 'researching'), /content_filter/);
});
(0, node_test_1.default)('all output text blocks are retained', () => {
    strict_1.default.equal((0, world_response_1.responseText)({ output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: 'First' }, { type: 'output_text', text: 'Second' }] }] }), 'First\nSecond');
});
(0, node_test_1.default)('background research resumes from incomplete response and carries costs and sources into construction', async () => {
    let handler;
    let saved = { checkpoint: {} };
    const created = [];
    const source = { type: 'output_text', text: 'Partial brief', annotations: [{ url: 'https://example.com/source', title: 'Source' }] };
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
        from(table) {
            let patch;
            const query = {
                select() { return query; }, eq() { return query; }, in() { return query; },
                update(value) { patch = value; return query; },
                maybeSingle: async () => ({ data: table === 'background_jobs' ? saved : { id: 'hold' } }),
                single: async () => ({ data: { credits_balance: 100 } }),
                then(resolve) { if (patch)
                    saved = { ...saved, ...JSON.parse(JSON.stringify(patch)) }; return Promise.resolve({}).then(resolve); },
            };
            return query;
        },
    };
    const code = typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/generate-world-pack/index.ts', 'utf8'), {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText;
    (0, node_vm_1.runInNewContext)(code, {
        exports: {}, require: (name) => name.includes('supabase-js') ? { createClient: () => client } : name.includes('world-response') ? { canRecoverResearch: world_response_1.canRecoverResearch, responseFailure: world_response_1.responseFailure, responseText: world_response_1.responseText } : { corsHeaders: {} },
        Deno: { serve: (value) => { handler = value; }, env: { get: (name) => name.endsWith('_MODEL') ? undefined : name === 'SUPABASE_URL' ? 'https://example.com' : 'test' } },
        Request, Response, AbortSignal, URL, console, setInterval, clearInterval,
        fetch: async (_url, init) => {
            if (init.method === 'DELETE')
                return Response.json({ deleted: true });
            if (init.method === 'POST') {
                created.push(JSON.parse(init.body));
                return Response.json({ id: `response-${created.length}`, status: 'queued' });
            }
            const incomplete = _url.endsWith('response-1');
            return Response.json({ id: incomplete ? 'response-1' : 'response-2', status: incomplete ? 'incomplete' : 'completed',
                incomplete_details: incomplete ? { reason: 'max_output_tokens' } : null,
                output: incomplete ? [{ type: 'web_search_call' }, { content: [source] }] : [{ content: [{ type: 'output_text', text: 'Completed factual research brief.' }] }],
                usage: { input_tokens: 1000, output_tokens: incomplete ? 3500 : 500 },
            });
        },
    });
    const invoke = () => handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer test', 'x-background-job-id': 'job' }, body: JSON.stringify({ world: 'Realm', worldContext: { kind: 'existing', era: 'Before the succession', region: '', genre: '', description: '' } }) }));
    const first = await invoke();
    strict_1.default.equal(first.status, 202, await first.text());
    strict_1.default.equal((await invoke()).status, 202);
    strict_1.default.equal(saved.checkpoint.researchRetries, 1);
    strict_1.default.equal(saved.checkpoint.researchResponseId, undefined);
    strict_1.default.equal(saved.output_tokens, 3500);
    strict_1.default.equal((await invoke()).status, 202);
    strict_1.default.equal(created[1].previous_response_id, 'response-1');
    strict_1.default.deepEqual(created[1].tools, []);
    strict_1.default.equal((await invoke()).status, 202);
    strict_1.default.equal(saved.checkpoint.researchBrief, 'Completed factual research brief.');
    strict_1.default.equal(saved.output_tokens, 4000);
    strict_1.default.equal(saved.web_search_count, 1);
    strict_1.default.equal(saved.checkpoint.sources[0].url, 'https://example.com/source');
    strict_1.default.ok(created[2].text.format.type === 'json_schema');
    strict_1.default.ok(created.every(request => request.model === 'gpt-5.6-luna'));
    strict_1.default.ok(created.slice(0, 2).every(request => request.reasoning.effort === 'medium'));
    strict_1.default.equal(created[2].reasoning.effort, 'medium');
    strict_1.default.equal(created[2].max_output_tokens, 128000);
    strict_1.default.equal(created[0].max_output_tokens, 16000);
    strict_1.default.equal(saved.max_api_cost_usd, 5);
    strict_1.default.equal(saved.checkpoint.model, 'gpt-5.6-luna');
    strict_1.default.equal(saved.checkpoint.researchModel, 'gpt-5.6-luna');
    strict_1.default.equal('openingScenario' in created[2].text.format.schema.properties, false);
    strict_1.default.equal('npcs' in created[2].text.format.schema.properties, false);
    strict_1.default.equal(created[2].text.format.schema.properties.locations.maxItems, 10);
    strict_1.default.equal(created[2].text.format.schema.properties.factions.maxItems, 10);
    strict_1.default.equal('playableCharacter' in JSON.parse(created[2].input), false);
});
(0, node_test_1.default)('long-running world construction remains pending without cancellation', async () => {
    let handler;
    let cancellations = 0;
    let saved = { checkpoint: { model: 'gpt-5.6-luna', researchModel: 'gpt-5.6-luna', researchBrief: 'Completed research.', packResponseId: 'old-response', packResponseIdStartedAt: '2020-01-01T00:00:00Z', packResponseIdRunningAt: '2020-01-01T00:00:01Z' } };
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
        from(table) {
            let patch;
            const query = {
                select() { return query; }, eq() { return query; }, in() { return query; },
                update(value) { patch = value; return query; },
                maybeSingle: async () => ({ data: table === 'background_jobs' ? saved : { id: 'hold' } }),
                single: async () => ({ data: { credits_balance: 100 } }),
                then(resolve) { if (patch)
                    saved = { ...saved, ...JSON.parse(JSON.stringify(patch)) }; return Promise.resolve({}).then(resolve); },
            };
            return query;
        },
    };
    const code = typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/generate-world-pack/index.ts', 'utf8'), {
        compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
    }).outputText;
    (0, node_vm_1.runInNewContext)(code, {
        exports: {}, require: (name) => name.includes('supabase-js') ? { createClient: () => client } : name.includes('world-response') ? { canRecoverResearch: world_response_1.canRecoverResearch, responseFailure: world_response_1.responseFailure, responseText: world_response_1.responseText } : { corsHeaders: {} },
        Deno: { serve: (fn) => { handler = fn; }, env: { get: () => 'test' } },
        Request, Response, AbortSignal, URL, console, setInterval, clearInterval,
        fetch: async (url, init) => {
            if (url.endsWith('/cancel')) {
                cancellations++;
                return Response.json({ id: 'old-response', status: 'cancelled' });
            }
            strict_1.default.notEqual(init?.method, 'POST');
            return Response.json({ id: 'old-response', status: 'in_progress', created_at: 1 });
        },
    });
    const response = await handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer test', 'x-background-job-id': 'job' }, body: JSON.stringify({ world: 'Realm', worldContext: { kind: 'existing', era: 'Before succession' } }) }));
    strict_1.default.equal(cancellations, 0);
    strict_1.default.equal(response.status, 202);
    strict_1.default.match(saved.progress_message, /AI request running/);
    strict_1.default.equal(saved.checkpoint.providerStatus, 'in_progress');
});
