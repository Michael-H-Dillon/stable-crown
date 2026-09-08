import test from 'node:test';
import assert from 'node:assert/strict';
import { withExplicitPromptCache } from '../supabase/functions/_shared/prompt-cache';

test('explicit prompt cache separates stable prefixes from dynamic turn data',()=>{
  const request=withExplicitPromptCache({model:'gpt-5.6-luna',instructions:'stable rules',input:'changing turn'},'story-turn-v1:campaign',{world:'stable'});
  assert.equal(request.prompt_cache_key,'story-turn-v1:campaign');
  assert.equal(request.prompt_cache_options.mode,'explicit');
  assert.equal(request.prompt_cache_options.ttl,'30m');
  assert.equal(request.input[0].role,'developer');
  assert.equal(request.input[0].content[0].prompt_cache_breakpoint.mode,'explicit');
  assert.equal(request.input[1].content[0].prompt_cache_breakpoint.mode,'explicit');
  assert.equal(request.input[2].content,'changing turn');
  assert.equal('instructions' in request,false);
});
