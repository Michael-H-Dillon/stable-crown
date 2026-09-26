"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ai_config_1 = require("../supabase/functions/_shared/ai-config");
const ai_cost_1 = require("../supabase/functions/_shared/ai-cost");
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_vm_1 = require("node:vm");
const typescript_1 = __importDefault(require("typescript"));
const code = typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/character-identity.ts', 'utf8'), {
    compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
}).outputText;
const api = {};
(0, node_vm_1.runInNewContext)(code, { exports: api, require: () => ({ AI_MODELS: ai_config_1.AI_MODELS, responseTokenCost: ai_cost_1.responseTokenCost }) });
(0, node_test_1.default)('identity choices keep distinct nicknames for shared names', () => {
    const candidates = api.parseIdentityCandidates({ candidates: [
            { name: 'Jon Umber', nicknames: ['Greatjon'], titles: ['Lord of Last Hearth'], description: 'The elder Jon Umber.' },
            { name: 'Jon Umber', nicknames: ['Smalljon'], titles: [], description: 'The younger Jon Umber.' },
        ] });
    strict_1.default.equal(candidates.length, 2);
    strict_1.default.equal(candidates[0].name, 'Jon Umber');
    strict_1.default.equal(candidates[1].name, 'Jon Umber');
    strict_1.default.deepEqual(Array.from(candidates[0].nicknames), ['Greatjon']);
    strict_1.default.deepEqual(Array.from(candidates[0].titles), ['Lord of Last Hearth']);
});
(0, node_test_1.default)('identity choices allow one match or no match, and reject incomplete results', () => {
    strict_1.default.equal(api.parseIdentityCandidates({ candidates: [{ name: 'Loras Tyrell', description: 'A knight of House Tyrell.' }] })[0].name, 'Loras Tyrell');
    strict_1.default.equal(api.parseIdentityCandidates({ candidates: [] }).length, 0);
    strict_1.default.throws(() => api.parseIdentityCandidates({ candidates: [{ name: 'Jon Umber' }] }), /incomplete/);
    strict_1.default.throws(() => api.parseIdentityCandidates({}), /invalid/);
});
(0, node_test_1.default)('lookup costs include cached input and output tokens', () => {
    const cost = api.identityLookupCost({ usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 100 } }, 'gpt-5.6-terra');
    strict_1.default.ok(Math.abs(cost - 0.00248) < 1e-10);
    strict_1.default.throws(() => api.identityLookupCost({}, 'unpriced-model'), /pricing/);
});
(0, node_test_1.default)('a malformed paid lookup records usage before parsing and retries the same ledger reference', async () => {
    const exports = {};
    const writes = [];
    (0, node_vm_1.runInNewContext)(code, {
        exports, AbortSignal, crypto: { randomUUID: () => 'lookup-reference' }, console,
        Deno: { env: { get: () => undefined } },
        require: () => ({ AI_MODELS: ai_config_1.AI_MODELS, responseTokenCost: ai_cost_1.responseTokenCost, responseText: (payload) => payload.output_text }),
        fetch: async (_url, options) => { strict_1.default.equal(JSON.parse(options.body).model, 'gpt-5.6-luna'); return Response.json({ model: 'gpt-5.6-luna', usage: { input_tokens: 1000, output_tokens: 100 }, output_text: '{invalid' }); },
    });
    const service = { from(table) {
            strict_1.default.equal(table, 'ai_cost_ledger');
            return { async upsert(entry) {
                    writes.push(entry);
                    return { error: writes.length === 1 ? { message: 'Transient error' } : null };
                } };
        } };
    await strict_1.default.rejects(exports.findCharacterIdentities({ worldContext: { kind: 'existing' }, metadata: { title: 'A setting' } }, 'Renly', service, 'owner'));
    strict_1.default.equal(writes.length, 2);
    strict_1.default.equal(writes[0].operation, 'character_lookup');
    strict_1.default.equal(writes[0].reference_id, writes[1].reference_id);
    strict_1.default.equal(writes[0].owner_id, 'owner');
    strict_1.default.equal(writes[0].cost_usd, .00032);
});
