import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { username, password } = await req.json();
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(username || '') || typeof password !== 'string') throw new Error('Invalid username or password.');
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: profile } = await service.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle();
    if (!profile) throw new Error('Invalid username or password.');
    const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
    if (userError || !userResult.user?.email) throw new Error('Invalid username or password.');
    const publicClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await publicClient.auth.signInWithPassword({ email: userResult.user.email, password });
    if (error || !data.session) throw new Error('Invalid username or password.');
    return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers: corsHeaders });
  } catch {
    return Response.json({ error: 'Invalid username or password.' }, { status: 401, headers: corsHeaders });
  }
});
