import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBackgroundJob } from '../supabase/functions/_shared/public-background-job';

test('background job responses omit internal AI telemetry', () => {
  const visible = publicBackgroundJob({
    id: 'job', model_used: 'gpt-5.6-luna', input_tokens: 21875,
    output_tokens: 2143, web_search_count: 2, api_cost_usd: .026947,
    max_api_cost_usd: 5, stage_timings: { building: 1 }, checkpoint: { responseId: 'private' }, result: {
      pack: { id: 'world' }, creditsRemaining: 80,
      apiCostUsd: .026947, inputTokens: 21875, outputTokens: 2143,
      webSearchCount: 2, modelUsed: 'gpt-5.6-luna', stageTimings: { building: 1 },
    },
  });
  assert.deepEqual(visible.result, { pack: { id: 'world' }, creditsRemaining: 80 });
  assert.equal('model_used' in visible, false);
  assert.equal('input_tokens' in visible, false);
  assert.equal('api_cost_usd' in visible, false);
  assert.equal('checkpoint' in visible, false);
});
