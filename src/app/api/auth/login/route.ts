import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/services/supabaseClient";

/**
 * POST /api/auth/login
 * Signs in with email + password via Supabase Auth.
 * Returns the access_token and user+shop info.
 * The client stores the session using the browser Supabase client.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database not configured." },
        { status: 503 }
      );
    }

    // Sign in using admin client (which uses the service role key server-side)
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: email.trim().toLowerCase(),
    });

    // We don't use magic links — use the user client for password sign-in instead.
    // The admin client can verify but can't issue password-based sessions directly.
    // So we use the anon-keyed client for sign-in.
    void data;
    void error;

    // Create a temporary anon-key client just for password sign-in
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!anonKey) {
      return NextResponse.json(
        { success: false, error: "Auth configuration missing." },
        { status: 503 }
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    const { data: signInData, error: signInError } =
      await anonClient.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (signInError || !signInData.session || !signInData.user) {
      const msg = signInError?.message || "Invalid email or password.";
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const userId = signInData.user.id;
    const accessToken = signInData.session.access_token;
    const refreshToken = signInData.session.refresh_token;

    // Fetch the user's shop
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, name")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopError) {
      console.error("Shop lookup error:", shopError);
    }

    return NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      userId,
      shopId: shop?.id || null,
      shopName: shop?.name || null,
      email: signInData.user.email,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Login failed.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

