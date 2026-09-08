import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterAttributes } from '../supabase/functions/_shared/character-attributes';

test('character attributes preserve valid 1-10 integer scores', () => {
  assert.deepEqual(normalizeCharacterAttributes({
    strength: 8, agility: 7, endurance: 6, intelligence: 9,
    perception: 4, presence: 5, combatSkill: 10,
  }), {
    strength: 8, agility: 7, endurance: 6, intelligence: 9,
    perception: 4, presence: 5, combatSkill: 10,
  });
});

test('character attributes clamp integers and safely default missing values', () => {
  assert.deepEqual(normalizeCharacterAttributes({ strength: 20, agility: 0 }), {
    strength: 10, agility: 1, endurance: 5, intelligence: 5,
    perception: 5, presence: 5, combatSkill: 5,
  });
});
