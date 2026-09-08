"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.characterSkillsSchema = exports.balancedCharacterAttributes = exports.characterAttributesSchema = exports.CHARACTER_ATTRIBUTE_KEYS = void 0;
exports.normalizeCharacterSkills = normalizeCharacterSkills;
exports.randomizedCharacterAttributes = randomizedCharacterAttributes;
exports.normalizeCharacterAttributes = normalizeCharacterAttributes;
exports.CHARACTER_ATTRIBUTE_KEYS = ['strength', 'agility', 'endurance', 'intelligence', 'perception', 'willpower', 'presence'];
exports.characterAttributesSchema = {
    type: 'object', additionalProperties: false, required: [...exports.CHARACTER_ATTRIBUTE_KEYS],
    properties: Object.fromEntries(exports.CHARACTER_ATTRIBUTE_KEYS.map(key => [key, { type: 'integer', minimum: 1, maximum: 10 }])),
};
const balancedCharacterAttributes = () => ({ strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5, willpower: 5, presence: 5 });
exports.balancedCharacterAttributes = balancedCharacterAttributes;
exports.characterSkillsSchema = { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['name', 'rating'], properties: { name: { type: 'string' }, rating: { type: 'integer', minimum: 1, maximum: 10 } } } };
function normalizeCharacterSkills(value, legacyCombatSkill) {
    const skills = (Array.isArray(value) ? value : []).filter((entry) => entry && String(entry.name || '').trim()).map((entry) => ({
        name: String(entry.name).trim().slice(0, 80), rating: Math.max(1, Math.min(10, Number.isInteger(Number(entry.rating)) ? Number(entry.rating) : 5)),
    }));
    const legacy = Number(legacyCombatSkill);
    if (Number.isInteger(legacy) && !skills.some(skill => /combat|weapon|fight|duel|archery|guns|unarmed|sword/i.test(skill.name))) {
        skills.push({ name: 'Combat', rating: Math.max(1, Math.min(10, legacy)) });
    }
    return skills;
}
/** Stable variation for original characters. Most scores remain ordinary; no retry rerolls them. */
function randomizedCharacterAttributes(seed) {
    let state = [...String(seed)].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const roll = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return 3 + (state % 5);
    };
    return Object.fromEntries(exports.CHARACTER_ATTRIBUTE_KEYS.map(key => [key, roll()]));
}
function normalizeCharacterAttributes(value) {
    const fallback = (0, exports.balancedCharacterAttributes)();
    return Object.fromEntries(exports.CHARACTER_ATTRIBUTE_KEYS.map(key => {
        const score = Number(value?.[key]);
        return [key, Number.isInteger(score) ? Math.max(1, Math.min(10, score)) : fallback[key]];
    }));
}
