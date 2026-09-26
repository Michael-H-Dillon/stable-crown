import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const genericMessage = 'If that email belongs to an account, recovery instructions have been sent.';
const sendEmail = async (key: string, from: string, to: string, subject: string, html: string) => {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
  if (!response.ok) console.error('Recovery email failed', { status: response.status, body: (await response.text()).slice(0, 500) });
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { email, action } = await req.json();
    const normalized = String(email || '').trim().toLowerCase();
    if (!emailPattern.test(normalized) || !['username', 'password'].includes(action)) return Response.json({ message: genericMessage }, { headers: corsHeaders });
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: profile } = await service.from('profiles').select('id,username,email').eq('email', normalized).maybeSingle();
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('RECOVERY_EMAIL_FROM') || 'Ashen Crown <onboarding@resend.dev>';
    if (action === 'password') {
      if (profile && resendKey) {
        const { data: authResult } = await service.auth.admin.getUserById(profile.id);
        const authEmail = authResult.user?.email?.toLowerCase();
        if (authEmail?.endsWith('@users.sablecrown.app')) {
          const synced = await service.auth.admin.updateUserById(profile.id, { email: normalized, email_confirm: true });
          if (synced.error) throw synced.error;
        }
        if (authEmail === normalized || authEmail?.endsWith('@users.sablecrown.app')) {
          const redirectTo = Deno.env.get('APP_URL') || 'http://localhost:8081';
          const link = await service.auth.admin.generateLink({ type: 'recovery', email: normalized, options: { redirectTo } });
          const actionLink = link.data.properties?.action_link;
          if (link.error || !actionLink) throw link.error || new Error('Recovery link could not be generated.');
          const safeLink = actionLink.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
          await sendEmail(resendKey, from, normalized, 'Reset your Ashen Crown password', `<p>We received a request to reset your Ashen Crown password.</p><p><a href="${safeLink}">Choose a new password</a></p><p>If you did not request this, you can ignore this email.</p>`);
        }
      }
    } else {
      if (profile && resendKey) {
        await sendEmail(resendKey, from, normalized, 'Your Ashen Crown username', `<p>Your Ashen Crown username is:</p><p><strong>${profile.username}</strong></p><p>If you did not request this reminder, you can ignore this email.</p>`);
      }
    }
    return Response.json({ message: genericMessage }, { headers: corsHeaders });
  } catch (error) {
    console.error('account-recovery failed', error);
    return Response.json({ message: genericMessage }, { headers: corsHeaders });
  }
});
