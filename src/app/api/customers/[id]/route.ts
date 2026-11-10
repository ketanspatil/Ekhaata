import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getSupabaseClient } from "@/services/supabaseClient";
import {
  dbGetCustomerDetails,
  dbSettleCustomerAccount,
} from "@/services/databaseLedgerService";

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
 * GET /api/customers/[id]
 * Returns full customer profile, balance breakdown, and chronological transaction history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const shopId = await getShopIdFromRequest(req);
    if (!shopId) {
      return NextResponse.json(
        { error: "Unauthorized: Valid shop session required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const details = await dbGetCustomerDetails(id, shopId);
    if (!details) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...details,
    });
  } catch (error: any) {
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers/[id]
 * Actions:
 *  - { action: "settle", notes?: string }: Settles the customer's outstanding balance
 *    by recording a valid 'jama' transaction in Supabase.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const shopId = await getShopIdFromRequest(req);
    if (!shopId) {
      return NextResponse.json(
        { error: "Unauthorized: Valid shop session required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, notes } = body;

    if (action === "settle") {
      const settlement = await dbSettleCustomerAccount(id, shopId, notes);
      return NextResponse.json({
        success: true,
        settlement,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/customers/[id] error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process customer action" },
      { status: 500 }
    );
  }
}

