import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/add-campaign-context/index.ts', 'utf8');

test('context research has room for broad cast research', () => {
  assert.match(source, /const MAX_WEB_SEARCHES = 20;/);
  assert.match(source, /const MAX_API_COST_USD = 1\.00;/);
  assert.match(source, /const MAX_OUTPUT_TOKENS = 48000;/);
  assert.match(source, /Do not stop after a general overview or substitute a long location list for the requested cast\./);
  assert.match(source, /If at least 12 relevant named people can be verified, return 12–50 individual characters\./);
  assert.match(source, /characters:\{type:'array',maxItems:50/);
  assert.match(source, /filter\(\(item:any\)=>isIndividualCharacterName\(item\?\.name\)\)/);
});

test('collective cast labels are rejected before ledger insertion', () => {
  assert.match(source, /Reach Lords and Ladies/);
  assert.match(source, /const collectiveCharacterName=/);
});

test('background context research keeps relationship work alive without a request timeout', () => {
  assert.match(source, /research:result,backgroundJob:true/);
  assert.match(source, /const relationshipHeartbeat=setInterval/);
});
