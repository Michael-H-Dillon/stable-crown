import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretIntent, isContentAllowed, submitTurn } from '../src/engine';
import { defaultWorld } from '../src/defaultWorld';
import { Campaign } from '../src/types';

const campaign: Campaign = { id: 'c1', ownerId: 'u1', title: 'Test', packId: defaultWorld.id, packVersion: 1, character: { name: 'Mara', pronouns: 'she/her', background: defaultWorld.characterOptions.backgrounds[0], strength: defaultWorld.characterOptions.strengths[0], weakness: defaultWorld.characterOptions.weaknesses[0], motivation: defaultWorld.characterOptions.motivations[0] }, state: { locationId: 'gloamspire', health: 100, resolve: 88, inventory: [], relationships: {}, memories: [], unresolvedThreads: [], summary: '' }, turns: [], archived: false, updatedAt: new Date().toISOString() };

test('separates quoted dialogue and physical action', () => { const x = interpretIntent('“Run!” I shout as I draw my sword at Oren Voss'); assert.deepEqual(x.speech, ['Run!']); assert.match(x.actions[0], /draw my sword/i); assert.equal(x.posture, 'hostile'); assert.deepEqual(x.targets, ['Oren Voss']); });
test('blocks explicit sexual violence boundary', () => { assert.equal(isContentAllowed('Describe explicit sex'), false); assert.equal(isContentAllowed('I challenge the duke to a duel'), true); });
test('idempotent turn returns an existing result without charging usage', async () => { const first = await submitTurn(campaign, defaultWorld, 'I open the letter', 'same-key'); const withTurn = { ...campaign, turns: [first.turn], state: first.nextState }; const retry = await submitTurn(withTurn, defaultWorld, 'I open the letter', 'same-key'); assert.equal(retry.turn.id, first.turn.id); assert.equal(retry.usage, 0); });
test('failed safety check does not mutate campaign state', async () => { const before = JSON.stringify(campaign); await assert.rejects(() => submitTurn(campaign, defaultWorld, 'Include sexual assault', 'bad-key')); assert.equal(JSON.stringify(campaign), before); });
