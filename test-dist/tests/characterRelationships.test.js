"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ai_config_1 = require("../supabase/functions/_shared/ai-config");
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_vm_1 = require("node:vm");
const typescript_1 = __importDefault(require("typescript"));
const ai_cost_1 = require("../supabase/functions/_shared/ai-cost");
const world_response_1 = require("../supabase/functions/_shared/world-response");
const api = {};
(0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule((0, node_fs_1.readFileSync)('supabase/functions/_shared/character-relationships.ts', 'utf8'), {
    compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 },
}).outputText, { exports: api, require: (name) => name.includes('ai-config') ? { AI_MODELS: ai_config_1.AI_MODELS } : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure } });
const lover = { sourceName: 'Loras', targetName: 'Renly', relationshipType: 'partner', score: 88, private: true, reason: 'Established romantic relationship in the supplied era.' };
for (const configuredModel of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'])
    (0, node_test_1.default)(`configured ${configuredModel} is used for both relationship generation and billing`, async () => {
        const source = (0, node_fs_1.readFileSync)('supabase/functions/_shared/character-relationships.ts', 'utf8');
        const parsed = typescript_1.default.createSourceFile('relationships.ts', source, typescript_1.default.ScriptTarget.Latest, true);
        strict_1.default.equal(parsed.parseDiagnostics.length, 0);
        let request, ledger;
        const local = {};
        (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule(source, { compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 } }).outputText, {
            exports: local, AbortSignal, crypto: { randomUUID: () => 'cost-reference' }, Deno: { env: { get: () => 'test' } },
            require: (name) => name.includes('ai-config') ? { AI_MODELS: { ...ai_config_1.AI_MODELS, characterRelationships: configuredModel } } : name.includes('ai-cost') ? { responseTokenCost: ai_cost_1.responseTokenCost } : { responseText: world_response_1.responseText, responseFailure: world_response_1.responseFailure },
            fetch: async (_url, init) => { request = JSON.parse(init.body); return Response.json({ status: 'completed', usage: { output_tokens: 1000 }, output_text: JSON.stringify({ connections: [lover] }) }); },
        });
        const service = { from: () => ({ insert: async (row) => { ledger = row; return {}; } }) };
        const result = await local.reviewCharacterRelationships(service, 'owner', 'campaign', [{ name: 'Loras' }], [{ name: 'Renly' }], { era: 'current', player: { name: 'Renly' } });
        strict_1.default.equal(request.model, configuredModel);
        strict_1.default.equal(request.reasoning.effort, 'medium');
        strict_1.default.equal(request.text.format.schema.properties.connections.items.properties.score.maximum, 100);
        strict_1.default.equal(JSON.stringify(request.text.format.schema.properties.connections.items.properties.sourceName.enum), JSON.stringify(['Loras']));
        strict_1.default.equal(JSON.stringify(request.text.format.schema.properties.connections.items.properties.targetName.enum), JSON.stringify(['Renly', 'Loras']));
        strict_1.default.equal(ledger.operation, 'character_relationships');
        strict_1.default.equal(ledger.model, configuredModel);
        strict_1.default.equal(ledger.cost_usd, (0, ai_cost_1.responseTokenCost)({ usage: { output_tokens: 1000 } }, configuredModel));
        strict_1.default.equal(result[0].score, 88);
    });
(0, node_test_1.default)('strong established affection and privacy survive relationship validation', () => {
    const result = api.validateRelationships({ connections: [lover] }, [{ name: 'Loras' }], [{ name: 'Renly' }]);
    strict_1.default.equal(result[0].score, 88);
    strict_1.default.equal(result[0].private, true);
});
(0, node_test_1.default)('sentiment is directional and may target another NPC', () => {
    const result = api.validateRelationships({ connections: [{ ...lover, sourceName: 'Stannis', targetName: 'Melisandre', relationshipType: 'sentiment', score: -95, reason: 'Campaign evidence establishes that he learned she killed his daughter.' }] }, [{ name: 'Stannis' }], [{ name: 'Melisandre' }, { name: 'Shireen' }]);
    strict_1.default.equal(result[0].targetName, 'Melisandre');
    strict_1.default.equal(result[0].score, -95);
    strict_1.default.equal(result.length, 1, 'no invented reciprocal feeling');
});
(0, node_test_1.default)('unknown is nullable, while invalid references and out-of-range scores are rejected', () => {
    strict_1.default.equal(api.validateRelationships({ connections: [{ ...lover, score: null }] }, [{ name: 'Loras' }], [{ name: 'Renly' }])[0].score, null);
    for (const altered of [{ ...lover, score: 101 }, { ...lover, targetName: 'Unknown' }, { ...lover, targetName: 'Loras' }])
        strict_1.default.throws(() => api.validateRelationships({ connections: [altered] }, [{ name: 'Loras' }], [{ name: 'Renly' }]));
});
(0, node_test_1.default)('AI validation discards malformed optional connections and supplies an unknown player assessment', () => {
    const invalid = { ...lover, targetName: 'A character outside the supplied cast' };
    const result = api.validateRelationships({ connections: [invalid] }, [{ name: 'Loras' }], [{ name: 'Renly' }], 'Renly', true);
    strict_1.default.equal(JSON.stringify(result.map((connection) => ({ source: connection.sourceName, target: connection.targetName, type: connection.relationshipType, score: connection.score }))), JSON.stringify([{ source: 'Loras', target: 'Renly', type: 'sentiment', score: null }]));
});
(0, node_test_1.default)('every candidate is assessed toward the player and the player is never assigned a feeling', () => {
    strict_1.default.match(api.RELATIONSHIP_INSTRUCTIONS, /Family status alone never supports a positive score/);
    strict_1.default.match(api.RELATIONSHIP_INSTRUCTIONS, /Never return the player as sourceName/);
    const robert = { sourceName: 'Robert', targetName: 'Renly', relationshipType: 'elder brother', score: 12, private: false, reason: 'They are brothers, but their established conduct shows limited closeness.' };
    strict_1.default.equal(api.validateRelationships({ connections: [robert] }, [{ name: 'Robert' }], [{ name: 'Robert' }, { name: 'Renly' }], 'Renly')[0].score, 12);
    strict_1.default.throws(() => api.validateRelationships({ connections: [] }, [{ name: 'Robert' }], [{ name: 'Robert' }, { name: 'Renly' }], 'Renly'), /omitted/);
    strict_1.default.throws(() => api.validateRelationships({ connections: [{ ...robert, sourceName: 'Renly', targetName: 'Robert' }] }, [{ name: 'Robert' }], [{ name: 'Robert' }, { name: 'Renly' }], 'Renly'), /invalid/);
});
(0, node_test_1.default)('review saves the player score, private role and directed NPC connection without overwriting existing rows', async () => {
    const writes = [];
    const service = { from(table) {
            const query = { select() { return query; }, eq() { return query; }, then(resolve) { return Promise.resolve({ data: [{ id: 'l', canonical_name: 'Loras' }, { id: 'r', canonical_name: 'Renly' }] }).then(resolve); },
                upsert(row, options) { writes.push({ table, row, options }); return Promise.resolve({}); }, insert(row) { writes.push({ table, row }); return Promise.resolve({}); } };
            return query;
        } };
    await api.saveReviewedRelationships(service, 'campaign', 'Renly', ['Loras'], [lover]);
    strict_1.default.equal(writes.find(w => w.table === 'campaign_relationships').row.score, 88);
    strict_1.default.equal(writes.find(w => w.table === 'campaign_relationships').options.ignoreDuplicates, true);
    const graph = writes.find(w => w.table === 'campaign_character_connections').row;
    strict_1.default.equal(graph.sentiment_score, 88);
    strict_1.default.equal(graph.source_entity_id, 'l');
    strict_1.default.equal(graph.target_entity_id, 'r');
    strict_1.default.equal(writes.find(w => w.table === 'campaign_relationship_roles').row.private, true);
});
