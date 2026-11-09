/**
 * Browser-side Supabase client for authentication.
 * Uses the publishable/anon key — safe to expose to the browser.
 * This client manages the user's auth session via cookies automatically.
 *
 * IMPORTANT: Never import this in server-side code (API routes, services).
 * Use supabaseClient.ts (service role) for all server-side operations.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClientInstance: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClientInstance) {
    return browserClientInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment."
    );
  }

  browserClientInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClientInstance;
}

export type { SupabaseClient };

