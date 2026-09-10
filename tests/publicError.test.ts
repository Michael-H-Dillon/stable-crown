import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAiErrorMessage } from '../supabase/functions/_shared/public-error';

const fallback = 'The service is temporarily unavailable.';

test('provider billing details are never exposed to customers', () => {
  assert.equal(publicAiErrorMessage(new Error('You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing/.'), fallback), fallback);
  assert.equal(publicAiErrorMessage(new Error('insufficient_quota'), fallback), fallback);
  assert.equal(publicAiErrorMessage(new Error('Invalid API key supplied'), fallback), fallback);
});

test('ordinary actionable customer errors remain visible', () => {
  assert.equal(publicAiErrorMessage(new Error('You do not have enough Crowns.'), fallback), 'You do not have enough Crowns.');
});
