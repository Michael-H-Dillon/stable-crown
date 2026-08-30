import { z } from 'zod';
import { WorldPack } from './types';

const entry = z.object({ id: z.string().min(2).regex(/^[a-z0-9-]+$/), name: z.string().min(2), description: z.string().min(8) });
const entries = z.array(entry).min(1);
const awareness = z.object({ entityId: z.string().min(2), level: z.enum(['none','suspects','knows']), suspicion: z.number().int().min(0).max(100) });
const economicProfile = z.object({ id: z.string().min(2).regex(/^[a-z0-9-]+$/), name: z.string().min(2), backgroundIds: z.array(z.string().min(2)).min(1), currency: z.string().min(1), balance: z.number().nonnegative(), recurringIncome: z.number().nonnegative(), recurringOutgoings: z.number().nonnegative(), incomePeriod: z.string().min(2), description: z.string().min(8) });
const openingScenario = z.object({ id: z.string().min(2), title: z.string().min(3), chapterLabel: z.string().min(3), narration: z.string().min(40), startLocationId: z.string().min(2), startingInventory: z.array(z.string()), memories: z.array(z.string()), unresolvedThreads: z.array(z.string()), sceneFacts: z.array(z.string()), relationships: z.record(z.string(), z.number().min(-100).max(100)).optional(), calendar: z.object({ name: z.string().min(2), year: z.string().min(1), day: z.number().int().positive(), segment: z.string().min(2) }), playerPreset: z.object({ name: z.string().min(2), pronouns: z.string().min(2), backgroundId: z.string().min(2), strengthId: z.string().min(2), weaknessId: z.string().min(2), motivationId: z.string().min(2) }).optional() });
const characterProfile = z.object({ npcId: z.string().min(2), startingLocation: z.object({ locationId: z.string().min(2), confidence: z.enum(['low','medium','high','confirmed']), reason: z.string().min(5) }).optional(), values: z.array(z.string().min(2)).min(1), goals: z.array(z.string().min(2)).min(1), loyalties: z.array(z.string().min(2)), redLines: z.array(z.string().min(2)).min(1), persuasion: z.object({ baseDifficulty: z.enum(['easy','moderate','hard','extreme']), leverage: z.array(z.string().min(2)), relationshipThresholds: z.object({ cooperative: z.number().int().min(-100).max(100), majorRisk: z.number().int().min(-100).max(100) }) }) });
const unsafe = /(ignore (all|previous)|system prompt|developer message|api[_ -]?key)/i;

export const worldPackSchema = z.object({
  schemaVersion: z.literal('1.0'), id: z.string().min(3), version: z.number().int().positive(), ownerId: z.string(),
  status: z.enum(['draft', 'validation-error', 'ready']),
  metadata: z.object({ title: z.string().min(3), tagline: z.string().min(3), author: z.string().min(2), description: z.string().min(20), contentRating: z.literal('mature-no-explicit-sex') }),
  premise: z.string().min(40), tone: z.array(z.string()).min(1), factions: entries, locations: entries, cultures: entries,
  history: z.array(z.string()).min(1),
  characterOptions: z.object({ backgrounds: entries, strengths: entries, weaknesses: entries, motivations: z.array(entry), motivationsByBackground: z.record(z.string(), entries).optional() }),
  items: entries, rules: z.array(z.string()).min(1), npcs: entries, secrets: entries, scenarioHooks: entries,
  aiGuidance: z.array(z.string()).min(1), safetyBoundaries: z.array(z.string()).min(1),
  openingScenario: openingScenario.optional(),
  characterProfiles: z.array(characterProfile).optional(),
  worldEvents: z.array(z.object({ id: z.string().min(2), name: z.string().min(3), description: z.string().min(10), earliestDay: z.number().int().positive(), latestDay: z.number().int().positive(), conditions: z.array(z.string()) })).optional(),
  secretSystems: z.array(z.object({ id: z.string().min(2), name: z.string().min(3), description: z.string().min(10), stakes: z.array(z.string()).min(1), initialAwareness: z.array(awareness), evidenceTypes: z.array(z.string()).min(1) })).optional(),
  economicProfiles: z.array(economicProfile).optional(),
  artwork: z.string().optional(),
});

export interface PackValidation { valid: boolean; errors: string[]; warnings: string[]; pack?: WorldPack }
export interface LocationNameConflict { normalizedName: string; entries: WorldPack['locations'] }

export const estimatePackImportCredits = (input: unknown) => Math.max(1, Math.min(20, Math.ceil(new TextEncoder().encode(JSON.stringify(input)).length / 25_000)));

export function findLocationNameConflicts(pack: WorldPack): LocationNameConflict[] {
  const groups = new Map<string, WorldPack['locations']>();
  for (const location of pack.locations || []) {
    const key = location.name.trim().toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) || []), location]);
  }
  return [...groups.entries()].filter(([, locations]) => locations.length > 1).map(([normalizedName, entries]) => ({ normalizedName, entries }));
}

export function resolveLocationNameConflict(pack: WorldPack, conflict: LocationNameConflict, action: 'rename' | 'keep' | 'merge', primaryId?: string, customNames?: Record<string, string>): WorldPack {
  const ids = new Set(conflict.entries.map(entry => entry.id));
  if (action === 'rename') {
    const locations = pack.locations.map(location => ids.has(location.id) ? { ...location, name: customNames?.[location.id]?.trim() || `${location.name} (${location.id.replaceAll('-', ' ')})` } : location);
    return { ...pack, locations };
  }
  const primary = conflict.entries.find(entry => entry.id === primaryId);
  if (!primary) throw new Error('Choose which location should be retained.');
  const removedIds = new Set([...ids].filter(id => id !== primary.id));
  const referencedRemovedId = pack.openingScenario && removedIds.has(pack.openingScenario.startLocationId);
  if (action === 'keep' && referencedRemovedId) throw new Error('A discarded location is referenced by the opening scenario. Merge these locations instead, or rename them.');
  return {
    ...pack,
    locations: pack.locations.filter(location => !removedIds.has(location.id)),
    ...(action === 'merge' && pack.openingScenario && ids.has(pack.openingScenario.startLocationId) ? { openingScenario: { ...pack.openingScenario, startLocationId: primary.id } } : {}),
  };
}

export function validatePack(input: unknown): PackValidation {
  const serialized = JSON.stringify(input);
  if (serialized.length > 500_000) return { valid: false, errors: ['Pack exceeds the 500 KB text limit.'], warnings: [] };
  const result = worldPackSchema.safeParse(input);
  if (!result.success) return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`), warnings: [] };
  const pack = result.data as WorldPack;
  const ids = [...pack.factions, ...pack.locations, ...pack.cultures, ...pack.items, ...pack.npcs, ...pack.secrets, ...pack.scenarioHooks].map(x => x.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  const errors = duplicates.length ? [`Duplicate identifiers: ${[...new Set(duplicates)].join(', ')}`] : [];
  for (const [label, collection] of [['location', pack.locations], ['character', pack.npcs]] as const) {
    const normalizedNames = collection.map(item => item.name.trim().toLocaleLowerCase());
    const duplicateNames = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index);
    if (duplicateNames.length) errors.push(`Duplicate ${label} names: ${[...new Set(duplicateNames)].join(', ')}. Give each ${label} a unique, disambiguated name.`);
  }
  if (pack.openingScenario && !pack.locations.some(location => location.id === pack.openingScenario!.startLocationId)) errors.push(`Opening scenario references missing location: ${pack.openingScenario.startLocationId}`);
  if (pack.economicProfiles) for (const profile of pack.economicProfiles) for (const backgroundId of profile.backgroundIds) if (!pack.characterOptions.backgrounds.some(background => background.id === backgroundId)) errors.push(`Economic profile ${profile.id} references missing background: ${backgroundId}`);
  if (pack.secretSystems) for (const secret of pack.secretSystems) for (const state of secret.initialAwareness) if (state.entityId !== 'player' && !pack.npcs.some(npc => npc.id === state.entityId)) errors.push(`Secret ${secret.id} references missing entity: ${state.entityId}`);
  if (pack.characterProfiles) for (const profile of pack.characterProfiles) if (!pack.npcs.some(npc => npc.id === profile.npcId)) errors.push(`Character profile references missing NPC: ${profile.npcId}`);
  if (pack.characterProfiles) for (const profile of pack.characterProfiles) if (profile.startingLocation && !pack.locations.some(location => location.id === profile.startingLocation!.locationId)) errors.push(`Character profile ${profile.npcId} references missing starting location: ${profile.startingLocation.locationId}`);
  if (unsafe.test(serialized)) errors.push('Pack contains unsafe or disallowed instructions/content.');
  const warnings = pack.factions.length < 2 ? ['Political worlds work best with at least two factions.'] : [];
  return { valid: errors.length === 0, errors, warnings, pack: errors.length ? undefined : pack };
}

export const worldPackJsonSchema = {
  '$schema': 'https://json-schema.org/draft/2020-12/schema', title: 'Sable Crown World Pack', type: 'object',
  required: ['schemaVersion', 'id', 'version', 'metadata', 'premise', 'tone', 'factions', 'locations', 'cultures', 'history', 'characterOptions', 'items', 'rules', 'npcs', 'secrets', 'scenarioHooks', 'aiGuidance', 'safetyBoundaries'],
  properties: { schemaVersion: { const: '1.0' }, id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, metadata: { type: 'object' } },
};

export const markdownTemplate = `# Sable Crown World Pack\n\n> schemaVersion: 1.0\n> id: your-world-id\n> version: 1\n\n## Metadata\nTitle: Your World\nTagline: A short promise\nAuthor: Your name\nDescription: At least twenty characters describing the world.\nContent rating: mature-no-explicit-sex\n\n## Premise\nAt least forty characters establishing the central conflict.\n\n## Tone\n- grounded intrigue\n\n## Factions\n### faction-id | Faction Name\nA meaningful description.\n\n## Locations\n### location-id | Location Name\nA meaningful description.\n\n## Cultures\n### culture-id | Culture Name\nA meaningful description.\n\n## History\n- A defining event.\n\n## Character Backgrounds\n### background-id | Background Name\nA meaningful description.\n\n## Strengths\n### strength-id | Strength Name\nA meaningful description.\n\n## Weaknesses\n### weakness-id | Weakness Name\nA meaningful description.\n\n## Motivations\n### motivation-id | Motivation Name\nA meaningful description.\n\n## Items\n### item-id | Item Name\nA meaningful description.\n\n## Rules\n- A rule of the world.\n\n## NPCs\n### npc-id | NPC Name\nA meaningful description.\n\n## Secrets\n### secret-id | Secret Name\nA meaningful description.\n\n## Scenario Hooks\n### hook-id | Hook Name\nA meaningful description.\n\n## AI Guidance\n- Never decide the player's thoughts or dialogue.\n\n## Safety Boundaries\n- No explicit sexual content.\n- No sexual violence.\n- No sexual content involving minors.\n`;
