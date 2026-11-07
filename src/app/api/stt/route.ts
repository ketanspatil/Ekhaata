import { NextRequest, NextResponse } from "next/server";

// Detect true audio container format from header magic bytes
function detectAudioFormat(buffer: Uint8Array): {
  ext: string;
  mime: string;
} {
  if (buffer.length >= 12) {
    // RIFF .... WAVE -> WAV
    if (
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x41 && // A
      buffer[10] === 0x56 && // V
      buffer[11] === 0x45 // E
    ) {
      return { ext: "wav", mime: "audio/wav" };
    }

    // 0x1A 0x45 0xDF 0xA3 -> EBML / WebM / Matroska
    if (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return { ext: "webm", mime: "audio/webm" };
    }

    // OggS -> OGG
    if (
      buffer[0] === 0x4f &&
      buffer[1] === 0x67 &&
      buffer[2] === 0x67 &&
      buffer[3] === 0x53
    ) {
      return { ext: "ogg", mime: "audio/ogg" };
    }

    // ID3 or 0xFF 0xFB -> MP3
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ) {
      return { ext: "mp3", mime: "audio/mpeg" };
    }

    // ftyp -> MP4 / M4A
    if (
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70
    ) {
      return { ext: "m4a", mime: "audio/mp4" };
    }
  }

  // Fallback default
  return { ext: "wav", mime: "audio/wav" };
}

export async function POST(req: NextRequest) {
  try {
    const rawKey = process.env.GNANI_API_KEY;
    // Clean key of any accidental quotes, trailing tildes, or whitespace
    const apiKey = rawKey
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .replace(/~+$/, "");

    if (!apiKey) {
      console.error("[STT Route Error] GNANI_API_KEY is missing from environment.");
      return NextResponse.json(
        {
          success: false,
          error: "GNANI_API_KEY is not configured in .env.local on the server.",
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
          error: "No audio data received in the request.",
        },
        { status: 400 }
      );
    }

    // Guard against 0-byte or trivial clicks with no actual audio recorded
    if (audioEntry.size < 500) {
      return NextResponse.json(
        {
          success: false,
          error: "Audio recording is too short. Please speak clearly into the microphone.",
        },
        { status: 400 }
      );
    }

    // Inspect the actual audio bytes to determine true container type
    const arrayBuffer = await audioEntry.arrayBuffer();
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));
    const format = detectAudioFormat(firstBytes);
    const filename = `speech.${format.ext}`;

    const normalizedBlob = new Blob([arrayBuffer], { type: format.mime });

    // Build Gnani Prisma v3.0 request body
    const gnaniPayload = new FormData();
    gnaniPayload.append("audio_file", normalizedBlob, filename);
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

    const data = await gnaniResponse.json().catch(() => null);

    if (!gnaniResponse.ok || !data?.success) {
      console.error("[Gnani STT API Error]", {
        status: gnaniResponse.status,
        data,
      });

      const errorMessage =
        data?.error?.message ||
        data?.detail?.[0]?.msg ||
        data?.detail?.message ||
        data?.message ||
        `Gnani Prisma STT failed (HTTP ${gnaniResponse.status}).`;

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
    console.error("[STT Route Exception]", err);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
