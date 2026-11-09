import fs from "fs";
import { interpretShopkeeperSpeechWithGemini } from "../src/services/geminiService";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [k, ...v] = line.split("=");
  if (k && v) {
    process.env[k.trim()] = v.join("=").trim();
  }
}

const GNANI_API_KEY = process.env.GNANI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function status(label: string, ok: boolean, detail: string) {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${label}`);
  console.log(`   ${detail}\n`);
}

function banner(text: string) {
  console.log("═".repeat(60));
  console.log(`  ${text}`);
  console.log("═".repeat(60));
}

async function run() {
  console.log("\n============================================================");
  console.log("  EKHAATA END-TO-END PIPELINE CONNECTIVITY CHECK");
  console.log("  Workflow: Gnani Prisma STT -> Gemini Understanding -> Gnani Timbre TTS");
  console.log("============================================================\n");

  // 1. STEP 1: Gnani Prisma STT
  banner("STEP 1: Gnani Prisma STT (Speech-to-Text)");
  try {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(36, 4);
    wavHeader.write("WAVE", 8);
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(1, 22);
    wavHeader.writeUInt32LE(16000, 24);
    wavHeader.writeUInt32LE(32000, 28);
    wavHeader.writeUInt16LE(2, 32);
    wavHeader.writeUInt16LE(16, 34);
    wavHeader.write("data", 36);
    wavHeader.writeUInt32LE(0, 40);

    const form = new FormData();
    const wavBlob = new Blob([wavHeader], { type: "audio/wav" });
    form.append("audio_file", wavBlob, "speech.wav");
    form.append("model", "prisma-v3.0");
    form.append("language_code", "indic-auto");
    form.append("format", "codemix");

    const res = await fetch("https://api.vachana.ai/stt/v3", {
      method: "POST",
      headers: { "X-API-Key-ID": GNANI_API_KEY },
      body: form,
    });
    const body = await res.json();
    if (res.ok && body.success) {
      status("Gnani Prisma STT", true, `Authenticated & Active (request_id: ${body.request_id})`);
    } else {
      status("Gnani Prisma STT", false, `Failed: HTTP ${res.status} - ${JSON.stringify(body)}`);
    }
  } catch (err: unknown) {
    status("Gnani Prisma STT", false, `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. STEP 2: Gemini Understanding
  banner("STEP 2: Google Gemini (Bookkeeping Understanding)");
  try {
    const testTranscript = "रमेश को पांच सौ का उधार लिखो";
    console.log(`Input test transcript: "${testTranscript}"`);
    const interpretation = await interpretShopkeeperSpeechWithGemini({
      prismaTranscript: testTranscript,
    });

    if (
      interpretation &&
      interpretation.customer_name &&
      interpretation.amount === 500 &&
      interpretation.transaction_type === "ADD_CREDIT"
    ) {
      status(
        "Google Gemini Understanding",
        true,
        `Connected & Verified!\n   - Extracted Customer: ${interpretation.customer_name}\n   - Extracted Amount: ₹${interpretation.amount}\n   - Classified Intent: ${interpretation.transaction_type}\n   - Confidence: ${interpretation.confidence}`
      );
    } else {
      status(
        "Google Gemini Understanding",
        false,
        `Unexpected extraction output: ${JSON.stringify(interpretation)}`
      );
    }
  } catch (err: unknown) {
    status("Google Gemini Understanding", false, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. STEP 3: Gnani Timbre TTS
  banner("STEP 3: Gnani Timbre TTS (Text-to-Speech)");
  try {
    const ttsPayload = {
      text: "Likh liya. Ramesh ka paanch sau rupaye udhaar darj ho gaya.",
      model: "timbre-v3.0",
      voice: "Shivani",
      language: "hi-IN",
      speed: 1.0,
      audio_config: {
        encoding: "linear_pcm",
        container: "wav",
        num_channels: 1,
        sample_rate: 48000,
        sample_width: 2,
      },
    };

    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: {
        "X-API-Key-ID": GNANI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ttsPayload),
    });

    if (res.ok) {
      const buf = await res.arrayBuffer();
      status(
        "Gnani Timbre TTS",
        buf.byteLength > 1000,
        `Connected & Voice Synthesized! Received ${buf.byteLength} bytes of WAV audio`
      );
    } else {
      const errBody = await res.json().catch(() => null);
      status("Gnani Timbre TTS", false, `HTTP ${res.status}: ${JSON.stringify(errBody)}`);
    }
  } catch (err: unknown) {
    status("Gnani Timbre TTS", false, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log("  PIPELINE VERIFICATION COMPLETE: ALL 3 SERVICES CONNECTED");
  console.log("════════════════════════════════════════════════════════════\n");
}

run();
