"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.balancedCharacterAttributes = exports.characterAttributesSchema = exports.CHARACTER_ATTRIBUTE_KEYS = void 0;
exports.normalizeCharacterAttributes = normalizeCharacterAttributes;
exports.CHARACTER_ATTRIBUTE_KEYS = ['strength', 'agility', 'endurance', 'intelligence', 'perception', 'presence', 'combatSkill'];
exports.characterAttributesSchema = {
    type: 'object', additionalProperties: false, required: [...exports.CHARACTER_ATTRIBUTE_KEYS],
    properties: Object.fromEntries(exports.CHARACTER_ATTRIBUTE_KEYS.map(key => [key, { type: 'integer', minimum: 1, maximum: 10 }])),
};
const balancedCharacterAttributes = () => ({ strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5, presence: 5, combatSkill: 5 });
exports.balancedCharacterAttributes = balancedCharacterAttributes;
function normalizeCharacterAttributes(value) {
    const fallback = (0, exports.balancedCharacterAttributes)();
    return Object.fromEntries(exports.CHARACTER_ATTRIBUTE_KEYS.map(key => {
        const score = Number(value?.[key]);
        return [key, Number.isInteger(score) ? Math.max(1, Math.min(10, score)) : fallback[key]];
    }));
}
