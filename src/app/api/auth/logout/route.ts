import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * The actual session revocation is done client-side via the browser Supabase client.
 * This endpoint exists for server-side cookie cleanup if needed.
 */
export async function POST() {
  return NextResponse.json({ success: true, message: "Logged out." });
}

