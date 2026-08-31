import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function runJob(jobId: string, authHeader: string) {
  const claimed = await service.from('background_jobs').update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId).in('status', ['queued','failed']).select().maybeSingle();
  if (!claimed.data) return;
  const job = claimed.data; const endpoint = job.job_type === 'generate_world' ? 'generate-world-pack' : 'create-campaign';
  try {
    const response = await fetch(`${url}/functions/v1/${endpoint}`, { method: 'POST', headers: { Authorization: authHeader, apikey: anonKey, 'Content-Type': 'application/json', 'x-background-job-id': job.id }, body: JSON.stringify(job.payload) });
    const result = await response.json();
    if (!response.ok || result?.error) throw new Error(result?.error || `Background operation failed (${response.status}).`);
    await service.from('background_jobs').update({ status: 'completed', result, error_message: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), attempts: Number(job.attempts || 0) + 1 }).eq('id', job.id);
  } catch (error) {
    await service.from('background_jobs').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Background operation failed.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), attempts: Number(job.attempts || 0) + 1 }).eq('id', job.id);
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization'); if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const auth = await client.auth.getUser(); if (!auth.data.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const body = await req.json(); const action = body.action || 'enqueue';
  if (action === 'status') {
    const row = await service.from('background_jobs').select('id,job_type,status,result,error_message,attempts,created_at,updated_at').eq('id',body.jobId).eq('owner_id',auth.data.user.id).maybeSingle();
    return Response.json(row.data || { error: 'Job not found.' }, { status: row.data ? 200 : 404, headers: corsHeaders });
  }
  if (action === 'resume_all') {
    const rows = await service.from('background_jobs').select('id').eq('owner_id',auth.data.user.id).in('status',['queued','failed']).lt('attempts',3).limit(5);
    for (const row of rows.data || []) EdgeRuntime.waitUntil(runJob(row.id,authHeader));
    return Response.json({ resumed: rows.data?.length || 0 }, { headers: corsHeaders });
  }
  if (!['generate_world','create_campaign'].includes(body.jobType)) return Response.json({ error: 'Unsupported job type.' }, { status: 400, headers: corsHeaders });
  const key = String(body.idempotencyKey || crypto.randomUUID());
  const existing = await service.from('background_jobs').select('*').eq('owner_id',auth.data.user.id).eq('idempotency_key',key).maybeSingle();
  let job = existing.data;
  if (!job) {
    const inserted = await service.from('background_jobs').insert({ owner_id: auth.data.user.id, job_type: body.jobType, idempotency_key: key, payload: body.payload || {} }).select().single();
    if (inserted.error) return Response.json({ error: inserted.error.message }, { status: 400, headers: corsHeaders }); job = inserted.data;
  }
  if (job.status === 'queued' || job.status === 'failed') EdgeRuntime.waitUntil(runJob(job.id,authHeader));
  return Response.json({ jobId: job.id, status: job.status }, { status: 202, headers: corsHeaders });
});
