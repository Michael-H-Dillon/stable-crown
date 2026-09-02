import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldRequest, canAdvanceWorldStep, emptyWorldAnswers, worldWizardSteps } from '../src/worldWizard';

test('existing world needs only a setting and era, never a player', () => {
  assert.equal(worldWizardSteps.length, 3);
  const answers = { ...emptyWorldAnswers, world: 'A Song of Ice and Fire', era: 'Before the War of the Five Kings' };
  assert.equal(canAdvanceWorldStep(0, emptyWorldAnswers), false);
  assert.equal(canAdvanceWorldStep(1, { ...answers, era: ' ' }), false);
  assert.equal(canAdvanceWorldStep(2, answers), true);
  const request = buildWorldRequest(answers);
  assert.equal(request.worldContext.era, answers.era);
  assert.equal('character' in request, false);
  assert.equal('startingPoint' in request, false);
});
test('original worlds require a genre and premise', () => {
  const answers = { ...emptyWorldAnswers, basis: 'Original world', world: 'Ashfall', genre: 'Post-apocalyptic', description: 'Rival communities rebuilding a ruined coastal city.' };
  assert.equal(canAdvanceWorldStep(2, answers), true);
  assert.equal(canAdvanceWorldStep(1, { ...answers, genre: '' }), false);
  assert.equal(canAdvanceWorldStep(1, { ...answers, description: '' }), false);
  assert.equal(buildWorldRequest(answers).worldContext.description, answers.description);
});
test('switching to existing world removes original genre and premise from the request', () => {
  const request = buildWorldRequest({ ...emptyWorldAnswers, world: 'Fallout', era: '2281', genre: 'Fantasy', description: 'Old original idea' });
  assert.equal(request.worldContext.genre, '');
  assert.equal(request.worldContext.description, '');
});
