"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownTemplate = exports.worldPackJsonSchema = exports.estimatePackImportCredits = exports.worldPackSchema = void 0;
exports.findLocationNameConflicts = findLocationNameConflicts;
exports.resolveLocationNameConflict = resolveLocationNameConflict;
exports.normalizeWorldPackInput = normalizeWorldPackInput;
exports.validatePack = validatePack;
const zod_1 = require("zod");
const entry = zod_1.z.object({ id: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/), name: zod_1.z.string().min(2), description: zod_1.z.string().min(8) });
const entries = zod_1.z.array(entry).min(1);
const awareness = zod_1.z.object({ entityId: zod_1.z.string().min(2), level: zod_1.z.enum(['none', 'suspects', 'knows']), suspicion: zod_1.z.number().int().min(0).max(100) });
const economicProfile = zod_1.z.object({ id: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/), name: zod_1.z.string().min(2), backgroundIds: zod_1.z.array(zod_1.z.string().min(2)).min(1), currency: zod_1.z.string().min(1), balance: zod_1.z.number().nonnegative(), recurringIncome: zod_1.z.number().nonnegative(), recurringOutgoings: zod_1.z.number().nonnegative(), incomePeriod: zod_1.z.string().min(2), description: zod_1.z.string().min(8) });
const factionEconomicProfile = zod_1.z.object({ factionId: zod_1.z.string().min(2), currency: zod_1.z.string().min(1), wealthTier: zod_1.z.enum(['very-rich', 'rich', 'average', 'poor', 'destitute']), balance: zod_1.z.number().nonnegative(), debt: zod_1.z.number().nonnegative().optional(), recurringIncome: zod_1.z.number().nonnegative(), recurringOutgoings: zod_1.z.number().nonnegative(), incomePeriod: zod_1.z.string().min(2), description: zod_1.z.string().min(8) });
const openingScenario = zod_1.z.object({ id: zod_1.z.string().min(2), title: zod_1.z.string().min(3), chapterLabel: zod_1.z.string().min(3), narration: zod_1.z.string().min(40), startLocationId: zod_1.z.string().min(2), startingInventory: zod_1.z.array(zod_1.z.string()), memories: zod_1.z.array(zod_1.z.string()), unresolvedThreads: zod_1.z.array(zod_1.z.string()), sceneFacts: zod_1.z.array(zod_1.z.string()), suggestions: zod_1.z.array(zod_1.z.string().min(3)).min(1).max(5).optional(), relationships: zod_1.z.record(zod_1.z.string(), zod_1.z.number().min(-100).max(100)).optional(), characterConnections: zod_1.z.array(zod_1.z.object({ sourceId: zod_1.z.string().min(1), targetId: zod_1.z.string().min(1), relationshipType: zod_1.z.string().min(2).max(60), status: zod_1.z.enum(['active', 'former']), private: zod_1.z.boolean(), reason: zod_1.z.string().min(3).max(1000) })).optional(), relationshipRoles: zod_1.z.array(zod_1.z.object({ entityName: zod_1.z.string().min(2), relationshipType: zod_1.z.string().min(2).max(60), private: zod_1.z.boolean().optional(), reason: zod_1.z.string().min(3).max(500) })).optional(), calendar: zod_1.z.object({ name: zod_1.z.string().min(2), year: zod_1.z.string().min(1), day: zod_1.z.number().int().positive(), segment: zod_1.z.string().min(2) }), playerPreset: zod_1.z.object({ name: zod_1.z.string().min(2), pronouns: zod_1.z.string().min(2), backgroundId: zod_1.z.string().min(2), strengthId: zod_1.z.string().min(2), weaknessId: zod_1.z.string().min(2), motivationId: zod_1.z.string().min(2) }).optional() });
const characterProfile = zod_1.z.object({ npcId: zod_1.z.string().min(2), startingLocation: zod_1.z.object({ locationId: zod_1.z.string().min(2), confidence: zod_1.z.enum(['low', 'medium', 'high', 'confirmed']), reason: zod_1.z.string().min(5) }).optional(), values: zod_1.z.array(zod_1.z.string().min(2)).min(1), goals: zod_1.z.array(zod_1.z.string().min(2)).min(1), loyalties: zod_1.z.array(zod_1.z.string().min(2)), canonBehaviors: zod_1.z.array(zod_1.z.string().min(2)).min(1).optional(), persuasion: zod_1.z.object({ baseDifficulty: zod_1.z.enum(['easy', 'moderate', 'hard', 'extreme']), leverage: zod_1.z.array(zod_1.z.string().min(2)), relationshipThresholds: zod_1.z.object({ cooperative: zod_1.z.number().int().min(-100).max(100), majorRisk: zod_1.z.number().int().min(-100).max(100) }) }) });
const unsafe = /(ignore (all|previous)|system prompt|developer message|api[_ -]?key)/i;
exports.worldPackSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal('1.0').default('1.0'), id: zod_1.z.string().min(3), version: zod_1.z.number().int().positive().default(1), ownerId: zod_1.z.string().default(''),
    status: zod_1.z.enum(['draft', 'validation-error', 'ready']).default('ready'),
    metadata: zod_1.z.object({ title: zod_1.z.string().min(3), tagline: zod_1.z.string().min(3), author: zod_1.z.string().min(2), description: zod_1.z.string().min(20), contentRating: zod_1.z.literal('mature-no-explicit-sex') }),
    premise: zod_1.z.string().min(40), tone: zod_1.z.array(zod_1.z.string()).min(1), factions: entries, locations: entries, cultures: entries,
    history: zod_1.z.array(zod_1.z.string()).min(1),
    characterOptions: zod_1.z.object({ backgrounds: entries, strengths: entries, weaknesses: entries, motivations: zod_1.z.array(entry), motivationsByBackground: zod_1.z.record(zod_1.z.string(), entries).optional() }),
    items: entries, rules: zod_1.z.array(zod_1.z.string()).min(1), npcs: zod_1.z.array(entry), secrets: entries, scenarioHooks: entries,
    aiGuidance: zod_1.z.array(zod_1.z.string()).min(1), safetyBoundaries: zod_1.z.array(zod_1.z.string()).min(1),
    worldContext: zod_1.z.object({ kind: zod_1.z.enum(['existing', 'original']), setting: zod_1.z.string().optional(), era: zod_1.z.string(), region: zod_1.z.string(), genre: zod_1.z.string(), description: zod_1.z.string() }).optional(),
    openingScenario: openingScenario.optional(),
    characterProfiles: zod_1.z.array(characterProfile).optional(),
    worldEvents: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string().min(2), name: zod_1.z.string().min(3), description: zod_1.z.string().min(10), earliestDay: zod_1.z.number().int().positive(), latestDay: zod_1.z.number().int().positive(), conditions: zod_1.z.array(zod_1.z.string()) })).optional(),
    secretSystems: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string().min(2), name: zod_1.z.string().min(3), description: zod_1.z.string().min(10), stakes: zod_1.z.array(zod_1.z.string()).min(1), initialAwareness: zod_1.z.array(awareness), evidenceTypes: zod_1.z.array(zod_1.z.string()).min(1) })).optional(),
    economicProfiles: zod_1.z.array(economicProfile).optional(),
    factionEconomicProfiles: zod_1.z.array(factionEconomicProfile).optional(),
    researchSources: zod_1.z.array(zod_1.z.object({ title: zod_1.z.string().min(1), url: zod_1.z.string().url() })).optional(),
    artwork: zod_1.z.string().optional(),
});
// JSON imports are deterministically validated and stored; no AI runs during import.
const estimatePackImportCredits = (_input) => 0;
exports.estimatePackImportCredits = estimatePackImportCredits;
function findLocationNameConflicts(pack) {
    const groups = new Map();
    for (const location of pack.locations || []) {
        const key = location.name.trim().toLocaleLowerCase();
        groups.set(key, [...(groups.get(key) || []), location]);
    }
    return [...groups.entries()].filter(([, locations]) => locations.length > 1).map(([normalizedName, entries]) => ({ normalizedName, entries }));
}
function resolveLocationNameConflict(pack, conflict, action, primaryId, customNames) {
    const ids = new Set(conflict.entries.map(entry => entry.id));
    if (action === 'rename') {
        const locations = pack.locations.map(location => ids.has(location.id) ? { ...location, name: customNames?.[location.id]?.trim() || `${location.name} (${location.id.replaceAll('-', ' ')})` } : location);
        return { ...pack, locations };
    }
    const primary = conflict.entries.find(entry => entry.id === primaryId);
    if (!primary)
        throw new Error('Choose which location should be retained.');
    const removedIds = new Set([...ids].filter(id => id !== primary.id));
    const referencedRemovedId = pack.openingScenario && removedIds.has(pack.openingScenario.startLocationId);
    if (action === 'keep' && referencedRemovedId)
        throw new Error('A discarded location is referenced by the opening scenario. Merge these locations instead, or rename them.');
    return {
        ...pack,
        locations: pack.locations.filter(location => !removedIds.has(location.id)),
        ...(action === 'merge' && pack.openingScenario && ids.has(pack.openingScenario.startLocationId) ? { openingScenario: { ...pack.openingScenario, startLocationId: primary.id } } : {}),
    };
}
const safeSlug = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'private-world';
/** Converts the public authoring format into the canonical representation used after import. */
function normalizeWorldPackInput(input, author = 'Player', ownerId = '') {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return input;
    const source = input;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {};
    const title = typeof metadata.title === 'string' ? metadata.title : '';
    return { ...source, schemaVersion: source.schemaVersion ?? '1.0', id: typeof source.id === 'string' && source.id.trim() ? safeSlug(source.id) : safeSlug(title), version: typeof source.version === 'number' ? source.version : 1, ownerId, status: 'ready', metadata: { ...metadata, author: typeof metadata.author === 'string' && metadata.author.trim() ? metadata.author : author } };
}
function validatePack(input, defaults) {
    const normalized = normalizeWorldPackInput(input, defaults?.author || 'Player', defaults?.ownerId || '');
    const serialized = JSON.stringify(normalized);
    if (serialized.length > 500_000)
        return { valid: false, errors: ['Pack exceeds the 500 KB text limit.'], warnings: [] };
    const result = exports.worldPackSchema.safeParse(normalized);
    if (!result.success)
        return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`), warnings: [] };
    const pack = result.data;
    const ids = [...pack.factions, ...pack.locations, ...pack.cultures, ...pack.items, ...pack.npcs, ...pack.secrets, ...pack.scenarioHooks].map(x => x.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    const errors = duplicates.length ? [`Duplicate identifiers: ${[...new Set(duplicates)].join(', ')}`] : [];
    for (const [label, collection] of [['location', pack.locations], ['character', pack.npcs]]) {
        const normalizedNames = collection.map(item => item.name.trim().toLocaleLowerCase());
        const duplicateNames = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index);
        if (duplicateNames.length)
            errors.push(`Duplicate ${label} names: ${[...new Set(duplicateNames)].join(', ')}. Give each ${label} a unique, disambiguated name.`);
    }
    if (pack.openingScenario && !pack.locations.some(location => location.id === pack.openingScenario.startLocationId))
        errors.push(`Opening scenario references missing location: ${pack.openingScenario.startLocationId}`);
    if (pack.economicProfiles)
        for (const profile of pack.economicProfiles)
            for (const backgroundId of profile.backgroundIds)
                if (!pack.characterOptions.backgrounds.some(background => background.id === backgroundId))
                    errors.push(`Economic profile ${profile.id} references missing background: ${backgroundId}`);
    if (pack.factionEconomicProfiles) {
        const seenFactions = new Set();
        for (const profile of pack.factionEconomicProfiles) {
            if (!pack.factions.some(faction => faction.id === profile.factionId))
                errors.push(`Faction economic profile references missing faction: ${profile.factionId}`);
            if (seenFactions.has(profile.factionId))
                errors.push(`Duplicate faction economic profile: ${profile.factionId}`);
            seenFactions.add(profile.factionId);
        }
    }
    if (pack.secretSystems)
        for (const secret of pack.secretSystems)
            for (const state of secret.initialAwareness)
                if (state.entityId !== 'player' && !pack.npcs.some(npc => npc.id === state.entityId))
                    errors.push(`Secret ${secret.id} references missing entity: ${state.entityId}`);
    if (pack.characterProfiles)
        for (const profile of pack.characterProfiles)
            if (!pack.npcs.some(npc => npc.id === profile.npcId))
                errors.push(`Character profile references missing NPC: ${profile.npcId}`);
    if (pack.characterProfiles)
        for (const profile of pack.characterProfiles)
            if (profile.startingLocation && !pack.locations.some(location => location.id === profile.startingLocation.locationId))
                errors.push(`Character profile ${profile.npcId} references missing starting location: ${profile.startingLocation.locationId}`);
    if (unsafe.test(serialized))
        errors.push('Pack contains unsafe or disallowed instructions/content.');
    const warnings = pack.factions.length < 2 ? ['Political worlds work best with at least two factions.'] : [];
    return { valid: errors.length === 0, errors, warnings, pack: errors.length ? undefined : pack };
}
exports.worldPackJsonSchema = {
    '$schema': 'https://json-schema.org/draft/2020-12/schema', title: 'Sable Crown World Pack', type: 'object',
    required: ['metadata', 'premise', 'tone', 'factions', 'locations', 'cultures', 'history', 'characterOptions', 'items', 'rules', 'npcs', 'secrets', 'scenarioHooks', 'aiGuidance', 'safetyBoundaries'],
    properties: { schemaVersion: { const: '1.0', default: '1.0' }, metadata: { type: 'object' } },
};
exports.markdownTemplate = `# Sable Crown World Pack\n\n> schemaVersion: 1.0\n> id: your-world-id\n> version: 1\n\n## Metadata\nTitle: Your World\nTagline: A short promise\nAuthor: Your name\nDescription: At least twenty characters describing the world.\nContent rating: mature-no-explicit-sex\n\n## Premise\nAt least forty characters establishing the central conflict.\n\n## Tone\n- grounded intrigue\n\n## Factions\n### faction-id | Faction Name\nA meaningful description.\n\n## Locations\n### location-id | Location Name\nA meaningful description.\n\n## Cultures\n### culture-id | Culture Name\nA meaningful description.\n\n## History\n- A defining event.\n\n## Character Backgrounds\n### background-id | Background Name\nA meaningful description.\n\n## Strengths\n### strength-id | Strength Name\nA meaningful description.\n\n## Weaknesses\n### weakness-id | Weakness Name\nA meaningful description.\n\n## Motivations\n### motivation-id | Motivation Name\nA meaningful description.\n\n## Items\n### item-id | Item Name\nA meaningful description.\n\n## Rules\n- A rule of the world.\n\n## NPCs\n### npc-id | NPC Name\nA meaningful description.\n\n## Secrets\n### secret-id | Secret Name\nA meaningful description.\n\n## Scenario Hooks\n### hook-id | Hook Name\nA meaningful description.\n\n## AI Guidance\n- Never decide the player's thoughts or dialogue.\n\n## Safety Boundaries\n- No explicit sexual content.\n- No sexual violence.\n- No sexual content involving minors.\n`;
