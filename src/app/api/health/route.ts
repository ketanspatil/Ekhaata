import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/services/supabaseClient";

export async function GET() {
  const gnaniKey = process.env.GNANI_API_KEY?.trim() || "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const supabaseStatus = checkSupabaseConfig();

  const services = {
    backend: true,
    supabase: supabaseStatus.isConfigured,
    gnani: Boolean(gnaniKey && gnaniKey.length > 10),
    gemini: Boolean(geminiKey && geminiKey.length > 10),
  };

  const allHealthy = Object.values(services).every(Boolean);

  return NextResponse.json({
    status: allHealthy ? "online" : "degraded",
    services,
    timestamp: new Date().toISOString(),
  });
}

