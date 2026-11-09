import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getSupabaseClient } from "@/services/supabaseClient";

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile and shop info.
 * Requires Authorization: Bearer <access_token> header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const user = await getAuthenticatedUser(accessToken);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Database not configured." },
      { status: 503 }
    );
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, currency, created_at")
    .eq("owner_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    userId: user.id,
    email: user.email,
    shopId: shop?.id || null,
    shopName: shop?.name || null,
    currency: shop?.currency || "INR",
  });
}

