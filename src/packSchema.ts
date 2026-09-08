import { z } from 'zod';
import { WorldPack } from './types';

const entry = z.object({ id: z.string().min(2).regex(/^[a-z0-9-]+$/), name: z.string().min(2), description: z.string().min(8) });
const entries = z.array(entry).min(1);
const awareness = z.object({ entityId: z.string().min(2), level: z.enum(['none','suspects','knows']), suspicion: z.number().int().min(0).max(100) });
const openingScenario = z.object({ id: z.string().min(2), title: z.string().min(3), chapterLabel: z.string().min(3), narration: z.string().min(40), startLocationId: z.string().min(2), startingInventory: z.array(z.string()), memories: z.array(z.string()), unresolvedThreads: z.array(z.string()), sceneFacts: z.array(z.string()), suggestions: z.array(z.string().min(3)).min(1).max(5).optional(), relationships: z.record(z.string(), z.number().min(-100).max(100)).optional(), characterConnections: z.array(z.object({ sourceId: z.string().min(1), targetId: z.string().min(1), sentimentScore: z.number().int().min(-100).max(100).nullable().optional(), relationshipType: z.string().min(2).max(60), status: z.enum(['active','former']), private: z.boolean(), reason: z.string().min(3).max(1000) })).optional(), relationshipRoles: z.array(z.object({ entityName:z.string().min(2),relationshipType:z.string().min(2).max(60),private:z.boolean().optional(),reason:z.string().min(3).max(500) })).optional(), calendar: z.object({ name: z.string().min(2), year: z.string().min(1), day: z.number().int().positive(), segment: z.string().min(2) }), playerPreset: z.object({ name: z.string().min(2), pronouns: z.string().min(2), backgroundId: z.string().min(2), strengthId: z.string().min(2), weaknessId: z.string().min(2), motivationId: z.string().min(2) }).optional() });
const characterProfile = z.object({ npcId: z.string().min(2), startingLocation: z.object({ locationId: z.string().min(2), confidence: z.enum(['low','medium','high','confirmed']), reason: z.string().min(5) }).optional(), values: z.array(z.string().min(2)).min(1), goals: z.array(z.string().min(2)).min(1), loyalties: z.array(z.string().min(2)), canonBehaviors: z.array(z.string().min(2)).min(1).optional(), persuasion: z.object({ baseDifficulty: z.enum(['easy','moderate','hard','extreme']), leverage: z.array(z.string().min(2)), relationshipThresholds: z.object({ cooperative: z.number().int().min(-100).max(100), majorRisk: z.number().int().min(-100).max(100) }) }) });
const unsafe = /(ignore (all|previous)|system prompt|developer message|api[_ -]?key)/i;

export const worldPackSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'), id: z.string().min(3), version: z.number().int().positive().default(1), ownerId: z.string().default(''),
  status: z.enum(['draft', 'validation-error', 'ready']).default('ready'),
  metadata: z.object({ title: z.string().min(3), tagline: z.string().min(3), author: z.string().min(2), description: z.string().min(20), contentRating: z.literal('mature-no-explicit-sex') }),
  premise: z.string().min(40), tone: z.array(z.string()).min(1), factions: entries, locations: entries, cultures: entries,
  history: z.array(z.string()).min(1),
  characterOptions: z.object({ backgrounds: entries, strengths: entries, weaknesses: entries, motivations: z.array(entry), motivationsByBackground: z.record(z.string(), entries).optional() }),
  items: entries, rules: z.array(z.string()).min(1), npcs: z.array(entry), secrets: entries, scenarioHooks: entries,
  aiGuidance: z.array(z.string()).min(1), safetyBoundaries: z.array(z.string()).min(1),
  worldContext: z.object({ kind: z.enum(['existing','original']), setting: z.string().optional(), era: z.string(), region: z.string(), genre: z.string(), description: z.string() }).optional(),
  openingScenario: openingScenario.optional(),
  characterProfiles: z.array(characterProfile).optional(),
  worldEvents: z.array(z.object({ id: z.string().min(2), name: z.string().min(3), description: z.string().min(10), earliestDay: z.number().int().positive(), latestDay: z.number().int().positive(), conditions: z.array(z.string()) })).optional(),
  secretSystems: z.array(z.object({ id: z.string().min(2), name: z.string().min(3), description: z.string().min(10), stakes: z.array(z.string()).min(1), initialAwareness: z.array(awareness), evidenceTypes: z.array(z.string()).min(1) })).optional(),
  researchSources: z.array(z.object({ title: z.string().min(1), url: z.string().url() })).optional(),
  artwork: z.string().optional(),
});

export interface PackValidation { valid: boolean; errors: string[]; warnings: string[]; pack?: WorldPack }
export interface LocationNameConflict { normalizedName: string; entries: WorldPack['locations'] }

// JSON imports are deterministically validated and stored; no AI runs during import.
export const estimatePackImportCredits = (_input: unknown) => 0;

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

const safeSlug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'private-world';

/** Converts the public authoring format into the canonical representation used after import. */
export function normalizeWorldPackInput(input: unknown, author = 'Player', ownerId = ''): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const source = input as Record<string, unknown>;
  const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata as Record<string, unknown> : {};
  const title = typeof metadata.title === 'string' ? metadata.title : '';
  return { ...source, schemaVersion: source.schemaVersion ?? '1.0', id: typeof source.id === 'string' && source.id.trim() ? safeSlug(source.id) : safeSlug(title), version: typeof source.version === 'number' ? source.version : 1, ownerId, status: 'ready', metadata: { ...metadata, author: typeof metadata.author === 'string' && metadata.author.trim() ? metadata.author : author } };
}

export function validatePack(input: unknown, defaults?: { author?: string; ownerId?: string }): PackValidation {
  const normalized = normalizeWorldPackInput(input, defaults?.author || 'Player', defaults?.ownerId || '');
  const serialized = JSON.stringify(normalized);
  if (serialized.length > 500_000) return { valid: false, errors: ['Pack exceeds the 500 KB text limit.'], warnings: [] };
  const result = worldPackSchema.safeParse(normalized);
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
  if (pack.secretSystems) for (const secret of pack.secretSystems) for (const state of secret.initialAwareness) if (state.entityId !== 'player' && !pack.npcs.some(npc => npc.id === state.entityId)) errors.push(`Secret ${secret.id} references missing entity: ${state.entityId}`);
  if (pack.characterProfiles) for (const profile of pack.characterProfiles) if (!pack.npcs.some(npc => npc.id === profile.npcId)) errors.push(`Character profile references missing NPC: ${profile.npcId}`);
  if (pack.characterProfiles) for (const profile of pack.characterProfiles) if (profile.startingLocation && !pack.locations.some(location => location.id === profile.startingLocation!.locationId)) errors.push(`Character profile ${profile.npcId} references missing starting location: ${profile.startingLocation.locationId}`);
  if (unsafe.test(serialized)) errors.push('Pack contains unsafe or disallowed instructions/content.');
  const warnings = pack.factions.length < 2 ? ['Political worlds work best with at least two factions.'] : [];
  return { valid: errors.length === 0, errors, warnings, pack: errors.length ? undefined : pack };
}

export const worldPackJsonSchema = {
  '$schema': 'https://json-schema.org/draft/2020-12/schema', title: 'Sable Crown World Pack', type: 'object',
  required: ['metadata', 'premise', 'tone', 'factions', 'locations', 'cultures', 'history', 'characterOptions', 'items', 'rules', 'npcs', 'secrets', 'scenarioHooks', 'aiGuidance', 'safetyBoundaries'],
  properties: { schemaVersion: { const: '1.0', default: '1.0' }, metadata: { type: 'object' } },
};

export const markdownTemplate = `# Sable Crown World Pack\n\n> schemaVersion: 1.0\n> id: your-world-id\n> version: 1\n\n## Metadata\nTitle: Your World\nTagline: A short promise\nAuthor: Your name\nDescription: At least twenty characters describing the world.\nContent rating: mature-no-explicit-sex\n\n## Premise\nAt least forty characters establishing the central conflict.\n\n## Tone\n- grounded intrigue\n\n## Factions\n### faction-id | Faction Name\nA meaningful description.\n\n## Locations\n### location-id | Location Name\nA meaningful description.\n\n## Cultures\n### culture-id | Culture Name\nA meaningful description.\n\n## History\n- A defining event.\n\n## Character Backgrounds\n### background-id | Background Name\nA meaningful description.\n\n## Strengths\n### strength-id | Strength Name\nA meaningful description.\n\n## Weaknesses\n### weakness-id | Weakness Name\nA meaningful description.\n\n## Motivations\n### motivation-id | Motivation Name\nA meaningful description.\n\n## Items\n### item-id | Item Name\nA meaningful description.\n\n## Rules\n- A rule of the world.\n\n## NPCs\n### npc-id | NPC Name\nA meaningful description.\n\n## Secrets\n### secret-id | Secret Name\nA meaningful description.\n\n## Scenario Hooks\n### hook-id | Hook Name\nA meaningful description.\n\n## AI Guidance\n- Never decide the player's thoughts or dialogue.\n\n## Safety Boundaries\n- No explicit sexual content.\n- No sexual violence.\n- No sexual content involving minors.\n`;
