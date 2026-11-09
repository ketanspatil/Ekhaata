/**
 * Google Gemini Multimodal Speech & Bookkeeping Interpretation Service
 *
 * Inspects BOTH:
 * 1. The original recorded audio (base64)
 * 2. The STT transcript from Gnani Prisma
 *
 * Model: gemini-3-flash-preview (active Gemini Flash model with multimodal understanding)
 */
import { ShopkeeperIntent } from "@/types";

export interface GeminiAudioInterpretation {
  customer_name: string | null;
  amount: number | null;
  transaction_type: ShopkeeperIntent;
  language: "Hindi" | "Marathi" | "Hinglish" | "English";
  corrected_transcript: string;
  confidence: number;
  clarification_required: boolean;
  clarification_question: string | null;
  audio_vs_transcript_notes?: string | null;
  multiple_operations?: Array<{
    customer_name: string;
    amount: number;
    transaction_type: "ADD_CREDIT" | "ADD_PAYMENT";
  }> | null;
}

/**
 * Interprets shopkeeper speech by analyzing both the raw audio file and Gnani Prisma transcript.
 * Uses direct Google Generative Language REST API for maximum reliability and speed.
 */
export async function interpretShopkeeperSpeechWithGemini(params: {
  audioBase64?: string | null;
  audioMimeType?: string | null;
  prismaTranscript: string;
  contextCustomerName?: string | null;
}): Promise<GeminiAudioInterpretation | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not configured. Falling back to rule-based Indic NLU.");
    return null;
  }

  const { audioBase64, audioMimeType, prismaTranscript, contextCustomerName } = params;

  try {
    const parts: Array<
      | { text: string }
      | { inline_data: { mime_type: string; data: string } }
    > = [];

    // If original audio was provided, attach it as inline data for Gemini audio listening
    if (audioBase64) {
      const mime = audioMimeType || "audio/wav";
      const cleanData = audioBase64.replace(/^data:[^;]+;base64,/, "");
      parts.push({
        inline_data: {
          mime_type: mime,
          data: cleanData,
        },
      });
    }

    const promptText = `
You are the intelligent Speech Understanding and Financial Bookkeeping interpreter for Ekhaata, a voice ledger app for Indian retail shopkeepers.

The shopkeeper speaks in natural Hindi, Marathi, or Hinglish.
Gnani Prisma STT generated this preliminary transcript:
"${prismaTranscript}"

${contextCustomerName ? `Context from previous turn (last discussed customer): "${contextCustomerName}"` : ""}

CRITICAL ACCURACY & AUDIO INSPECTION RULES:
1. AUDIO IS GROUND TRUTH FOR AMOUNTS AND NAMES:
   - Listen very carefully to the attached audio if present.
   - STT transcripts from Gnani Prisma often distort numbers or phonetic sounds.
   - Specific STT confusion pairs to watch out for:
     * "पाँच सौ" / "पाचशे" (500) is frequently mis-transcribed as "सौ" (100) or vice versa. If you hear 500 ("पाँच सौ" / "पाचशे"), output 500! Never output 100 if the speaker said 500.
     * "एक हजार छह सौ" / "सोलह सौ" / "सोळाशे" = 1600.
     * "रमेश" (Ramesh) must NEVER be confused with "योगेश" (Yogesh) or "सुरेश" (Suresh). Listen closely to initial consonants (R vs Y vs S).
   - If audio clearly states a number or name, PRIORITIZE AUDIO over the Prisma transcript.
2. TRANSACTION TYPE:
   - ADD_CREDIT: Shopkeeper gave goods or credit to customer ("udhaar diya", "udhaar likho", "maal diya", "ko 500 diye", "udhaar").
   - ADD_PAYMENT: Customer paid money back ("paise mile", "jama karo", "wapas diye", "chuka diye", "ne 500 diye", "jama").
   - CHECK_BALANCE: Asking about balance ("kitna baaki hai", "hisaab batao", "kitna baaki").
   - CHECK_TOTAL: Asking about total store balance ("kul baaki", "total kitna hai", "sabka hisaab").
   - REVERSE_TRANSACTION: Undoing/canceling previous mistake ("galti ho gayi", "last entry hatao", "pichla transaction wapas karo", "reversal karo", "galat likh diya").
   - UNKNOWN: Ambiguous, unclear, or greeting.
3. MULTIPLE OPERATIONS:
   - If the utterance mentions multiple people and transactions (e.g. "Ramesh ko 500 udhaar aur Amit ne 200 rupaye wapas diye"), populate the multiple_operations array with each individual operation.
4. NEVER INVENT customer names or amounts:
   - Do NOT treat transaction action words as names (e.g., "लौटाया", "परत केले", "दुकान", "खाता", "जमा", "उधार" are NOT names).
   - Do NOT substitute a different customer name if the spoken name is clear.
   - If no customer name is spoken, set customer_name to null.
5. CONFIDENCE & CLARIFICATION:
   - Set high confidence (0.9 - 1.0) when audio clearly contains the name and amount.
   - If audio and transcript conflict significantly or audio is inaudible, set clarification_required = true, confidence < 0.75, and provide a clear, polite Hindi question in clarification_question.

Reply ONLY with a valid JSON object matching this schema:
{
  "customer_name": string or null,
  "amount": number or null,
  "transaction_type": "ADD_CREDIT" | "ADD_PAYMENT" | "CHECK_BALANCE" | "CHECK_TOTAL" | "REVERSE_TRANSACTION" | "UNKNOWN",
  "language": "Hindi" | "Marathi" | "Hinglish" | "English",
  "corrected_transcript": string,
  "confidence": number between 0.0 and 1.0,
  "clarification_required": boolean,
  "clarification_question": string or null,
  "audio_vs_transcript_notes": string or null,
  "multiple_operations": [
    {
      "customer_name": string,
      "amount": number,
      "transaction_type": "ADD_CREDIT" | "ADD_PAYMENT"
    }
  ] or null
}
`;

    parts.push({ text: promptText });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`Gemini API HTTP ${response.status}:`, errText);
      return null;
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return null;
    }

    const parsed: GeminiAudioInterpretation = JSON.parse(candidateText.trim());
    return parsed;
  } catch (err) {
    console.warn("Gemini audio understanding failed, falling back to Indic NLU:", err);
    return null;
  }
}
