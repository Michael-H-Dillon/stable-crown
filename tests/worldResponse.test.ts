import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canRecoverResearch, responseFailure, responseText } from '../supabase/functions/_shared/world-response';

test('only a research token limit can recover, once; never accept truncated pack JSON', () => {
  const payload = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
  assert.equal(canRecoverResearch(payload, 'researching', 0), true);
  assert.equal(canRecoverResearch(payload, 'researching', 1), false);
  assert.equal(canRecoverResearch(payload, 'building', 0), false);
  assert.equal(canRecoverResearch({ ...payload, incomplete_details: { reason: 'content_filter' } }, 'researching', 0), false);
  assert.match(responseFailure(payload, 'researching'), /response limit/);
  assert.match(responseFailure({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }, 'researching'), /content_filter/);
});

test('all output text blocks are retained', () => {
  assert.equal(responseText({ output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: 'First' }, { type: 'output_text', text: 'Second' }] }] }), 'First\nSecond');
});

test('background research resumes from incomplete response and carries costs and sources into construction', async () => {
  let handler: (request: Request) => Promise<Response>;
  let saved: any = { checkpoint: {} };
  const created: any[] = [];
  const source = { type: 'output_text', text: 'Partial brief', annotations: [{ url: 'https://example.com/source', title: 'Source' }] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table: string) {
      let patch: any;
      const query: any = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        update(value: any) { patch = value; return query; },
        maybeSingle: async () => ({ data: table === 'background_jobs' ? saved : { id: 'hold' } }),
        single: async () => ({ data: { credits_balance: 100 } }),
        then(resolve: any) { if (patch) saved = { ...saved, ...JSON.parse(JSON.stringify(patch)) }; return Promise.resolve({}).then(resolve); },
      };
      return query;
    },
  };
  const code = ts.transpileModule(readFileSync('supabase/functions/generate-world-pack/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports: {}, require: (name: string) => name.includes('supabase-js') ? { createClient: () => client } : name.includes('world-response') ? { canRecoverResearch, responseFailure, responseText } : { corsHeaders: {} },
    Deno: { serve: (value: typeof handler) => { handler = value; }, env: { get: (name: string) => name.endsWith('_MODEL') ? undefined : name === 'SUPABASE_URL' ? 'https://example.com' : 'test' } },
    Request, Response, AbortSignal, URL, console, setInterval, clearInterval,
    fetch: async (_url: string, init: any) => {
      if (init.method === 'DELETE') return Response.json({ deleted: true });
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
  const invoke = () => handler!(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer test', 'x-background-job-id': 'job' }, body: JSON.stringify({ world: 'Realm', worldContext: { kind: 'existing', era: 'Before the succession', region: '', genre: '', description: '' } }) }));
  const first = await invoke();
  assert.equal(first.status, 202, await first.text());
  assert.equal((await invoke()).status, 202);
  assert.equal(saved.checkpoint.researchRetries, 1);
  assert.equal(saved.checkpoint.researchResponseId, undefined);
  assert.equal(saved.output_tokens, 3500);
  assert.equal((await invoke()).status, 202);
  assert.equal(created[1].previous_response_id, 'response-1');
  assert.deepEqual(created[1].tools, []);
  assert.equal((await invoke()).status, 202);
  assert.equal(saved.checkpoint.researchBrief, 'Completed factual research brief.');
  assert.equal(saved.output_tokens, 4000);
  assert.equal(saved.web_search_count, 1);
  assert.equal(saved.checkpoint.sources[0].url, 'https://example.com/source');
  assert.ok(created[2].text.format.type === 'json_schema');
  assert.ok(created.every(request => request.model === 'gpt-5.6-luna'));
  assert.ok(created.slice(0, 2).every(request => request.reasoning.effort === 'medium'));
  assert.equal(created[2].reasoning.effort, 'medium');
  assert.equal(created[2].max_output_tokens, 128000);
  assert.equal(created[0].max_output_tokens, 16000);
  assert.equal(saved.max_api_cost_usd, 5);
  assert.equal(saved.checkpoint.model, 'gpt-5.6-luna');
  assert.equal(saved.checkpoint.researchModel, 'gpt-5.6-luna');
  assert.equal('openingScenario' in created[2].text.format.schema.properties, false);
  assert.equal('npcs' in created[2].text.format.schema.properties, false);
  assert.equal(created[2].text.format.schema.properties.locations.maxItems, 10);
  assert.equal(created[2].text.format.schema.properties.factions.maxItems, 10);
  assert.equal('playableCharacter' in JSON.parse(created[2].input), false);
});

test('long-running world construction remains pending without cancellation', async () => {
  let handler: any;
  let cancellations = 0;
  let saved: any = { checkpoint: { model: 'gpt-5.6-luna', researchModel: 'gpt-5.6-luna', researchBrief: 'Completed research.', packResponseId: 'old-response', packResponseIdStartedAt: '2020-01-01T00:00:00Z', packResponseIdRunningAt: '2020-01-01T00:00:01Z' } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table: string) {
      let patch: any;
      const query: any = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        update(value: any) { patch = value; return query; },
        maybeSingle: async () => ({ data: table === 'background_jobs' ? saved : { id: 'hold' } }),
        single: async () => ({ data: { credits_balance: 100 } }),
        then(resolve: any) { if (patch) saved = { ...saved, ...JSON.parse(JSON.stringify(patch)) }; return Promise.resolve({}).then(resolve); },
      }; return query;
    },
  };
  const code = ts.transpileModule(readFileSync('supabase/functions/generate-world-pack/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports: {}, require: (name: string) => name.includes('supabase-js') ? { createClient: () => client } : name.includes('world-response') ? { canRecoverResearch, responseFailure, responseText } : { corsHeaders: {} },
    Deno: { serve: (fn: any) => { handler = fn; }, env: { get: () => 'test' } },
    Request, Response, AbortSignal, URL, console, setInterval, clearInterval,
    fetch: async (url: string, init: any) => {
      if (url.endsWith('/cancel')) {
        cancellations++;
        return Response.json({ id: 'old-response', status: 'cancelled' });
      }
      assert.notEqual(init?.method, 'POST');
      return Response.json({ id: 'old-response', status: 'in_progress', created_at: 1 });
    },
  });
  const response = await handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer test', 'x-background-job-id': 'job' }, body: JSON.stringify({ world: 'Realm', worldContext: { kind: 'existing', era: 'Before succession' } }) }));
  assert.equal(cancellations, 0);
  assert.equal(response.status, 202);
  assert.match(saved.progress_message, /AI request running/);
  assert.equal(saved.checkpoint.providerStatus, 'in_progress');
});
