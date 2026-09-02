import { detailedWorldSchema } from './campaign-schema.ts';
import { personaliseCampaignWorld } from './campaign-world.ts';
import { responseText, responseFailure } from './world-response.ts';

const opening: any = structuredClone(detailedWorldSchema.properties.openingScenario);
opening.required = opening.required.filter((key: string) => key !== 'playerPreset');
delete opening.properties.playerPreset;
const properties = {
  canonicalPlayerName: { type: 'string' },
  openingScenario: opening,
  locations: { ...detailedWorldSchema.properties.locations, minItems: 0, maxItems: 3 },
  npcs: { ...detailedWorldSchema.properties.npcs, minItems: 0, maxItems: 6 },
  characterProfiles: { ...detailedWorldSchema.properties.characterProfiles, minItems: 0, maxItems: 6 },
  worldEvents: { ...detailedWorldSchema.properties.worldEvents, minItems: 0, maxItems: 3 },
  secretSystems: { ...detailedWorldSchema.properties.secretSystems, minItems: 0, maxItems: 3 },
};
const schema = { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };

export async function prepareCampaign(service: any, ownerId: string, jobId: string, base: any, character: any) {
  const row = await service.from('background_jobs').select('checkpoint').eq('id', jobId).eq('owner_id', ownerId).single();
  if (row.error) throw row.error;
  const checkpoint = row.data?.checkpoint || {};
  if (checkpoint.preparedWorld) return { pack: checkpoint.preparedWorld };
  const save = async (percent: number, message: string) => {
    const result = await service.from('background_jobs').update({ checkpoint, progress_stage: 'preparing_campaign', progress_percent: percent, progress_message: message, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId).eq('owner_id', ownerId);
    if (result.error) throw result.error;
  };
  const headers = { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' };
  if (!checkpoint.campaignResponseId) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_WORLD_MODEL') || 'gpt-5.6-terra', background: true, store: true,
        max_output_tokens: 10000, reasoning: { effort: 'low' },
        instructions: `Prepare ONE campaign in the supplied reusable world at its stated era and region. The supplied character is the player. If their name clearly identifies a canonical person in this setting (for example Tyrion Lannister in A Song of Ice and Fire), use that identity and its established history, position, knowledge and relationships at this date. Return the canonical name, or an empty string for an original character or uncertain match. Never create a second version of the player as an NPC. Do not confuse a shared first name with a certain identity. Choose an appropriate starting place and situation for this character. Keep the cast small: only 3–6 immediately relevant people, fewer if appropriate. Other characters can enter during play. Respect primary canon and the requested era; mark uncertain knowledge as uncertain. Existing NPC and location IDs must be reused exactly. New IDs must be unique lowercase slugs. Each NPC needs one matching profile. Secrets may reference only returned NPC IDs or 'player'. Add at most three new locations only if the opening needs them. Write a 150–250 word original opening with an exact place, people physically present, and a meaningful decision; never decide the player's speech or actions. Include plausible personal equipment, established relationships and memories. Populate openingScenario.characterConnections with established ties between NPCs, including family, friendship, rivalry, romance, service and loyalty where supported at this era. Use sourceId and targetId from NPC IDs or 'player'; relationshipType describes the source relative to the target (parent means source is target's parent). Several roles can coexist. Include only relationships the player already knows; private means known to the player but not public. Do not invent ties to fill the list. Return three immediately possible suggestions. Keep descriptions concise. World events must be conditional, never predetermined future outcomes. Preserve player agency and information/travel limits. Do not copy source passages. No explicit sexual content, sexual violence, or sexual content involving minors.`,
        input: JSON.stringify({ world: base, character }),
        text: { format: { type: 'json_schema', name: 'campaign_preparation', strict: true, schema } },
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.id) throw new Error(payload.error?.message || 'Could not start campaign preparation.');
    checkpoint.campaignResponseId = payload.id;
    await save(20, 'Preparing your character’s place in the world and the opening cast.');
    return { pending: true };
  }
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(checkpoint.campaignResponseId)}`, { headers, signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Could not check campaign preparation.');
  if (['queued', 'in_progress'].includes(payload.status)) {
    await save(35, 'Preparing the opening scene and relevant characters.');
    return { pending: true };
  }
  if (payload.status !== 'completed') throw new Error(responseFailure(payload, 'Campaign preparation'));
  const pack = personaliseCampaignWorld(base, JSON.parse(responseText(payload)), character.name);
  checkpoint.preparedWorld = pack;
  checkpoint.campaignUsage = payload.usage;
  await save(65, 'Campaign prepared. Saving your player and the surrounding cast.');
  try { await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(checkpoint.campaignResponseId)}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) }); } catch { /* Saved preparation can still be resumed. */ }
  return { pack };
}
