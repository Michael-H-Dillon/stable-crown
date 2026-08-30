import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'DELETE' && req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: corsHeaders });
  try {
    const { password } = await req.json();
    if (typeof password !== 'string' || password.length < 8) return Response.json({ error: 'Enter your current password.' }, { status: 400, headers: corsHeaders });
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data, error: userError } = await userClient.auth.getUser();
    if (userError || !data.user) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: corsHeaders });
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: authUser, error: authUserError } = await service.auth.admin.getUserById(data.user.id);
    if (authUserError || !authUser.user?.email) return Response.json({ error: 'Your account could not be verified.' }, { status: 400, headers: corsHeaders });
    const passwordClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const verification = await passwordClient.auth.signInWithPassword({ email: authUser.user.email, password });
    if (verification.error || !verification.data.user || verification.data.user.id !== data.user.id) return Response.json({ error: 'The password is incorrect.' }, { status: 403, headers: corsHeaders });
    const { error } = await service.auth.admin.deleteUser(data.user.id);
    if (error) throw error;
    return Response.json({ deleted: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('delete-account failed', error);
    return Response.json({ error: 'Your account could not be deleted. Nothing was changed.' }, { status: 500, headers: corsHeaders });
  }
});
