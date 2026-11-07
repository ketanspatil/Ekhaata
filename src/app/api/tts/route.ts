import { NextRequest, NextResponse } from "next/server";

/**
 * Prepares text for TTS playback by expanding currency symbols into natural speech words
 */
function prepareSpeechText(rawText: string): string {
  let text = rawText;
  // Convert ₹500 to "500 rupaye" for natural Indian speech synthesis
  text = text.replace(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/g, (_match, amt) => {
    return `${amt} rupaye`;
  });
  // Strip Markdown formatting if present
  text = text.replace(/[*_#`"]/g, "").trim();
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const rawKey = process.env.GNANI_API_KEY;
    const apiKey = rawKey
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .replace(/~+$/, "");

    if (!apiKey) {
      console.error("[TTS Route Error] GNANI_API_KEY is missing from environment.");
      return NextResponse.json(
        {
          success: false,
          error: "GNANI_API_KEY is not configured in .env.local on the server.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { text, language = "hi-IN", voice = "Shivani" } = body as {
      text?: string;
      language?: string;
      voice?: string;
    };

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Text is required for TTS synthesis.",
        },
        { status: 400 }
      );
    }

    const speechText = prepareSpeechText(text);

    // Call Gnani Timbre v3.0 REST inference endpoint
    const ttsPayload = {
      text: speechText,
      model: "timbre-v3.0",
      voice,
      language,
      speed: 1.0,
      audio_config: {
        encoding: "linear_pcm",
        container: "wav",
        num_channels: 1,
        sample_rate: 48000,
        sample_width: 2,
      },
    };

    const response = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: {
        "X-API-Key-ID": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ttsPayload),
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => null);
      console.error("[Gnani Timbre TTS Error]", response.status, errorJson);
      return NextResponse.json(
        {
          success: false,
          error:
            errorJson?.message ||
            errorJson?.error ||
            `Gnani Timbre TTS failed (HTTP ${response.status}).`,
        },
        { status: response.status || 500 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // If caller requested JSON payload (e.g. format=json or header)
    const format = req.nextUrl.searchParams.get("format");
    if (format === "json") {
      const base64Audio = `data:audio/wav;base64,${buffer.toString("base64")}`;
      return NextResponse.json({
        success: true,
        audioBase64: base64Audio,
      });
    }

    // Default: Stream binary audio/wav directly
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Internal TTS synthesis error.";
    console.error("[TTS Route Exception]", err);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

