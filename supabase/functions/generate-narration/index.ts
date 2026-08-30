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
    const { turnId, action = 'generate' } = await req.json();
    if (typeof turnId !== 'string') throw new Error('A story turn is required.');
    const requestedExpired = await service.from('turn_narrations').select('id,storage_path').eq('turn_id', turnId).eq('owner_id', auth.user.id).eq('status', 'ready').lte('expires_at', new Date().toISOString()).maybeSingle();
    if (!requestedExpired.error && requestedExpired.data) {
      if (requestedExpired.data.storage_path) await service.storage.from('narration-audio').remove([requestedExpired.data.storage_path]);
      await service.from('turn_narrations').delete().eq('id', requestedExpired.data.id);
    }
    const model = Deno.env.get('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts';
    const voice = Deno.env.get('OPENAI_TTS_VOICE') || 'coral';
    if (action === 'quote') {
      const turn = await service.from('campaign_turns').select('id,narration,campaigns!inner(owner_id)').eq('id', turnId).maybeSingle();
      if (turn.error) throw turn.error;
      if (!turn.data || (turn.data.campaigns as any).owner_id !== auth.user.id) throw new Error('Story turn not found.');
      const cached = await service.from('turn_narrations').select('*').eq('turn_id', turnId).eq('owner_id', auth.user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (cached.error) throw cached.error;
      if (cached.data?.status === 'ready' && cached.data.storage_path) {
        const signed = await service.storage.from('narration-audio').createSignedUrl(cached.data.storage_path, 3600);
        if (signed.error) throw signed.error;
        const download = await service.storage.from('narration-audio').createSignedUrl(cached.data.storage_path, 3600, { download: `sable-crown-${turnId.slice(0, 8)}.mp3` });
        if (download.error) throw download.error;
        return Response.json({ cached: true, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, expiresAt: cached.data.expires_at, cost: 0, estimatedTokens: cached.data.estimated_text_tokens }, { headers: corsHeaders });
      }
      const estimatedTokens = Math.max(1, Math.ceil(turn.data.narration.length / 4));
      return Response.json({ cached: false, estimatedTokens, cost: Math.max(1, Math.ceil(estimatedTokens / 500)) }, { headers: corsHeaders });
    }
    const claim = await userClient.rpc('claim_turn_narration', { p_turn_id: turnId, p_model: model, p_voice: voice });
    if (claim.error) throw claim.error;
    const claimed: any = claim.data;
    narrationId = claimed.narrationId;
    if (claimed.status === 'ready') {
      const signed = await service.storage.from('narration-audio').createSignedUrl(claimed.storagePath, 3600);
      if (signed.error) throw signed.error;
      const download = await service.storage.from('narration-audio').createSignedUrl(claimed.storagePath, 3600, { download: `sable-crown-${turnId.slice(0, 8)}.mp3` });
      if (download.error) throw download.error;
      return Response.json({ cached: true, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, cost: 0, estimatedTokens: claimed.estimatedTokens, creditsRemaining: claimed.creditsRemaining }, { headers: corsHeaders });
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('Narration is not configured.');
    const speech = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, voice, input: claimed.text, instructions: 'Read as an immersive, restrained dark-fantasy audiobook narrator. Preserve the text exactly. Use natural pacing and distinguish quoted dialogue subtly without imitating any real actor.', response_format: 'mp3' }) });
    if (!speech.ok) throw new Error(`Speech provider returned ${speech.status}: ${(await speech.text()).slice(0, 240)}`);
    const audio = new Uint8Array(await speech.arrayBuffer());
    const path = `${auth.user.id}/${turnId}/${narrationId}.mp3`;
    const upload = await service.storage.from('narration-audio').upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    if (upload.error) throw upload.error;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const completed = await service.from('turn_narrations').update({ status: 'ready', storage_path: path, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', narrationId).eq('status', 'generating');
    if (completed.error) throw completed.error;
    const signed = await service.storage.from('narration-audio').createSignedUrl(path, 3600);
    if (signed.error) throw signed.error;
    const download = await service.storage.from('narration-audio').createSignedUrl(path, 3600, { download: `sable-crown-${turnId.slice(0, 8)}.mp3` });
    if (download.error) throw download.error;
    return Response.json({ cached: false, audioUrl: signed.data.signedUrl, downloadUrl: download.data.signedUrl, expiresAt, cost: claimed.cost, estimatedTokens: claimed.estimatedTokens, creditsRemaining: claimed.creditsRemaining }, { headers: corsHeaders });
  } catch (error) {
    if (narrationId) await service.rpc('fail_turn_narration', { p_narration_id: narrationId, p_error_code: error instanceof Error ? error.message : 'generation_failed' });
    console.error('generate-narration failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Narration could not be generated. No Crowns were charged.' }, { status: 400, headers: corsHeaders });
  }
});
