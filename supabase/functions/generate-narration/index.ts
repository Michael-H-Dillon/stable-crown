import { AI_MODELS } from '../_shared/ai-config.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  let narrationId: string | undefined;
  try {
    // Opportunistic retention cleanup. Expired audio is never served, and active
    // use of the narration service continuously removes old private objects.
    const expired = await service.from('turn_narrations').select('id,storage_path').eq('status', 'ready').lt('expires_at', new Date().toISOString()).limit(100);
    if (!expired.error && expired.data?.length) {
      const paths = expired.data.map((item: any) => item.storage_path).filter(Boolean);
      if (paths.length) await service.storage.from('narration-audio').remove(paths);
      await service.from('turn_narrations').delete().in('id', expired.data.map((item: any) => item.id));
    }
    const { turnId, campaignId, source = turnId ? 'turn' : 'opening', action = 'generate' } = await req.json();
    const isOpening = source === 'opening';
    let costCampaignId: string | null = isOpening ? campaignId : null;
    if (isOpening ? typeof campaignId !== 'string' : typeof turnId !== 'string') throw new Error(isOpening ? 'A campaign is required.' : 'A story turn is required.');
    let narrationText = '';
    let sourceQuery = service.from('turn_narrations').select('id,storage_path').eq('owner_id', auth.user.id);
    sourceQuery = isOpening ? sourceQuery.eq('campaign_id', campaignId).eq('source_kind', 'opening') : sourceQuery.eq('turn_id', turnId).eq('source_kind', 'turn');
    const requestedExpired = await sourceQuery.eq('status', 'ready').lte('expires_at', new Date().toISOString()).maybeSingle();
    if (!requestedExpired.error && requestedExpired.data) {
      if (requestedExpired.data.storage_path) await service.storage.from('narration-audio').remove([requestedExpired.data.storage_path]);
      await service.from('turn_narrations').delete().eq('id', requestedExpired.data.id);
    }
    const model = AI_MODELS.narrationAudio;
    const voice = Deno.env.get('OPENAI_TTS_VOICE') || 'coral';
    if (isOpening) {
      const campaign = await service.from('campaigns').select('id,owner_id,pack_version_id,setup_preferences').eq('id', campaignId).maybeSingle();
      if (campaign.error) throw campaign.error;
      if (!campaign.data || campaign.data.owner_id !== auth.user.id) throw new Error('Campaign not found.');
      const version = await service.from('world_pack_versions').select('content').eq('id', campaign.data.pack_version_id).maybeSingle();
      if (version.error) throw version.error;
      const character = await service.from('characters').select('name').eq('campaign_id', campaignId).eq('traits->>player', 'true').limit(1).maybeSingle();
      if (character.error) throw character.error;
      narrationText = String(campaign.data.setup_preferences?.preparedWorld?.openingScenario?.narration || (version.data?.content as any)?.openingScenario?.narration || '').replaceAll('{name}', character.data?.name || 'the player');
      if (!narrationText) throw new Error('This world has no opening narration.');
    } else {
      const turn = await service.from('campaign_turns').select('id,campaign_id,narration,campaigns!inner(owner_id)').eq('id', turnId).maybeSingle();
      if (turn.error) throw turn.error;
      if (!turn.data || (turn.data.campaigns as any).owner_id !== auth.user.id) throw new Error('Story turn not found.');
      narrationText = turn.data.narration;
      costCampaignId = turn.data.campaign_id;
    }
    const sourceId = isOpening ? campaignId : turnId;
    const downloadName = `sable-crown-${isOpening ? 'opening-' : ''}${sourceId.slice(0, 8)}.mp3`;
    if (action === 'quote') {
      let cachedQuery = service.from('turn_narrations').select('*').eq('owner_id', auth.user.id);
      cachedQuery = isOpening ? cachedQuery.eq('campaign_id', campaignId).eq('source_kind', 'opening') : cachedQuery.eq('turn_id', turnId).eq('source_kind', 'turn');
      const cached = await cachedQuery.gt('expires_at', new Date().toISOString()).maybeSingle();
      if (cached.error) throw cached.error;
      if (cached.data?.status === 'ready' && cached.data.storage_path) {
        const signed = await service.storage.from('narration-audio').createSignedUrl(cached.data.storage_path, 3600);
        if (signed.error) throw signed.error;
        const download = await service.storage.from('narration-audio').createSignedUrl(cached.data.storage_path, 3600, { download: downloadName });
        if (download.error) throw download.error;
        return Response.json({ cached: true, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, expiresAt: cached.data.expires_at, cost: 0, estimatedTokens: cached.data.estimated_text_tokens }, { headers: corsHeaders });
      }
      const estimatedTokens = Math.max(1, Math.ceil(narrationText.length / 4));
      return Response.json({ cached: false, estimatedTokens, cost: Math.max(1, Math.ceil(estimatedTokens / 500)) }, { headers: corsHeaders });
    }
    const claim = isOpening
      ? await userClient.rpc('claim_opening_narration', { p_campaign_id: campaignId, p_model: model, p_voice: voice })
      : await userClient.rpc('claim_turn_narration', { p_turn_id: turnId, p_model: model, p_voice: voice });
    if (claim.error) throw claim.error;
    const claimed: any = claim.data;
    narrationId = claimed.narrationId;
    if (claimed.status === 'ready') {
      const signed = await service.storage.from('narration-audio').createSignedUrl(claimed.storagePath, 3600);
      if (signed.error) throw signed.error;
      const download = await service.storage.from('narration-audio').createSignedUrl(claimed.storagePath, 3600, { download: downloadName });
      if (download.error) throw download.error;
      return Response.json({ cached: true, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, cost: 0, estimatedTokens: claimed.estimatedTokens, creditsRemaining: claimed.creditsRemaining }, { headers: corsHeaders });
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('Narration is not configured.');
    const speech = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, voice, input: claimed.text, instructions: 'Read as an immersive, restrained dark-fantasy audiobook narrator. Preserve the text exactly. Use natural pacing and distinguish quoted dialogue subtly without imitating any real actor.', response_format: 'mp3' }) });
    if (!speech.ok) throw new Error(`Speech provider returned ${speech.status}: ${(await speech.text()).slice(0, 240)}`);
    const audio = new Uint8Array(await speech.arrayBuffer());
    const path = `${auth.user.id}/${isOpening ? 'opening-' : ''}${sourceId}/${narrationId}.mp3`;
    const upload = await service.storage.from('narration-audio').upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    if (upload.error) throw upload.error;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const completed = await service.from('turn_narrations').update({ status: 'ready', storage_path: path, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', narrationId).eq('status', 'generating');
    if (completed.error) throw completed.error;
    const words = String(claimed.text || narrationText).trim().split(/\s+/).filter(Boolean).length;
    const estimatedMinutes = Math.max(1 / 60, words / 150);
    const usdPerMinute = Math.max(0, Number(Deno.env.get('OPENAI_TTS_USD_PER_MINUTE') || 0.015));
    const narrationApiCost = Number((estimatedMinutes * usdPerMinute).toFixed(6));
    const costWrite = await service.from('ai_cost_ledger').upsert({ owner_id: auth.user.id, operation: 'narration', model, cost_usd: narrationApiCost, reference_id: narrationId, campaign_id: costCampaignId }, { onConflict: 'operation,reference_id', ignoreDuplicates: true });
    if (costWrite.error) console.error('Could not record narration AI cost', costWrite.error);
    const signed = await service.storage.from('narration-audio').createSignedUrl(path, 3600);
    if (signed.error) throw signed.error;
    const download = await service.storage.from('narration-audio').createSignedUrl(path, 3600, { download: downloadName });
    if (download.error) throw download.error;
    return Response.json({ cached: false, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, expiresAt, cost: claimed.cost, estimatedTokens: claimed.estimatedTokens, creditsRemaining: claimed.creditsRemaining }, { headers: corsHeaders });
  } catch (error) {
    if (narrationId) await service.rpc('fail_turn_narration', { p_narration_id: narrationId, p_error_code: error instanceof Error ? error.message : 'generation_failed' });
    console.error('generate-narration failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Narration could not be generated. No Crowns were charged.' }, { status: 400, headers: corsHeaders });
  }
});
