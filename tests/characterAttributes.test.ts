import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_ATTRIBUTE_KEYS, normalizeCharacterAttributes, normalizeCharacterSkills, randomizedCharacterAttributes } from '../supabase/functions/_shared/character-attributes';

test('character attributes preserve valid 1-10 integer scores', () => {
  assert.deepEqual(normalizeCharacterAttributes({
    strength: 8, agility: 7, endurance: 6, intelligence: 9,
    perception: 4, willpower: 6, presence: 5,
  }), {
    strength: 8, agility: 7, endurance: 6, intelligence: 9,
    perception: 4, willpower: 6, presence: 5,
  });
});

test('character attributes clamp integers and safely default missing values', () => {
  assert.deepEqual(normalizeCharacterAttributes({ strength: 20, agility: 0 }), {
    strength: 10, agility: 1, endurance: 5, intelligence: 5,
    perception: 5, willpower: 5, presence: 5,
  });
});

test('legacy combat skill becomes a learned skill without replacing specific combat training', () => {
  assert.deepEqual(normalizeCharacterSkills([], 8), [{name:'Combat',rating:8}]);
  assert.deepEqual(normalizeCharacterSkills([{name:'Swordsmanship',rating:7}], 8), [{name:'Swordsmanship',rating:7}]);
});

test('database migration preserves legacy combat ability and adds neutral willpower', () => {
  const migration = readFileSync('supabase/migrations/202609080002_universal_attributes_and_skills.sql','utf8');
  assert.match(migration, /attributes,combatSkill/);
  assert.match(migration, /'name', 'Combat', 'rating'/);
  assert.match(migration, /attributes,willpower/);
  assert.match(migration, /'5'::jsonb/);
});

test('legacy canon assessments are queued for universal reassessment', () => {
  const migration = readFileSync('supabase/migrations/202609080003_reassess_universal_character_attributes.sql','utf8');
  assert.match(migration, /attributes_assessment_version/);
  assert.match(migration, /attributes_individually_assessed = false/);
  assert.match(migration, /canon_status = 'canonical'/);
});

test('original character attributes are varied but stable across retries', () => {
  const first = randomizedCharacterAttributes('campaign-1:original-1');
  const retry = randomizedCharacterAttributes('campaign-1:original-1');
  const other = randomizedCharacterAttributes('campaign-1:original-2');

  assert.deepEqual(retry, first);
  assert.notDeepEqual(other, first);
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    assert.ok(first[key] >= 3 && first[key] <= 7);
  }
});
