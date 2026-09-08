import test from 'node:test';
import assert from 'node:assert/strict';
import { reportTurnCost } from '../supabase/functions/_shared/turn-budget-alert';

const turn = { campaignId: 'campaign', userId: 'owner', requestId: 'response', model: 'gpt-5.6-luna', cost: .2595, threshold: .25, input: 100000, output: 4000 };

test('over-budget completed turn records an alert and emails the administrator', async () => {
  const records:any[]=[]; const emails:any[]=[];
  await reportTurnCost(turn,{service:{from:()=>({insert:async(row:any)=>{records.push(row);return {};}})},to:'admin@example.com',apiKey:'test',
    send:async(_url,init)=>{emails.push(init);return new Response('{}');}});
  assert.equal(records[0].details.action,'continued_turn');
  assert.equal(records[0].details.stage,'turn_budget');
  const email=JSON.parse(emails[0].body);
  assert.match(email.text,/continued successfully/);
  assert.equal(emails[0].headers['Idempotency-Key'],'turn-budget-response');
});

test('turn monitoring failures never reject gameplay', async () => {
  await assert.doesNotReject(reportTurnCost(turn,{service:{from:()=>{throw new Error('db');}},to:'admin@example.com',apiKey:'test',send:async()=>{throw new Error('email');},log:()=>{}}));
});
