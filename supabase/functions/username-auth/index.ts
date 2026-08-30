import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { username, password, email, action = 'signin' } = await req.json();
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(username || '') || typeof password !== 'string') throw new Error('Invalid username or password.');
    if (password.length < 8) throw new Error('Password must contain at least 8 characters.');
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const normalized = username.toLowerCase();
    if (action === 'signup') {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address.');
      const { data: existing } = await service.from('profiles').select('id').eq('username', normalized).maybeSingle();
      if (existing) return Response.json({ error: 'That username is already taken.' }, { status: 409, headers: corsHeaders });
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: normalizedEmail, password, email_confirm: true,
        user_metadata: { username: normalized, display_name: username.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()) },
      });
      if (createError || !created.user) throw createError || new Error('Account could not be created.');
    } else if (action !== 'signin') throw new Error('Invalid authentication action.');
    const { data: profile } = await service.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle();
    if (!profile) throw new Error('Invalid username or password.');
    const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
    if (userError || !userResult.user?.email) throw new Error('Invalid username or password.');
    const publicClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await publicClient.auth.signInWithPassword({ email: userResult.user.email, password });
    if (error || !data.session) throw new Error('Invalid username or password.');
    return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers: corsHeaders });
  } catch (error) {
    console.error('username-auth failed', error);
    const message = error instanceof Error ? error.message : 'Authentication failed.';
    const status = /invalid username or password/i.test(message) ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
