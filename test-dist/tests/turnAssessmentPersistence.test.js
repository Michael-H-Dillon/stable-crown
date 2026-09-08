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
(0, node_test_1.default)('an already-assessed legacy character is saved once and needs no lookup next turn', async () => {
    const source = (0, node_fs_1.readFileSync)('supabase/functions/resolve-turn/index.ts', 'utf8');
    const start = source.indexOf('    const unassessedCanonCharacters =');
    const end = source.indexOf('    const activeSceneCharacters =', start);
    strict_1.default.ok(start > 0 && end > start);
    const api = {};
    const database = { id: 'player-id', campaign_id: 'campaign-id', name: 'Test character',
        canon_status: 'canonical', attributes_individually_assessed: true, attributes_assessment_version: 0,
        traits: { attributes: { strength: 8, willpower: 6 }, player: true } };
    let lookups = 0;
    const service = { from: () => {
            let values;
            const filters = [];
            const query = {
                update: (next) => { values = next; return query; },
                eq: (key, value) => { filters.push([key, value]); return query; },
                then: (resolve) => {
                    if (filters.every(([key, value]) => database[key] === value))
                        Object.assign(database, structuredClone(values));
                    return Promise.resolve({ error: null }).then(resolve);
                },
            };
            return query;
        } };
    const assessCanonicalCharacterAttributes = async () => {
        lookups++;
        return { attributes: { strength: 8, willpower: 7 }, skills: [{ name: 'Swordsmanship', rating: 7 }], basis: 'Verified', sources: [] };
    };
    const wrapper = `export async function assess(player:any) { ${source.slice(start, end)} }`;
    (0, node_vm_1.runInNewContext)(typescript_1.default.transpileModule(wrapper, { compilerOptions: { module: typescript_1.default.ModuleKind.CommonJS, target: typescript_1.default.ScriptTarget.ES2022 } }).outputText, {
        exports: api, service, assessCanonicalCharacterAttributes, activeSceneCharacterRows: [],
        userData: { user: { id: 'owner' } }, campaignId: 'campaign-id', storedPack: {}, campaignClock: {}, prior: {},
    });
    await api.assess(structuredClone(database));
    strict_1.default.equal(database.attributes_assessment_version, 2);
    strict_1.default.equal(database.traits.attributes.willpower, 7);
    strict_1.default.equal(database.traits.skills[0].rating, 7);
    await api.assess(structuredClone(database));
    strict_1.default.equal(lookups, 1);
});
