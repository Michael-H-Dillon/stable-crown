import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const WORLD_GENERATION_HOLD = 20;

async function runJob(jobId: string, authHeader: string) {
  const now = new Date().toISOString();
  let current = await service.from('background_jobs').select('*').eq('id',jobId).maybeSingle();
  if (!current.data || current.data.status === 'completed' || Number(current.data.attempts || 0) >= 2) return;
  if (['queued','failed','stalled'].includes(current.data.status)) {
    const claimed = await service.from('background_jobs').update({ status: 'running', progress_stage: 'starting', progress_percent: 5, progress_message: 'Starting or resuming the background job.', started_at: current.data.started_at || now, completed_at: null, stage_started_at: now, last_activity_at: now, updated_at: now, error_message: null }).eq('id', jobId).in('status', ['queued','failed','stalled']).lt('attempts',2).select().maybeSingle();
    if (!claimed.data) return;
    current = claimed;
  }
  const job = current.data; const endpoint = job.job_type === 'generate_world' ? 'generate-world-pack' : job.job_type === 'audit_world_ledger' ? 'audit-world-ledger' : 'create-campaign';
  try {
    const response = await fetch(`${url}/functions/v1/${endpoint}`, { method: 'POST', headers: { Authorization: authHeader, apikey: anonKey, 'Content-Type': 'application/json', 'x-background-job-id': job.id }, body: JSON.stringify(job.payload) });
    const result = await response.json();
    if (!response.ok || result?.error) throw new Error(result?.error || `Background operation failed (${response.status}).`);
    if (result?.pending) {
      await service.from('background_jobs').update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id',job.id).eq('status','running');
      return;
    }
    const completedAt = new Date().toISOString();
    await service.from('background_jobs').update({ status: 'completed', progress_stage: 'completed', progress_percent: 100, progress_message: 'Finished and saved.', result, checkpoint: {}, error_message: null, completed_at: completedAt, last_activity_at: completedAt, updated_at: completedAt, attempts: Number(job.attempts || 0) + 1 }).eq('id', job.id);
    if (job.job_type === 'generate_world' && result?.pack?.databaseVersionId) await service.from('world_generation_analytics').insert({ owner_id: job.owner_id, generation_job_id: job.id, pack_version_id: result.pack.databaseVersionId, ai_cost_usd: Number(result.apiCostUsd || 0), crowns_charged: Number(result.generationCost || 0) + Number(result.importCost || 0) });
    try { await notifyOwner(job, true, result); } catch (notificationError) { console.error('World completion notification failed', notificationError); }
  } catch (error) {
    const completedAt = new Date().toISOString();
    await service.from('background_jobs').update({ status: 'failed', progress_stage: 'failed', progress_message: Number(job.attempts || 0) + 1 < 2 ? 'The job stopped and can be resumed from its last completed stage.' : 'The job stopped after its final automatic attempt.', error_message: error instanceof Error ? error.message : 'Background operation failed.', completed_at: completedAt, last_activity_at: completedAt, updated_at: completedAt, attempts: Number(job.attempts || 0) + 1 }).eq('id', job.id);
    if (Number(job.attempts || 0) + 1 >= 2) {
      if (job.job_type === 'generate_world') await service.rpc('refund_world_generation_crowns',{ p_user:job.owner_id,p_job:job.id,p_amount:WORLD_GENERATION_HOLD });
      try { await notifyOwner(job, false, null, error instanceof Error ? error.message : 'Background operation failed.'); } catch (notificationError) { console.error('World failure notification failed', notificationError); }
    }
  }
}

async function notifyOwner(job: any, success: boolean, result?: any, errorMessage?: string) {
  if (job.job_type !== 'generate_world') return;
  const profile = await service.from('profiles').select('world_job_email_notifications,world_job_push_notifications').eq('id',job.owner_id).maybeSingle();
  const world = String(job.payload?.world || 'Your world'); const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8081';
  const title = success ? `${world} is ready` : `${world} could not be created`;
  const body = success ? 'Your researched world has been saved privately. Open Sable Crown to begin a campaign.' : `The generation job stopped: ${errorMessage || 'Unknown error'}`;
  if (profile.data?.world_job_email_notifications && Deno.env.get('RESEND_API_KEY')) {
    const user = await service.auth.admin.getUserById(job.owner_id); const email = user.data.user?.email;
    if (email) await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${Deno.env.get('RESEND_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({from:Deno.env.get('RECOVERY_EMAIL_FROM') || 'Sable Crown <support@sablecrown.com>',to:[email],subject:title,html:`<p>${body}</p><p><a href="${appUrl}/?open=worlds">Open your worlds</a></p>`})});
  }
  if (profile.data?.world_job_push_notifications) {
    const devices = await service.from('push_notification_devices').select('expo_push_token').eq('owner_id',job.owner_id).eq('enabled',true);
    if (devices.data?.length) await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(devices.data.map(device=>({to:device.expo_push_token,title,body,data:{screen:'packs',packVersionId:result?.pack?.databaseVersionId}})))});
  }
}

async function recoverStalledJobs(ownerId: string) {
  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await service.from('background_jobs').update({ status:'stalled', progress_stage:'stalled', progress_message:'No heartbeat was received for three minutes. This job can be resumed safely.', updated_at:new Date().toISOString() }).eq('owner_id',ownerId).eq('status','running').lt('last_activity_at',staleBefore);
  const neverAdvancedBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await service.from('background_jobs').update({ status:'stalled', progress_stage:'stalled', progress_message:'The original worker ended before generation began. Resuming from the saved job now.', updated_at:new Date().toISOString() }).eq('owner_id',ownerId).eq('status','running').in('progress_stage',['queued','starting']).lt('started_at',neverAdvancedBefore);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization'); if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const auth = await client.auth.getUser(); if (!auth.data.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const body = await req.json(); const action = body.action || 'enqueue';
  if (action === 'list') {
    await recoverStalledJobs(auth.data.user.id); await service.rpc('purge_expired_background_jobs');
    const resumable = await service.from('background_jobs').select('id,job_type').eq('owner_id',auth.data.user.id).in('status',['queued','stalled']).lt('attempts',2).limit(2);
    await Promise.all((resumable.data || []).map(job => runJob(job.id,authHeader)));
    const runningWorlds = await service.from('background_jobs').select('id').eq('owner_id',auth.data.user.id).eq('job_type','generate_world').eq('status','running').order('last_activity_at',{ascending:true}).limit(2);
    await Promise.all((runningWorlds.data || []).map(job => runJob(job.id,authHeader)));
    const rows = await service.from('background_jobs').select('id,job_type,status,payload,result,error_message,attempts,progress_stage,progress_percent,progress_message,created_at,started_at,completed_at,last_activity_at,stage_timings,model_used,input_tokens,output_tokens,web_search_count,api_cost_usd,max_api_cost_usd,updated_at').eq('owner_id',auth.data.user.id).order('created_at',{ascending:false}).limit(20);
    return Response.json({ jobs: rows.data || [] }, { status: rows.error ? 500 : 200, headers: corsHeaders });
  }
  if (action === 'status') {
    await recoverStalledJobs(auth.data.user.id);
    const active = await service.from('background_jobs').select('id,job_type,status').eq('id',body.jobId).eq('owner_id',auth.data.user.id).maybeSingle();
    if (active.data && ['queued','running','stalled'].includes(active.data.status)) await runJob(active.data.id,authHeader);
    const row = await service.from('background_jobs').select('id,job_type,status,payload,result,error_message,attempts,progress_stage,progress_percent,progress_message,created_at,started_at,completed_at,last_activity_at,stage_timings,model_used,input_tokens,output_tokens,web_search_count,api_cost_usd,max_api_cost_usd,updated_at').eq('id',body.jobId).eq('owner_id',auth.data.user.id).maybeSingle();
    return Response.json(row.data || { error: 'Job not found.' }, { status: row.data ? 200 : 404, headers: corsHeaders });
  }
  if (action === 'resume_all') {
    await recoverStalledJobs(auth.data.user.id);
    const rows = await service.from('background_jobs').select('id').eq('owner_id',auth.data.user.id).in('status',['queued','failed','stalled']).lt('attempts',2).limit(5);
    await Promise.all((rows.data || []).map(row => runJob(row.id,authHeader)));
    return Response.json({ resumed: rows.data?.length || 0 }, { headers: corsHeaders });
  }
  if (!['generate_world','create_campaign'].includes(body.jobType)) return Response.json({ error: 'Unsupported job type.' }, { status: 400, headers: corsHeaders });
  const key = String(body.idempotencyKey || crypto.randomUUID());
  const existing = await service.from('background_jobs').select('*').eq('owner_id',auth.data.user.id).eq('idempotency_key',key).maybeSingle();
  let job = existing.data;
  let creditsRemaining: number | undefined;
  if (!job) {
    const inserted = await service.from('background_jobs').insert({ owner_id: auth.data.user.id, job_type: body.jobType, idempotency_key: key, payload: body.payload || {} }).select().single();
    if (inserted.error) return Response.json({ error: inserted.error.message }, { status: 400, headers: corsHeaders }); job = inserted.data;
    if (body.jobType === 'generate_world') {
      const reserved = await service.rpc('reserve_world_generation_crowns',{ p_user:auth.data.user.id,p_job:job.id,p_amount:WORLD_GENERATION_HOLD });
      if (reserved.error) { await service.from('background_jobs').delete().eq('id',job.id); return Response.json({ error: reserved.error.message }, { status: 402, headers: corsHeaders }); }
      creditsRemaining = Number(reserved.data);
    }
  }
  if (job.status === 'queued' || job.status === 'failed') await runJob(job.id,authHeader);
  const started = await service.from('background_jobs').select('status,progress_stage,progress_percent,progress_message').eq('id',job.id).maybeSingle();
  return Response.json({ jobId: job.id, status: started.data?.status || job.status, progressStage: started.data?.progress_stage, progressPercent: started.data?.progress_percent, progressMessage: started.data?.progress_message, creditsRemaining }, { status: 202, headers: corsHeaders });
});
