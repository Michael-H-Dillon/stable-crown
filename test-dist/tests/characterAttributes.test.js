"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const character_attributes_1 = require("../supabase/functions/_shared/character-attributes");
(0, node_test_1.default)('character attributes preserve valid 1-10 integer scores', () => {
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterAttributes)({
        strength: 8, agility: 7, endurance: 6, intelligence: 9,
        perception: 4, presence: 5, combatSkill: 10,
    }), {
        strength: 8, agility: 7, endurance: 6, intelligence: 9,
        perception: 4, presence: 5, combatSkill: 10,
    });
});
(0, node_test_1.default)('character attributes clamp integers and safely default missing values', () => {
    strict_1.default.deepEqual((0, character_attributes_1.normalizeCharacterAttributes)({ strength: 20, agility: 0 }), {
        strength: 10, agility: 1, endurance: 5, intelligence: 5,
        perception: 5, presence: 5, combatSkill: 5,
    });
});
