import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  missingVariables: string[];
}

/**
 * Checks whether required Supabase credentials are set in environment variables.
 */
export function checkSupabaseConfig(): SupabaseConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  const missingVariables: string[] = [];
  if (!url) missingVariables.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!key) missingVariables.push("SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");

  return {
    isConfigured: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * Returns a server-side Supabase client instance.
 * Returns null if environment variables are not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const config = checkSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  if (!supabaseInstance) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
    const key = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY
    )!;

    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseInstance;
}

