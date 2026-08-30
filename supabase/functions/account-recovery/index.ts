import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const genericMessage = 'If that email belongs to an account, recovery instructions have been sent.';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { email, action } = await req.json();
    const normalized = String(email || '').trim().toLowerCase();
    if (!emailPattern.test(normalized) || !['username', 'password'].includes(action)) return Response.json({ message: genericMessage }, { headers: corsHeaders });
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    if (action === 'password') {
      const publicClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
      const redirectTo = Deno.env.get('APP_URL') || 'http://localhost:8081';
      await publicClient.auth.resetPasswordForEmail(normalized, { redirectTo });
    } else {
      const { data: profile } = await service.from('profiles').select('username').eq('email', normalized).maybeSingle();
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (profile && resendKey) {
        const from = Deno.env.get('RECOVERY_EMAIL_FROM') || 'Sable Crown <support@sablecrown.com>';
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [normalized], subject: 'Your Sable Crown username', html: `<p>Your Sable Crown username is:</p><p><strong>${profile.username}</strong></p><p>If you did not request this reminder, you can ignore this email.</p>` }) });
        if (!response.ok) console.error('Username recovery email failed', { status: response.status, body: (await response.text()).slice(0, 500) });
      }
    }
    return Response.json({ message: genericMessage }, { headers: corsHeaders });
  } catch (error) {
    console.error('account-recovery failed', error);
    return Response.json({ message: genericMessage }, { headers: corsHeaders });
  }
});
