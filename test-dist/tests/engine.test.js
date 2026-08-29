"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const engine_1 = require("../src/engine");
const defaultWorld_1 = require("../src/defaultWorld");
const campaign = { id: 'c1', ownerId: 'u1', title: 'Test', packId: defaultWorld_1.defaultWorld.id, packVersion: 1, character: { name: 'Mara', pronouns: 'she/her', background: defaultWorld_1.defaultWorld.characterOptions.backgrounds[0], strength: defaultWorld_1.defaultWorld.characterOptions.strengths[0], weakness: defaultWorld_1.defaultWorld.characterOptions.weaknesses[0], motivation: defaultWorld_1.defaultWorld.characterOptions.motivations[0] }, state: { locationId: 'gloamspire', health: 100, resolve: 88, inventory: [], relationships: {}, memories: [], unresolvedThreads: [], summary: '' }, turns: [], archived: false, updatedAt: new Date().toISOString() };
(0, node_test_1.default)('separates quoted dialogue and physical action', () => { const x = (0, engine_1.interpretIntent)('“Run!” I shout as I draw my sword at Oren Voss'); strict_1.default.deepEqual(x.speech, ['Run!']); strict_1.default.match(x.actions[0], /draw my sword/i); strict_1.default.equal(x.posture, 'hostile'); strict_1.default.deepEqual(x.targets, ['Oren Voss']); });
(0, node_test_1.default)('blocks explicit sexual violence boundary', () => { strict_1.default.equal((0, engine_1.isContentAllowed)('Describe explicit sex'), false); strict_1.default.equal((0, engine_1.isContentAllowed)('I challenge the duke to a duel'), true); });
(0, node_test_1.default)('idempotent turn returns an existing result without charging usage', async () => { const first = await (0, engine_1.submitTurn)(campaign, defaultWorld_1.defaultWorld, 'I open the letter', 'same-key'); const withTurn = { ...campaign, turns: [first.turn], state: first.nextState }; const retry = await (0, engine_1.submitTurn)(withTurn, defaultWorld_1.defaultWorld, 'I open the letter', 'same-key'); strict_1.default.equal(retry.turn.id, first.turn.id); strict_1.default.equal(retry.usage, 0); });
(0, node_test_1.default)('failed safety check does not mutate campaign state', async () => { const before = JSON.stringify(campaign); await strict_1.default.rejects(() => (0, engine_1.submitTurn)(campaign, defaultWorld_1.defaultWorld, 'Include sexual assault', 'bad-key')); strict_1.default.equal(JSON.stringify(campaign), before); });
