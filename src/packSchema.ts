import { z } from 'zod';
import { WorldPack } from './types';

const entry = z.object({ id: z.string().min(2).regex(/^[a-z0-9-]+$/), name: z.string().min(2), description: z.string().min(8) });
const entries = z.array(entry).min(1);
const unsafe = /(ignore (all|previous)|system prompt|developer message|api[_ -]?key|sexual violence|explicit sex)/i;

export const worldPackSchema = z.object({
  schemaVersion: z.literal('1.0'), id: z.string().min(3), version: z.number().int().positive(), ownerId: z.string(),
  status: z.enum(['draft', 'validation-error', 'ready']),
  metadata: z.object({ title: z.string().min(3), tagline: z.string().min(3), author: z.string().min(2), description: z.string().min(20), contentRating: z.literal('mature-no-explicit-sex') }),
  premise: z.string().min(40), tone: z.array(z.string()).min(1), factions: entries, locations: entries, cultures: entries,
  history: z.array(z.string()).min(1),
  characterOptions: z.object({ backgrounds: entries, strengths: entries, weaknesses: entries, motivations: z.array(entry), motivationsByBackground: z.record(z.string(), entries).optional() }),
  items: entries, rules: z.array(z.string()).min(1), npcs: entries, secrets: entries, scenarioHooks: entries,
  aiGuidance: z.array(z.string()).min(1), safetyBoundaries: z.array(z.string()).min(1), artwork: z.string().optional(),
});

export interface PackValidation { valid: boolean; errors: string[]; warnings: string[]; pack?: WorldPack }

export function validatePack(input: unknown): PackValidation {
  const serialized = JSON.stringify(input);
  if (serialized.length > 500_000) return { valid: false, errors: ['Pack exceeds the 500 KB text limit.'], warnings: [] };
  const result = worldPackSchema.safeParse(input);
  if (!result.success) return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`), warnings: [] };
  const pack = result.data as WorldPack;
  const ids = [...pack.factions, ...pack.locations, ...pack.cultures, ...pack.items, ...pack.npcs, ...pack.secrets, ...pack.scenarioHooks].map(x => x.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  const errors = duplicates.length ? [`Duplicate identifiers: ${[...new Set(duplicates)].join(', ')}`] : [];
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
