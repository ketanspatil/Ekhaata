/**
 * Server-side Supabase clients for Ekhaata.
 *
 * Two clients are provided:
 * 1. getSupabaseClient()         — service-role admin client (bypasses RLS).
 *    Use for all ledger DB operations on the server.
 *
 * 2. getSupabaseServerUserClient() — user-scoped client built from the
 *    authenticated user's access token read from their cookie.
 *    Use when you need RLS to enforce ownership.
 *
 * NEVER import supabaseBrowserClient here.
 * NEVER expose SUPABASE_SERVICE_ROLE_KEY to browser bundles.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminInstance: SupabaseClient | null = null;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  missingVariables: string[];
}

/**
 * Checks whether required Supabase credentials are set.
 */
export function checkSupabaseConfig(): SupabaseConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingVariables: string[] = [];
  if (!url) missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    isConfigured: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * Returns a server-side admin Supabase client using the service role key.
 * This bypasses RLS and should only be used for server-to-server operations
 * where ownership has already been verified via the authenticated user's shop_id.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const config = checkSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  if (!supabaseAdminInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    supabaseAdminInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseAdminInstance;
}

/**
 * Verifies the user's JWT (from Authorization header or cookie value) using
 * the admin client and returns the user object.
 *
 * API routes call this to derive the authenticated user without trusting
 * any user-supplied user_id or shop_id from the request body.
 *
 * Returns null if the token is missing or invalid.
 */
export async function getAuthenticatedUser(
  accessToken: string | null | undefined
): Promise<{ id: string; email: string | undefined } | null> {
  if (!accessToken) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email,
  };
}
