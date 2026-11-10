import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getSupabaseClient } from "@/services/supabaseClient";
import {
  dbGetShopCustomersWithBalances,
  dbFindOrCreateCustomer,
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
 * GET /api/customers
 * Returns all customers for the authenticated shop with their calculated balances,
 * total credit, total payments, and last transaction time.
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

    const customers = await dbGetShopCustomersWithBalances(shopId);
    return NextResponse.json({
      success: true,
      customers,
      totalCount: customers.length,
    });
  } catch (error: any) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers
 * Creates a new customer manually.
 * Requires: { name: string, phone?: string }
 * Scoped strictly to the authenticated user's shop_id.
 */
export async function POST(req: NextRequest) {
  try {
    const shopId = await getShopIdFromRequest(req);
    if (!shopId) {
      return NextResponse.json(
        { error: "Unauthorized: Valid shop session required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, phone } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Customer name is required" },
        { status: 400 }
      );
    }

    const customer = await dbFindOrCreateCustomer(
      name.trim(),
      shopId,
      phone?.trim() || null
    );

    return NextResponse.json({
      success: true,
      customer,
      message: `${customer.name} ko grahak suchi me joda gaya.`,
    });
  } catch (error: any) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create customer" },
      { status: 500 }
    );
  }
}

