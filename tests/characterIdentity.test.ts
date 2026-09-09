import { AI_MODELS } from '../supabase/functions/_shared/ai-config';
import { responseTokenCost } from '../supabase/functions/_shared/ai-cost';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('supabase/functions/_shared/character-identity.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api: any = {};
runInNewContext(code, { exports: api, require: () => ({ AI_MODELS, responseTokenCost }) });

test('identity choices keep distinct nicknames for shared names', () => {
  const candidates = api.parseIdentityCandidates({ candidates: [
    { name: 'Jon Umber (Greatjon)', description: 'The elder Jon Umber.' },
    { name: 'Jon Umber (Smalljon)', description: 'The younger Jon Umber.' },
  ] });
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].name, candidates[1].name);
});

test('identity choices allow one match or no match, and reject incomplete results', () => {
  assert.equal(api.parseIdentityCandidates({ candidates: [{ name: 'Loras Tyrell', description: 'A knight of House Tyrell.' }] })[0].name, 'Loras Tyrell');
  assert.equal(api.parseIdentityCandidates({ candidates: [] }).length, 0);
  assert.throws(() => api.parseIdentityCandidates({ candidates: [{ name: 'Jon Umber' }] }), /incomplete/);
  assert.throws(() => api.parseIdentityCandidates({}), /invalid/);
});


test('lookup costs include cached input and output tokens', () => {
  const cost = api.identityLookupCost({ usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 100 } }, 'gpt-5.6-terra');
  assert.ok(Math.abs(cost - 0.00248) < 1e-10);
  assert.throws(() => api.identityLookupCost({}, 'unpriced-model'), /pricing/);
});

test('a malformed paid lookup records usage before parsing and retries the same ledger reference', async () => {
  const exports: any = {};
  const writes: any[] = [];
  runInNewContext(code, {
    exports, AbortSignal, crypto: { randomUUID: () => 'lookup-reference' }, console,
    Deno: { env: { get: () => undefined } },
    require: () => ({ AI_MODELS, responseTokenCost, responseText: (payload: any) => payload.output_text }),
    fetch: async (_url: string, options: any) => { assert.equal(JSON.parse(options.body).model, 'gpt-5.6-luna'); return Response.json({ model: 'gpt-5.6-luna', usage: { input_tokens: 1000, output_tokens: 100 }, output_text: '{invalid' }); },
  });
  const service = { from(table: string) { assert.equal(table, 'ai_cost_ledger'); return { async upsert(entry: any) {
    writes.push(entry); return { error: writes.length === 1 ? { message: 'Transient error' } : null };
  } }; } };
  await assert.rejects(exports.findCharacterIdentities({ worldContext: { kind: 'existing' }, metadata: { title: 'A setting' } }, 'Renly', service, 'owner'));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].operation, 'character_lookup');
  assert.equal(writes[0].reference_id, writes[1].reference_id);
  assert.equal(writes[0].owner_id, 'owner');
  assert.equal(writes[0].cost_usd, .00032);
});
