import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GNANI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GNANI_API_KEY is missing from server environment (.env.local).",
        },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const audioEntry = formData.get("audio") || formData.get("audio_file");

    if (!audioEntry || !(audioEntry instanceof Blob)) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid audio recording was provided in the request.",
        },
        { status: 400 }
      );
    }

    // Guard against 0-byte or trivial clicks with no actual audio recorded
    if (audioEntry.size < 500) {
      return NextResponse.json(
        {
          success: false,
          error: "Audio clip is too short or empty. Please speak clearly into the microphone.",
        },
        { status: 400 }
      );
    }

    // Determine filename with appropriate extension
    const mimeType = audioEntry.type || "audio/wav";
    let filename = "speech.wav";
    if (mimeType.includes("webm")) {
      filename = "speech.webm";
    } else if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
      filename = "speech.m4a";
    } else if (mimeType.includes("ogg")) {
      filename = "speech.ogg";
    }

    // Build Gnani Prisma v3.0 request body
    const gnaniPayload = new FormData();
    gnaniPayload.append("audio_file", audioEntry, filename);
    gnaniPayload.append("model", "prisma-v3.0");
    gnaniPayload.append("language_code", "indic-auto"); // Auto-detects Marathi, Hindi, English etc.
    gnaniPayload.append("format", "codemix"); // Code-mixed output preserving English loanwords

    const gnaniResponse = await fetch("https://api.vachana.ai/stt/v3", {
      method: "POST",
      headers: {
        "X-API-Key-ID": apiKey,
      },
      body: gnaniPayload,
    });

    const data = await gnaniResponse.json();

    if (!gnaniResponse.ok || !data.success) {
      const errorMessage =
        data?.error?.message ||
        data?.detail?.[0]?.msg ||
        data?.message ||
        "Gnani Prisma STT processing failed.";

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: gnaniResponse.status || 500 }
      );
    }

    const rawTranscript = (data.transcript || "").trim();

    return NextResponse.json({
      success: true,
      transcript: rawTranscript,
      detectedLanguage: data.detected_language_code || "indic-auto",
      requestId: data.request_id,
      isEmpty: rawTranscript.length === 0,
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "An unexpected server error occurred.";
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
