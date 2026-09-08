export const CHARACTER_ATTRIBUTE_KEYS = ['strength','agility','endurance','intelligence','perception','willpower','presence'] as const;

export const characterAttributesSchema = {
  type: 'object', additionalProperties: false, required: [...CHARACTER_ATTRIBUTE_KEYS],
  properties: Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => [key, { type: 'integer', minimum: 1, maximum: 10 }])),
};

export const balancedCharacterAttributes = () => ({ strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5, willpower: 5, presence: 5 });

export type CharacterSkill = { name: string; rating: number };
export const characterSkillsSchema = { type:'array', maxItems:20, items:{ type:'object', additionalProperties:false, required:['name','rating'], properties:{ name:{type:'string'}, rating:{type:'integer',minimum:1,maximum:10} } } };

export function normalizeCharacterSkills(value: any, legacyCombatSkill?: any): CharacterSkill[] {
  const skills = (Array.isArray(value) ? value : []).filter((entry:any) => entry && String(entry.name || '').trim()).map((entry:any) => ({
    name: String(entry.name).trim().slice(0,80), rating: Math.max(1,Math.min(10,Number.isInteger(Number(entry.rating)) ? Number(entry.rating) : 5)),
  }));
  const legacy = Number(legacyCombatSkill);
  if (Number.isInteger(legacy) && !skills.some(skill => /combat|weapon|fight|duel|archery|guns|unarmed|sword/i.test(skill.name))) {
    skills.push({name:'Combat',rating:Math.max(1,Math.min(10,legacy))});
  }
  return skills;
}

/** Stable variation for original characters. Most scores remain ordinary; no retry rerolls them. */
export function randomizedCharacterAttributes(seed: string) {
  let state = [...String(seed)].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const roll = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 3 + (state % 5);
  };
  return Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => [key, roll()]));
}

export function normalizeCharacterAttributes(value: any) {
  const fallback = balancedCharacterAttributes();
  return Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => {
    const score = Number(value?.[key]);
    return [key, Number.isInteger(score) ? Math.max(1, Math.min(10, score)) : fallback[key]];
  }));
}
