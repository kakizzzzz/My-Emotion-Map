import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export type CloudAuth = {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  userId: string;
};

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);

let client: SupabaseClient | null | undefined;

export const getSupabaseClient = () => {
  if (client !== undefined) return client;
  client = validUrl && publishableKey
    ? createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  return client;
};

export const toCloudAuth = (session: Session | null): CloudAuth | null =>
  session && validUrl && publishableKey
    ? {
        supabaseUrl,
        publishableKey,
        accessToken: session.access_token,
        userId: session.user.id,
      }
    : null;
