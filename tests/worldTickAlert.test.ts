import test from 'node:test';
import assert from 'node:assert/strict';
import { reportWorldTickCost } from '../supabase/functions/_shared/world-tick-alert';

const tick = { campaignId: 'campaign', userId: 'owner', requestId: 'response', model: 'gpt-5.6-sol', cost: .1692, threshold: .1, input: 1000, output: 8000 };

test('over-budget tick records an alert and emails the administrator', async () => {
  const records: any[] = [];
  const emails: any[] = [];
  await reportWorldTickCost(tick, {
    service: { from: () => ({ insert: async (row: any) => { records.push(row); return {}; } }) },
    to: 'admin@example.com', apiKey: 'test',
    send: async (_url, init) => { emails.push(init); return new Response('{}'); },
  });
  assert.equal(records[0].details.action, 'continued_turn');
  const email = JSON.parse(emails[0].body);
  assert.deepEqual(email.to, ['admin@example.com']);
  assert.match(email.text, /0.169200/);
  assert.match(email.text, /Campaign: campaign/);
  assert.equal(emails[0].headers['Idempotency-Key'], 'world-tick-budget-response');
});

test('at or below threshold produces no alert', async () => {
  for (const cost of [.05, .1]) await reportWorldTickCost({ ...tick, cost }, {
    service: { from: () => { assert.fail('No alert expected'); } },
    send: async () => { assert.fail('No email expected'); },
  });
});

test('database and email failures never reject the turn', async () => {
  let emailAttempts = 0;
  const messages: string[] = [];
  await assert.doesNotReject(reportWorldTickCost(tick, {
    service: { from: () => { throw new Error('Database unavailable'); } },
    to: 'admin@example.com', apiKey: 'test', log: message => messages.push(message),
    send: async () => { emailAttempts++; throw new Error('Email unavailable'); },
  }));
  assert.equal(emailAttempts, 1);
  assert.equal(messages.length, 2);
});

test('provider rejection is logged without rejecting the turn', async () => {
  const messages: string[] = [];
  await assert.doesNotReject(reportWorldTickCost(tick, {
    service: { from: () => ({ insert: async () => ({}) }) },
    to: 'admin@example.com', apiKey: 'test', log: message => messages.push(message),
    send: async () => new Response('{}', { status: 429 }),
  }));
  assert.match(messages[0], /429/);
});
