const identity = (value: unknown) => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Build campaign-local data; never mutate the reusable saved version. */
export function personaliseCampaignWorld(base: any, additions: any, playerName: string) {
  const pack = structuredClone(base);
  const playerNames = new Set([identity(playerName), identity(additions.canonicalPlayerName)].filter(Boolean));
  const merged = (original: any[] = [], extra: any[] = []) => {
    const result = [...original];
    for (const item of extra) {
      const index = result.findIndex(old => old.id === item.id || identity(old.name) === identity(item.name));
      if (index >= 0) continue; // Imported facts remain authoritative.
      else result.push(item);
    }
    return result;
  };
  pack.locations = merged(pack.locations, additions.locations);
  const cast = merged(pack.npcs, additions.npcs);
  const playerIds = new Set(cast.filter((npc: any) => playerNames.has(identity(npc.name))).map((npc: any) => npc.id));
  pack.npcs = cast.filter((npc: any) => !playerIds.has(npc.id));
  const preserveByKey = (original: any[] = [], extra: any[] = [], key = 'id') => {
    const result = structuredClone(original);
    for (const item of extra) if (!result.some((old: any) => old[key] === item[key])) result.push(structuredClone(item));
    return result;
  };
  pack.characterProfiles = preserveByKey(pack.characterProfiles, additions.characterProfiles, 'npcId').filter((profile: any) => !playerIds.has(profile.npcId));
  pack.characterAttributes = structuredClone(additions.characterAttributes || []).filter((entry: any) => !playerIds.has(entry.npcId));
  pack.worldEvents = preserveByKey(pack.worldEvents, additions.worldEvents);
  pack.secretSystems = preserveByKey(pack.secretSystems, additions.secretSystems);
  pack.canonEvents = structuredClone(additions.canonEvents || []);
  const samePresetPlayer = playerNames.has(identity(base.openingScenario?.playerPreset?.name));
  for (const secret of pack.secretSystems) {
    const importedSecret = (base.secretSystems || []).find((entry: any) => entry.id === secret.id);
    if (importedSecret && !samePresetPlayer) {
      secret.initialAwareness = (secret.initialAwareness || []).filter((state: any) => state.entityId !== 'player');
      const playerAwareness = (additions.secretSystems || []).find((entry: any) => entry.id === secret.id)?.initialAwareness?.filter((state: any) => state.entityId === 'player') || [];
      secret.initialAwareness.push(...playerAwareness);
    }
    secret.initialAwareness = (secret.initialAwareness || []).map((state: any) => ({ ...state, entityId: playerIds.has(state.entityId) ? 'player' : state.entityId }));
  }
  pack.openingScenario = structuredClone(additions.openingScenario || pack.openingScenario);
  if (pack.openingScenario) {
    const connectionKey = (c: any) => `${c.sourceId}|${c.targetId}|${identity(c.relationshipType)}`;
    const connections = new Map<string, any>();
    for (const c of [...(additions.openingScenario?.characterConnections || []), ...(base.openingScenario?.characterConnections || []).filter((c: any) => c.sourceId !== 'player' && c.targetId !== 'player')]) connections.set(connectionKey(c), structuredClone(c));
    pack.openingScenario.characterConnections = [...connections.values()];
  }
  if (pack.openingScenario) {
    delete pack.openingScenario.playerPreset;
    const relations = pack.openingScenario.relationships || {};
    pack.openingScenario.relationships = Object.fromEntries((Array.isArray(relations) ? relations.map((r: any) => [r.name, r.score]) : Object.entries(relations)).filter(([name]: any) => !playerNames.has(identity(name))));
    pack.openingScenario.relationshipRoles = (pack.openingScenario.relationshipRoles || []).filter((role: any) => !playerNames.has(identity(role.entityName)));
  }
  const locationIds = new Set(pack.locations.map((location: any) => location.id));
  const npcIds = new Set(pack.npcs.map((npc: any) => npc.id));
  if (pack.openingScenario) {
    pack.openingScenario.characterConnections = (pack.openingScenario.characterConnections || []).map((connection: any) => ({
      ...connection,
      sourceId: playerIds.has(connection.sourceId) ? 'player' : connection.sourceId,
      targetId: playerIds.has(connection.targetId) ? 'player' : connection.targetId,
    })).filter((connection: any) => connection.sourceId !== connection.targetId);
    for (const connection of pack.openingScenario.characterConnections) {
      if (![connection.sourceId, connection.targetId].every(id => id === 'player' || npcIds.has(id))) throw new Error('Campaign relationship references a missing character.');
    }
  }
  if (!pack.openingScenario?.narration || !locationIds.has(pack.openingScenario.startLocationId)) throw new Error('Campaign opening references a missing location.');
  for (const profile of pack.characterProfiles) {
    if (!npcIds.has(profile.npcId) || (profile.startingLocation && !locationIds.has(profile.startingLocation.locationId))) throw new Error('Campaign character profile has an invalid reference.');
  }
  for (const secret of pack.secretSystems) for (const state of secret.initialAwareness) {
    if (state.entityId !== 'player' && !npcIds.has(state.entityId)) throw new Error('Campaign secret references a missing character.');
  }
  pack.aiGuidance = [...(pack.aiGuidance || []), `The player is ${playerName}${additions.canonicalPlayerName ? ` (${additions.canonicalPlayerName})` : ''}. Never introduce this same person as an NPC. Add other characters only when they become relevant.`];
  return pack;
}
