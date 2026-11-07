import { NextRequest, NextResponse } from "next/server";
import { parseShopkeeperCommand } from "@/services/conversationEngine";
import {
  getTotalPendingUdhaar,
  getActiveCustomersCount,
  getRecentTransactions,
} from "@/services/ledgerService";
import { ConversationContext } from "@/types";

export async function GET() {
  return NextResponse.json({
    totalPending: await getTotalPendingUdhaar(),
    activeCustomersCount: await getActiveCustomersCount(),
    transactions: await getRecentTransactions(5),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, context } = body as {
      transcript?: string;
      context?: ConversationContext;
    };

    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Transcript is required.",
        },
        { status: 400 }
      );
    }

    // Process using conversation engine (Evon LLM / Indic NLU fallback)
    const result = await parseShopkeeperCommand(transcript.trim(), context);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal conversation processing error.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

