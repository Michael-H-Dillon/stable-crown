import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const hasPasswordRecoveryUrl = typeof window !== 'undefined' && /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);

export const isSupabaseConfigured = Boolean(url && publishableKey && !url.includes('your-project'));

export const supabase = isSupabaseConfigured
  ? createClient<Database>(url!, publishableKey!, {
      auth: {
        storage: globalThis.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: typeof window !== 'undefined',
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
