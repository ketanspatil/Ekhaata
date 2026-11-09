import { NextRequest, NextResponse } from "next/server";
import { parseShopkeeperCommand } from "@/services/conversationEngine";
import {
  getTotalPendingUdhaar,
  getActiveCustomersCount,
  getRecentTransactions,
} from "@/services/ledgerService";
import { getAuthenticatedUser, getSupabaseClient } from "@/services/supabaseClient";
import { ConversationContext } from "@/types";

/**
 * Derives the authenticated user's shop_id from their access token.
 * Returns null if unauthenticated or shop not found (falls back to JSON ledger).
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

export async function GET(req: NextRequest) {
  const shopId = await getShopIdFromRequest(req);

  return NextResponse.json({
    totalPending: await getTotalPendingUdhaar(shopId),
    activeCustomersCount: await getActiveCustomersCount(shopId),
    transactions: await getRecentTransactions(5, shopId),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, context, audioBase64, audioMimeType } = body as {
      transcript?: string;
      context?: ConversationContext;
      audioBase64?: string | null;
      audioMimeType?: string | null;
    };

    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Transcript is required." },
        { status: 400 }
      );
    }

    // Derive shop_id from the authenticated user — never trust it from the body
    const shopId = await getShopIdFromRequest(req);

    // Process using conversation engine with Gemini audio understanding
    const result = await parseShopkeeperCommand(transcript.trim(), context, shopId, {
      audioBase64,
      audioMimeType,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal conversation processing error.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
