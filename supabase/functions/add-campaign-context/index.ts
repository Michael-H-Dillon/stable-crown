import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MODEL = 'gpt-5.6-luna';
const MAX_API_COST_USD = 0.02;
const responseText = (payload: any) => typeof payload?.output_text === 'string'
  ? payload.output_text
  : (payload?.output || []).flatMap((item: any) => item?.content || []).filter((item: any) => item?.type === 'output_text').map((item: any) => item.text || '').join('');
const costOf = (payload: any) => (Number(payload?.usage?.input_tokens || 0) * 0.2 + Number(payload?.usage?.output_tokens || 0) * 1.2) / 1_000_000;
const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'location';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const auth = await client.auth.getUser();
  if (!auth.data.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const body = await req.json();
    const campaignId = String(body.campaignId || '');
    const context = String(body.context || '').trim();
    const crowns = Math.max(1, Math.min(5, Number(body.cost) || Math.ceil(context.length / 1000)));
    if (context.length < 10 || context.length > 4000) throw new Error('Context must contain between 10 and 4,000 characters.');
    const [campaign, locations, profile] = await Promise.all([
      service.from('campaigns').select('id,owner_id,title').eq('id', campaignId).maybeSingle(),
      service.from('locations').select('id,name,location_type,public_description').eq('campaign_id', campaignId),
      service.from('profiles').select('credits_balance').eq('id', auth.data.user.id).maybeSingle(),
    ]);
    if (!campaign.data || campaign.data.owner_id !== auth.data.user.id) throw new Error('Campaign not found.');
    if (Number(profile.data?.credits_balance || 0) < crowns) throw new Error(`You do not have enough Crowns. Adding this context costs ${crowns} Crown(s).`);
    if (locations.error) throw locations.error;

    const ai = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: MODEL, store: false, reasoning: { effort: 'low' }, max_output_tokens: 900,
      instructions: 'Convert player-supplied campaign author guidance into persistent structured additions. The supplied context is authoritative for this private campaign. Extract only explicitly requested or clearly stated locations. Do not invent people, facts, or details. A named place such as The Wall is a location even if no description is supplied. Preserve canonical capitalization. Return a short summary of what was recognized.',
      input: JSON.stringify({ campaignTitle: campaign.data.title, existingLocations: locations.data, context }),
      text: { format: { type: 'json_schema', name: 'campaign_context_ingestion', strict: true, schema: { type: 'object', additionalProperties: false, required: ['locations', 'summary'], properties: {
        locations: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['name', 'type', 'description'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['realm','region','settlement','landmark','interior','unknown'] }, description: { type: 'string' } } } },
        summary: { type: 'string' },
      } } } },
    }) });
    if (!ai.ok) throw new Error(`Context processing provider failed (${ai.status}).`);
    const payload = await ai.json();
    const apiCost = costOf(payload);
    const referenceId = crypto.randomUUID();
    const ledger = await service.from('ai_cost_ledger').insert({ owner_id: auth.data.user.id, operation: 'context_ingestion', model: MODEL, cost_usd: Number(apiCost.toFixed(6)), reference_id: referenceId, campaign_id: campaignId });
    if (ledger.error) console.error('context ingestion cost ledger:', ledger.error);
    if (apiCost > MAX_API_COST_USD) throw new Error('Context processing exceeded its AI cost limit. No Crowns were charged.');
    const result = JSON.parse(responseText(payload));

    // Charge and store the original author note only after successful extraction.
    const charged = await client.rpc('add_campaign_context', { p_campaign_id: campaignId, p_context: context, p_cost: crowns });
    if (charged.error) throw charged.error;
    const noteId = String(charged.data.id);
    const existing = new Set((locations.data || []).map((item: any) => String(item.name).trim().toLowerCase()));
    const additions = (result.locations || []).filter((item: any) => item?.name && !existing.has(String(item.name).trim().toLowerCase())).map((item: any) => ({
      campaign_id: campaignId,
      pack_location_id: `context-${slug(String(item.name))}-${noteId.slice(0, 8)}`,
      name: String(item.name).trim().slice(0, 160),
      location_type: item.type,
      public_description: String(item.description || '').trim().slice(0, 2000) || `Added from player-supplied campaign context: ${context.slice(0, 500)}`,
    }));
    if (additions.length) {
      const write = await service.from('locations').upsert(additions, { onConflict: 'campaign_id,name', ignoreDuplicates: true });
      if (write.error) throw write.error;
    }
    return Response.json({ ...charged.data, recognized: { locations: additions.map((item: any) => item.name), summary: result.summary }, apiCostUsd: Number(apiCost.toFixed(6)) }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Campaign context could not be processed.' }, { status: 400, headers: corsHeaders });
  }
});
