import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const hasPasswordRecoveryUrl = typeof window !== 'undefined' && /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey && !supabaseUrl.includes('your-project'));

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
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
