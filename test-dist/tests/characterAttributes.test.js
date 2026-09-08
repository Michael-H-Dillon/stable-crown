"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const character_attributes_1 = require("../supabase/functions/_shared/character-attributes");
(0, node_test_1.default)('character attributes preserve valid 1-10 integer scores', () => {
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterAttributes)({
        strength: 8, agility: 7, endurance: 6, intelligence: 9,
        perception: 4, willpower: 6, presence: 5,
    }), {
        strength: 8, agility: 7, endurance: 6, intelligence: 9,
        perception: 4, willpower: 6, presence: 5,
    });
});
(0, node_test_1.default)('character attributes clamp integers and safely default missing values', () => {
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterAttributes)({ strength: 20, agility: 0 }), {
        strength: 10, agility: 1, endurance: 5, intelligence: 5,
        perception: 5, willpower: 5, presence: 5,
    });
});
(0, node_test_1.default)('legacy combat skill becomes a learned skill without replacing specific combat training', () => {
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterSkills)([], 8), [{ name: 'Combat', rating: 8 }]);
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterSkills)([{ name: 'Swordsmanship', rating: 7 }], 8), [{ name: 'Swordsmanship', rating: 7 }]);
});
(0, node_test_1.default)('database migration preserves legacy combat ability and adds neutral willpower', () => {
    const migration = (0, node_fs_1.readFileSync)('supabase/migrations/202609080002_universal_attributes_and_skills.sql', 'utf8');
    strict_1.default.match(migration, /attributes,combatSkill/);
    strict_1.default.match(migration, /'name', 'Combat', 'rating'/);
    strict_1.default.match(migration, /attributes,willpower/);
    strict_1.default.match(migration, /'5'::jsonb/);
});
(0, node_test_1.default)('legacy canon assessments are queued for universal reassessment', () => {
    const migration = (0, node_fs_1.readFileSync)('supabase/migrations/202609080003_reassess_universal_character_attributes.sql', 'utf8');
    strict_1.default.match(migration, /attributes_assessment_version/);
    strict_1.default.match(migration, /attributes_individually_assessed = false/);
    strict_1.default.match(migration, /canon_status = 'canonical'/);
});
(0, node_test_1.default)('original character attributes are varied but stable across retries', () => {
    const first = (0, character_attributes_1.randomizedCharacterAttributes)('campaign-1:original-1');
    const retry = (0, character_attributes_1.randomizedCharacterAttributes)('campaign-1:original-1');
    const other = (0, character_attributes_1.randomizedCharacterAttributes)('campaign-1:original-2');
    strict_1.default.deepEqual(retry, first);
    strict_1.default.notDeepEqual(other, first);
    for (const key of character_attributes_1.CHARACTER_ATTRIBUTE_KEYS) {
        strict_1.default.ok(first[key] >= 3 && first[key] <= 7);
    }
});
