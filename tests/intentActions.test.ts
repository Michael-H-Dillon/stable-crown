import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntentActions } from '../supabase/functions/_shared/intent-actions';

test('consequential player actions remain attempts in the intent ledger', () => {
  assert.deepEqual(normalizeIntentActions([
    'Ride up to open the saddlebag',
    'Stab Serjeant Hollis in the throat with a dagger',
  ]), [
    'Ride up to open the saddlebag',
    'Attempt to stab Serjeant Hollis in the throat with a dagger',
  ]);
});

test('already qualified attempts are not rewritten twice', () => {
  assert.deepEqual(normalizeIntentActions(['Attempt to escape the patrol', 'Try to persuade Eddard']), [
    'Attempt to escape the patrol',
    'Try to persuade Eddard',
  ]);
});
