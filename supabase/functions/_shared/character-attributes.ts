export const CHARACTER_ATTRIBUTE_KEYS = ['strength','agility','endurance','intelligence','perception','presence','combatSkill'] as const;

export const characterAttributesSchema = {
  type: 'object', additionalProperties: false, required: [...CHARACTER_ATTRIBUTE_KEYS],
  properties: Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => [key, { type: 'integer', minimum: 1, maximum: 10 }])),
};

export const balancedCharacterAttributes = () => ({ strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5, presence: 5, combatSkill: 5 });

export function normalizeCharacterAttributes(value: any) {
  const fallback = balancedCharacterAttributes();
  return Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => {
    const score = Number(value?.[key]);
    return [key, Number.isInteger(score) ? Math.max(1, Math.min(10, score)) : fallback[key]];
  }));
}
