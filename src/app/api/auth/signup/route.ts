import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/services/supabaseClient";

/**
 * POST /api/auth/signup
 * Creates a new Supabase Auth user, then creates their shop record.
 * Body: { email, password, shopName }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, shopName } = body as {
      email?: string;
      password?: string;
      shopName?: string;
    };

    if (!email || !password || !shopName) {
      return NextResponse.json(
        { success: false, error: "Email, password, and shop name are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters." },
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

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm for development; remove in production
      user_metadata: { shopName: shopName.trim() },
    });

    if (authError || !authData.user) {
      const msg = authError?.message || "Failed to create account.";
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // 2. Check if shop already exists for this user (prevent double creation)
    const { data: existingShop } = await supabase
      .from("shops")
      .select("id, name")
      .eq("owner_id", userId)
      .maybeSingle();

    let shopId: string;

    if (existingShop) {
      shopId = existingShop.id;
    } else {
      // 3. Create the user's shop
      const { data: newShop, error: shopError } = await supabase
        .from("shops")
        .insert({
          shop_name: shopName.trim(),
          owner_id: userId,
          currency: "INR",
        })
        .select("id")
        .single();

      if (shopError || !newShop) {
        // Rollback: delete user if shop creation fails
        await supabase.auth.admin.deleteUser(userId);
        return NextResponse.json(
          {
            success: false,
            error: `Shop creation failed: ${shopError?.message || "Unknown error"}`,
          },
          { status: 500 }
        );
      }

      shopId = newShop.id;
    }

    return NextResponse.json({
      success: true,
      userId,
      shopId,
      message: "Account created successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signup failed.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

