import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getSupabaseClient } from "@/services/supabaseClient";
import { dbGenerateFinancialReport } from "@/services/databaseLedgerService";

/**
 * Derives the authenticated user's shop_id from their access token.
 */
async function getShopIdFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!accessToken) return null;

  const user = await getAuthenticatedUser(accessToken);
  if (!user) return null;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  return shop?.id || null;
}

/**
 * GET /api/reports?period=daily|weekly|monthly
 * Returns authenticated shop financial report with integer-paise accuracy.
 */
export async function GET(req: NextRequest) {
  try {
    const shopId = await getShopIdFromRequest(req);
    if (!shopId) {
      return NextResponse.json(
        { error: "Unauthorized: Valid shop session required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period") || "daily";
    const period: "daily" | "weekly" | "monthly" =
      periodParam === "weekly" || periodParam === "monthly"
        ? periodParam
        : "daily";

    const report = await dbGenerateFinancialReport(period, shopId);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

