import {
  ConversationContext,
  ConversationResponse,
  ShopkeeperIntent,
  StructuredCommand,
} from "@/types";
import {
  recordTransaction,
  getCustomerBalance,
  getTotalPendingUdhaar,
  getActiveCustomersCount,
  getRecentTransactions,
  findCustomerMatch,
  getLastReversibleTransaction,
  reverseTransaction,
} from "@/services/ledgerService";
import {
  extractAmount,
  extractAmountWithDetails,
} from "@/utils/numberParser";
import {
  extractCustomerName,
} from "@/utils/nameNormalizer";
import {
  interpretShopkeeperSpeechWithGemini,
  GeminiAudioInterpretation,
} from "@/services/geminiService";

export interface IntentClassification {
  intent: ShopkeeperIntent;
  isAmbiguous: boolean;
}

/**
 * Determines whether an input statement is in Marathi, Hindi, or Hinglish/English.
 */
export function detectLanguageFromText(text: string): "hi-IN" | "mr-IN" | "en-IN" {
  const lower = text.toLowerCase();
  // Marathi distinctive words / grammar markers
  if (
    lower.includes("chya") ||
    lower.includes("cha") ||
    lower.includes("chi") ||
    lower.includes("che") ||
    lower.includes("kadun") ||
    lower.includes("navavar") ||
    lower.includes("aahe") ||
    lower.includes("aahet") ||
    lower.includes("dila") ||
    lower.includes("dile") ||
    lower.includes("kiti") ||
    lower.includes("ekun") ||
    lower.includes("liha") ||
    lower.includes("nondva") ||
    lower.includes("parat") ||
    lower.includes("bhau") ||
    lower.includes("त्याच्या") ||
    lower.includes("च्या") ||
    lower.includes("चा") ||
    lower.includes("ची") ||
    lower.includes("चे") ||
    lower.includes("कडून") ||
    lower.includes("नावावर") ||
    lower.includes("आहे") ||
    lower.includes("आहेत") ||
    lower.includes("दिला") ||
    lower.includes("दिले") ||
    lower.includes("किती") ||
    lower.includes("एकूण") ||
    lower.includes("लिहा") ||
    lower.includes("नोंदवा") ||
    lower.includes("परत") ||
    lower.includes("भाऊ")
  ) {
    return "mr-IN";
  }

  return "hi-IN";
}

/**
 * Classifies transaction intent reliably distinguishing ADD_CREDIT vs ADD_PAYMENT.
 * If sentence is ambiguous (e.g. only generic "likho" without "udhaar" or "jama"), marks isAmbiguous = true.
 */
export function classifyTransactionIntent(text: string): IntentClassification {
  const lower = text.toLowerCase();
  const detectedCust = extractCustomerName(text);

  // 0. REVERSE_TRANSACTION (Undo mistake / cancel previous entry)
  if (
    lower.includes("galti ho gayi") ||
    lower.includes("galat ho gaya") ||
    lower.includes("galat likh diya") ||
    lower.includes("last transaction wapas") ||
    lower.includes("last entry hatao") ||
    lower.includes("pichla transaction wapas") ||
    lower.includes("pichli entry hatao") ||
    lower.includes("reversal karo") ||
    lower.includes("reverse karo") ||
    lower.includes("chuk bhali") ||
    lower.includes("chukli") ||
    lower.includes("चुका झाली") ||
    lower.includes("चूक झाली") ||
    lower.includes("गलती हो गई") ||
    lower.includes("गलत लिख दिया") ||
    lower.includes("रिवर्स करो") ||
    lower.includes("वापस करो") && (lower.includes("last") || lower.includes("pichla") || lower.includes("entry"))
  ) {
    return { intent: "REVERSE_TRANSACTION", isAmbiguous: false };
  }

  // 1. CHECK_TOTAL
  if (
    lower.includes("total") ||
    lower.includes("kul") ||
    lower.includes("ekun") ||
    lower.includes("कुल") ||
    lower.includes("एकूण") ||
    lower.includes("टोटल") ||
    lower.includes("sabka") ||
    lower.includes("सबका") ||
    (lower.includes("kitna") && lower.includes("baaki") && !detectedCust) ||
    (lower.includes("kiti") && lower.includes("baaki") && !detectedCust) ||
    (lower.includes("कितना") && lower.includes("बाकी") && !detectedCust) ||
    (lower.includes("किती") && lower.includes("बाकी") && !detectedCust)
  ) {
    if (!detectedCust || lower.includes("dukaan") || lower.includes("store") || lower.includes("दुकान")) {
      return { intent: "CHECK_TOTAL", isAmbiguous: false };
    }
  }

  // 2. CHECK_BALANCE (Individual customer)
  if (
    lower.includes("kitna baaki") ||
    lower.includes("kitna udhaar") ||
    lower.includes("kiti baaki") ||
    lower.includes("hisaab") ||
    lower.includes("hishob") ||
    lower.includes("balance") ||
    lower.includes("kitne lene") ||
    lower.includes("kitne baaki") ||
    lower.includes("कितना बाकी") ||
    lower.includes("किती बाकी") ||
    lower.includes("हिशोब") ||
    lower.includes("हिशाब") ||
    lower.includes("हिसाब") ||
    lower.includes("शिल्लक") ||
    lower.includes("बॅलन्स") ||
    lower.includes("बैलेंस")
  ) {
    return { intent: "CHECK_BALANCE", isAmbiguous: false };
  }

  // 3. Explicit Credit Indicators (Shopkeeper gives goods on credit)
  const hasExplicitCredit =
    lower.includes("udhaar") ||
    lower.includes("udhari") ||
    lower.includes("उधार") ||
    lower.includes("उधारी") ||
    lower.includes("उधारीवर") ||
    lower.includes("saaman diya") ||
    lower.includes("maal diya") ||
    lower.includes("सामान दिया") ||
    lower.includes("माल दिला") ||
    lower.includes("debit");

  // 4. Explicit Payment Indicators (Customer pays money back)
  const hasExplicitPayment =
    lower.includes("jama") ||
    lower.includes("wapas") ||
    lower.includes("parat") ||
    lower.includes("mile") ||
    lower.includes("chuka") ||
    lower.includes("bharde") ||
    lower.includes("paid") ||
    lower.includes("payment") ||
    lower.includes("जमा") ||
    lower.includes("वापस") ||
    lower.includes("परत") ||
    lower.includes("मिळाले") ||
    lower.includes("मिले") ||
    lower.includes("भरले") ||
    lower.includes("चुकवले") ||
    lower.includes("चुकता");

  // Conflict: both credit and payment words present in same statement -> Ambiguous
  if (hasExplicitCredit && hasExplicitPayment) {
    return { intent: "UNKNOWN", isAmbiguous: true };
  }

  if (hasExplicitCredit) {
    return { intent: "ADD_CREDIT", isAmbiguous: false };
  }

  if (hasExplicitPayment) {
    return { intent: "ADD_PAYMENT", isAmbiguous: false };
  }

  // 5. Directional grammar verbs: "diye" / "diya"
  // "Ramesh ne 500 diye" (Ramesh gave shopkeeper) -> ADD_PAYMENT
  // "Ramesh ko 500 diye" (Shopkeeper gave customer) -> ADD_CREDIT
  const hasDiye =
    lower.includes("diye") ||
    lower.includes("diya") ||
    lower.includes("दिले") ||
    lower.includes("दिला") ||
    lower.includes("दिया");

  if (hasDiye) {
    if (/\b(?:ne|ने|कडून|kadun)\b/i.test(lower)) {
      return { intent: "ADD_PAYMENT", isAmbiguous: false };
    }
    if (/\b(?:ko|को|ला|la)\b/i.test(lower)) {
      return { intent: "ADD_CREDIT", isAmbiguous: false };
    }
    return { intent: "UNKNOWN", isAmbiguous: true };
  }

  // 6. Generic action verbs without credit/payment direction
  // "likho", "likh", "liha", "jod", "karo", "naam par", "nondva"
  const hasGenericVerb =
    lower.includes("likho") ||
    lower.includes("likh") ||
    lower.includes("liha") ||
    lower.includes("nondva") ||
    lower.includes("jod") ||
    lower.includes("jodo") ||
    lower.includes("karo") ||
    lower.includes("kara") ||
    lower.includes("daalo") ||
    lower.includes("likha") ||
    lower.includes("लिखो") ||
    lower.includes("लिख") ||
    lower.includes("लिहा") ||
    lower.includes("नोंदवा") ||
    lower.includes("जोड") ||
    lower.includes("जोडा") ||
    lower.includes("करो") ||
    lower.includes("करा") ||
    lower.includes("टाका") ||
    lower.includes("naam par") ||
    lower.includes("नाम पर");

  if (hasGenericVerb) {
    return { intent: "UNKNOWN", isAmbiguous: true };
  }

  return { intent: "UNKNOWN", isAmbiguous: false };
}

/**
 * Detects the intent of a single shopkeeper statement (Hinglish/Marathi/Hindi/Devanagari)
 */
export function detectSingleIntent(text: string): ShopkeeperIntent {
  const result = classifyTransactionIntent(text);
  return result.intent;
}

/**
 * Detects if the utterance contains multiple operations (e.g. "Ramesh ko 500 udhaar aur Amit ne 200 wapas diye")
 */
export function detectMultipleOperations(text: string): StructuredCommand[] | null {
  // Check for conjunctions: "aur", "ani", "and", "plus"
  const splitRegex = /\b(?:aur|ani|and|,)\b/i;
  const segments = text.split(splitRegex).map((s) => s.trim()).filter((s) => s.length > 5);

  if (segments.length >= 2) {
    const ops: StructuredCommand[] = [];

    for (const segment of segments) {
      const intent = detectSingleIntent(segment);
      if (intent === "ADD_CREDIT" || intent === "ADD_PAYMENT") {
        const cust = extractCustomerName(segment);
        const amt = extractAmount(segment);
        ops.push({
          intent,
          customer_name: cust,
          amount: amt,
          description: null,
          missing_fields: [
            ...(cust ? [] : (["customer_name"] as const)),
            ...(amt ? [] : (["amount"] as const)),
          ],
          needs_clarification: !cust || !amt,
          confidence: 0.92,
        });
      }
    }

    if (ops.length >= 2) {
      return ops;
    }
  }

  return null;
}

/**
 * Attempts to call a self-hosted or cloud Gnani Evon LLM API endpoint if configured
 */
async function callEvonLLM(
  prompt: string,
  evonUrl: string,
  apiKey?: string
): Promise<StructuredCommand | null> {
  try {
    const model = process.env.EVON_MODEL || "gnani/gnani-evon-v3.3-30B-A3B";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-Key-ID"] = apiKey;
    }

    const payload = {
      model,
      messages: [
        {
          role: "system",
          content: `You are Ekhaata NLU assistant. Parse shopkeeper Hindi/Marathi/Hinglish speech into JSON:
{
  "intent": "ADD_CREDIT" | "ADD_PAYMENT" | "CHECK_BALANCE" | "CHECK_TOTAL" | "UNKNOWN",
  "customer_name": string | null,
  "amount": number | null,
  "description": string | null,
  "missing_fields": string[],
  "needs_clarification": boolean
}
Return ONLY pure JSON.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
    };

    const res = await fetch(evonUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000), // Fast 4s timeout
    });

    if (res.ok) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Evon LLM endpoint call failed or timed out:", err);
  }
  return null;
}

/**
 * Core conversation processing engine:
 * 1. Checks for Evon API endpoint access.
 * 2. Employs Indic NLU parser with context resolution.
 * 3. Enforces single-question clarification engine.
 */
export async function parseShopkeeperCommand(
  transcript: string,
  context?: ConversationContext,
  shopId?: string | null,
  audioParams?: {
    audioBase64?: string | null;
    audioMimeType?: string | null;
  }
): Promise<ConversationResponse> {
  const evonApiUrl = process.env.EVON_API_URL;
  const evonApiKey = process.env.EVON_API_KEY || process.env.GNANI_API_KEY;

  let evonAvailable = false;
  let engineUsed: "gemini-flash" | "evon-api" | "indic-nlu-engine" = "indic-nlu-engine";
  let geminiInterpretation: GeminiAudioInterpretation | null = null;

  // 0. Gemini Multimodal Audio & Bookkeeping Understanding
  // If GEMINI_API_KEY is available, let Gemini inspect audio + Prisma transcript
  if (process.env.GEMINI_API_KEY) {
    geminiInterpretation = await interpretShopkeeperSpeechWithGemini({
      audioBase64: audioParams?.audioBase64,
      audioMimeType: audioParams?.audioMimeType,
      prismaTranscript: transcript,
      contextCustomerName: context?.lastCustomerName,
    });
    if (geminiInterpretation) {
      engineUsed = "gemini-flash";
    }
  }

  // 0. Language detection for TTS response
  let detectedLang: "hi-IN" | "mr-IN" | "en-IN" = "hi-IN";
  if (geminiInterpretation?.language === "Marathi") {
    detectedLang = "mr-IN";
  } else if (geminiInterpretation?.language === "English") {
    detectedLang = "en-IN";
  } else {
    detectedLang = detectLanguageFromText(transcript);
  }

  // Handle explicit Reversal intent ("Galti ho gayi, last transaction wapas karo")
  const classification = classifyTransactionIntent(transcript);
  let intent = classification.intent;

  // Integrate Gemini's multi-modal audio interpretation (if Gemini was invoked successfully):
  if (geminiInterpretation) {
    if (geminiInterpretation.transaction_type && geminiInterpretation.transaction_type !== "UNKNOWN") {
      intent = geminiInterpretation.transaction_type;
    }
  }

  // Handle confirmation for REVERSAL
  if (context?.lastQuestionType === "reversal_confirmation") {
    const lower = transcript.toLowerCase();
    const isAffirmative =
      lower.includes("haan") ||
      lower.includes("ha") ||
      lower.includes("sahi") ||
      lower.includes("theek") ||
      lower.includes("ho") ||
      lower.includes("yes") ||
      lower.includes("kar do") ||
      lower.includes("wapas") ||
      lower.includes("hata do") ||
      lower.includes("हा") ||
      lower.includes("हो") ||
      lower.includes("बरोबर") ||
      lower.includes("ठीक") ||
      lower.includes("सही");

    const isNegative =
      lower.includes("nahi") ||
      lower.includes("na") ||
      lower.includes("cancel") ||
      lower.includes("galat") ||
      lower.includes("nako") ||
      lower.includes("rehne do") ||
      lower.includes("नाही") ||
      lower.includes("नको") ||
      lower.includes("गलत");

    if (isAffirmative && context.pendingReversalId) {
      try {
        await reverseTransaction(
          context.pendingReversalId,
          "User voice reversal request",
          shopId
        );

        const custName = context.pendingReversalCustomer || "Grahak";
        const balInfo = await getCustomerBalance(custName, shopId);

        const revSuccessReply =
          detectedLang === "mr-IN"
            ? `मागील व्यवहार रद्द केला! ${balInfo.displayName} चा व्यवहार उलट नोंदवला. आता शिल्लक ₹${balInfo.balance.toLocaleString("en-IN")} आहे.`
            : `Pichla transaction cancel kar diya hai! ${balInfo.displayName} ka hisaab theek ho gaya. Ab baaki balance ₹${balInfo.balance.toLocaleString("en-IN")} hai.`;

        return {
          success: true,
          command: {
            intent: "REVERSE_TRANSACTION",
            customer_name: balInfo.displayName,
            amount: context.pendingReversalAmount || null,
            description: `Reversal of ${context.pendingReversalId}`,
            missing_fields: [],
            needs_clarification: false,
            confidence: 0.99,
          },
          reply: revSuccessReply,
          updatedContext: {
            lastCustomerName: balInfo.displayName,
          },
          engineUsed,
          evonAvailable,
          geminiUsed: !!geminiInterpretation,
          detectedLanguage: detectedLang,
          customerBalance: balInfo.balance,
          totalPending: await getTotalPendingUdhaar(shopId),
          activeCustomersCount: await getActiveCustomersCount(shopId),
          transactions: await getRecentTransactions(5, shopId),
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Reversal failed";
        return {
          success: false,
          command: {
            intent: "REVERSE_TRANSACTION",
            customer_name: null,
            amount: null,
            description: null,
            missing_fields: [],
            needs_clarification: false,
            confidence: 0.5,
          },
          reply: `Reversal karne me dikkat aayi: ${errMsg}`,
          updatedContext: {},
          engineUsed,
          evonAvailable,
          detectedLanguage: detectedLang,
          error: errMsg,
        };
      }
    } else if (isNegative) {
      return {
        success: true,
        command: {
          intent: "UNKNOWN",
          customer_name: null,
          amount: null,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.99,
        },
        reply: "Theek hai, reversal cancel kar diya hai. Kuch aur likhna hai?",
        updatedContext: {},
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        detectedLanguage: detectedLang,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }
  }

  // Handle confirmation for multiple transactions or single transaction
  if (context?.lastQuestionType === "confirmation") {
    const lower = transcript.toLowerCase();
    const isAffirmative =
      lower.includes("haan") ||
      lower.includes("ha") ||
      lower.includes("sahi") ||
      lower.includes("theek") ||
      lower.includes("ho") ||
      lower.includes("yes") ||
      lower.includes("kar do") ||
      lower.includes("likh lo") ||
      lower.includes("likho") ||
      lower.includes("dono likho") ||
      lower.includes("हा") ||
      lower.includes("हो") ||
      lower.includes("बरोबर") ||
      lower.includes("ठीक") ||
      lower.includes("सही");

    const isNegative =
      lower.includes("nahi") ||
      lower.includes("na") ||
      lower.includes("cancel") ||
      lower.includes("galat") ||
      lower.includes("nako") ||
      lower.includes("नाही") ||
      lower.includes("नको") ||
      lower.includes("गलत");

    // Case 1: Multiple pending transactions confirmed!
    if (isAffirmative && context.pendingMultipleOps && context.pendingMultipleOps.length >= 2) {
      const ops = context.pendingMultipleOps;
      const savedSummaries: string[] = [];

      for (const op of ops) {
        const txType = op.intent === "ADD_CREDIT" ? "udhaar" : "jama";
        await recordTransaction(op.customer_name, txType, op.amount, undefined, shopId);
        const bal = await getCustomerBalance(op.customer_name, shopId);
        savedSummaries.push(
          `${bal.displayName} ka ₹${op.amount} ${txType} (baaki: ₹${bal.balance.toLocaleString("en-IN")})`
        );
      }

      const multiReply =
        detectedLang === "mr-IN"
          ? `दोन्ही नोंदी पूर्ण झाल्या! ${savedSummaries.join(" आणि ")}.`
          : `Likh liya! ${savedSummaries.join(" aur ")}.`;

      return {
        success: true,
        command: {
          intent: ops[0].intent,
          customer_name: ops[0].customer_name,
          amount: ops[0].amount,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.99,
        },
        reply: multiReply,
        updatedContext: {
          lastCustomerName: ops[ops.length - 1].customer_name,
        },
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        correctedTranscript: geminiInterpretation?.corrected_transcript,
        detectedLanguage: detectedLang,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    // Case 2: Single pending transaction confirmed!
    if (isAffirmative && context.pendingCustomerName && context.pendingAmount && context.pendingIntent) {
      const resolvedCustomer = context.pendingCustomerName;
      const resolvedAmount = context.pendingAmount;
      const resolvedIntent = context.pendingIntent;

      if (resolvedIntent === "ADD_CREDIT") {
        await recordTransaction(resolvedCustomer, "udhaar", resolvedAmount, undefined, shopId);
      } else {
        await recordTransaction(resolvedCustomer, "jama", resolvedAmount, undefined, shopId);
      }

      const balanceInfo = await getCustomerBalance(resolvedCustomer, shopId);

      const finalReply =
        detectedLang === "mr-IN"
          ? (resolvedIntent === "ADD_CREDIT"
              ? `नोंद झाली! ${balanceInfo.displayName} चे ₹${resolvedAmount.toLocaleString("en-IN")} उधार नोंदवले. आता एकूण बाकी ₹${balanceInfo.balance.toLocaleString("en-IN")} आहे.`
              : `नोंद झाली! ${balanceInfo.displayName} चे ₹${resolvedAmount.toLocaleString("en-IN")} जमा झाले. आता शिल्लक ₹${balanceInfo.balance.toLocaleString("en-IN")} आहे.`)
          : (resolvedIntent === "ADD_CREDIT"
              ? `Likh liya! ${balanceInfo.displayName} ka ₹${resolvedAmount.toLocaleString("en-IN")} udhaar darj ho gaya. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`
              : `Likh liya! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama ho gaye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`);

      return {
        success: true,
        command: {
          intent: resolvedIntent,
          customer_name: balanceInfo.displayName,
          amount: resolvedAmount,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.99,
        },
        reply: finalReply,
        updatedContext: {
          lastCustomerName: balanceInfo.displayName,
        },
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        correctedTranscript: geminiInterpretation?.corrected_transcript,
        detectedLanguage: detectedLang,
        customerBalance: balanceInfo.balance,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    } else if (isNegative) {
      return {
        success: true,
        command: {
          intent: "UNKNOWN",
          customer_name: null,
          amount: null,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.99,
        },
        reply: "Theek hai, transaction cancel kar diya hai. Kuch aur likhna hai?",
        updatedContext: {},
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        detectedLanguage: detectedLang,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }
  }

  // 1. Try Evon API if explicit EVON_API_URL is configured
  if (evonApiUrl) {
    const evonRes = await callEvonLLM(transcript, evonApiUrl, evonApiKey);
    if (evonRes && evonRes.intent) {
      evonAvailable = true;
      engineUsed = "evon-api";
      return {
        success: true,
        command: evonRes,
        reply:
          evonRes.clarification_question ||
          `${evonRes.customer_name || "Grahak"} ka ₹${
            evonRes.amount || 0
          } jod doon?`,
        updatedContext: {},
        engineUsed,
        evonAvailable,
        detectedLanguage: detectedLang,
      };
    }
  }

  // 2. Check for REVERSE_TRANSACTION command ("Galti ho gayi, last transaction wapas karo")
  if (intent === "REVERSE_TRANSACTION") {
    const lastTx = await getLastReversibleTransaction(shopId);
    if (!lastTx) {
      const noTxReply =
        detectedLang === "mr-IN"
          ? "मागे रद्द करण्यासाठी कोणताही व्यवहार सापडला नाही."
          : "Wapas karne ke liye koi pichla transaction nahi mila.";
      return {
        success: true,
        command: {
          intent: "REVERSE_TRANSACTION",
          customer_name: null,
          amount: null,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.95,
        },
        reply: noTxReply,
        updatedContext: {},
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        detectedLanguage: detectedLang,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    const typeDesc = lastTx.type === "udhaar" ? "udhaar" : "jama";
    const confirmRevReply =
      detectedLang === "mr-IN"
        ? `शेवटचा व्यवहार: ${lastTx.customerName} चे ₹${lastTx.amount} ${typeDesc}. हा व्यवहार रद्द करून उलट नोंद करायची का?`
        : `Aakhri transaction: ${lastTx.customerName} ka ₹${lastTx.amount} ${typeDesc}. Kya is transaction ko wapas (reverse) karna hai?`;

    return {
      success: true,
      command: {
        intent: "REVERSE_TRANSACTION",
        customer_name: lastTx.customerName,
        amount: lastTx.amount,
        description: `Pending reversal for ${lastTx.id}`,
        missing_fields: [],
        needs_clarification: true,
        clarification_question: confirmRevReply,
        confidence: 0.98,
      },
      reply: confirmRevReply,
      updatedContext: {
        lastQuestionType: "reversal_confirmation",
        pendingReversalId: lastTx.id,
        pendingReversalCustomer: lastTx.customerName,
        pendingReversalAmount: lastTx.amount,
        pendingReversalType: lastTx.type,
      },
      engineUsed,
      evonAvailable,
      geminiUsed: !!geminiInterpretation,
      detectedLanguage: detectedLang,
      totalPending: await getTotalPendingUdhaar(shopId),
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  // 3. Multi-operation check (from Gemini or regex detection)
  // E.g. "Ramesh ko 500 udhaar aur Amit ne 200 wapas diye"
  let multiOpsList: Array<{
    customer_name: string;
    amount: number;
    intent: "ADD_CREDIT" | "ADD_PAYMENT";
  }> | null = null;

  if (
    geminiInterpretation?.multiple_operations &&
    geminiInterpretation.multiple_operations.length >= 2
  ) {
    multiOpsList = geminiInterpretation.multiple_operations.map((op) => ({
      customer_name: op.customer_name,
      amount: op.amount,
      intent: op.transaction_type,
    }));
  } else {
    const rawOps = detectMultipleOperations(transcript);
    if (rawOps && rawOps.length >= 2) {
      multiOpsList = rawOps
        .filter((op) => op.customer_name && op.amount && op.amount > 0)
        .map((op) => ({
          customer_name: op.customer_name!,
          amount: op.amount!,
          intent: op.intent === "ADD_PAYMENT" ? "ADD_PAYMENT" : "ADD_CREDIT",
        }));
    }
  }

  if (multiOpsList && multiOpsList.length >= 2) {
    const summaries = multiOpsList.map(
      (op) =>
        `${op.customer_name} ka ₹${op.amount} ${
          op.intent === "ADD_CREDIT" ? "udhaar" : "jama"
        }`
    );

    const multiConfirmReply =
      detectedLang === "mr-IN"
        ? `${summaries.join(" आणि ")} - दोन्ही नोंदी करायच्या का?`
        : `${summaries.join(" aur ")} - dono likh loon?`;

    const compoundCommand: StructuredCommand = {
      intent: multiOpsList[0].intent,
      customer_name: multiOpsList[0].customer_name,
      amount: multiOpsList[0].amount,
      description: null,
      missing_fields: [],
      needs_clarification: true,
      clarification_question: multiConfirmReply,
      confidence: 0.95,
      multiple_operations: multiOpsList.map((op) => ({
        intent: op.intent,
        customer_name: op.customer_name,
        amount: op.amount,
        description: null,
        missing_fields: [],
        needs_clarification: false,
        confidence: 0.95,
      })),
    };

    return {
      success: true,
      command: compoundCommand,
      reply: multiConfirmReply,
      updatedContext: {
        lastQuestionType: "confirmation",
        pendingMultipleOps: multiOpsList,
      },
      engineUsed,
      evonAvailable,
      geminiUsed: !!geminiInterpretation,
      detectedLanguage: detectedLang,
      totalPending: await getTotalPendingUdhaar(shopId),
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  // 4. Single Transaction contextual resolution
  const amountDetails = extractAmountWithDetails(transcript);
  let currentAmount = amountDetails ? amountDetails.amount : null;
  let currentCustomer = extractCustomerName(transcript);

  // Integrate Gemini's multi-modal audio interpretation:
  if (geminiInterpretation) {
    if (geminiInterpretation.amount !== null && geminiInterpretation.confidence >= 0.6) {
      currentAmount = geminiInterpretation.amount;
    }
    if (geminiInterpretation.customer_name && geminiInterpretation.confidence >= 0.6) {
      currentCustomer = geminiInterpretation.customer_name;
    }
  }

  // If previous turn was asking for intent ("Udhaar diya ya paise mile?"), amount, or customer:
  if (context?.lastQuestionType) {
    // A. Shopkeeper answered the intent question!
    if (context.lastQuestionType === "intent") {
      const lower = transcript.toLowerCase();
      let resolvedIntent: ShopkeeperIntent | null = null;

      if (
        lower.includes("udhaar") ||
        lower.includes("उधार") ||
        lower.includes("diya") ||
        lower.includes("दिया") ||
        lower.includes("saaman") ||
        lower.includes("सामान") ||
        lower.includes("credit")
      ) {
        resolvedIntent = "ADD_CREDIT";
      } else if (
        lower.includes("paise") ||
        lower.includes("mile") ||
        lower.includes("jama") ||
        lower.includes("wapas") ||
        lower.includes("पैसे") ||
        lower.includes("मिले") ||
        lower.includes("जमा") ||
        lower.includes("वापस") ||
        lower.includes("payment")
      ) {
        resolvedIntent = "ADD_PAYMENT";
      }

      if (resolvedIntent) {
        const resolvedCustomer =
          context.pendingCustomerName || currentCustomer || context.lastCustomerName || "Grahak";
        const resolvedAmount = context.pendingAmount || currentAmount;

        if (resolvedAmount && resolvedAmount > 0) {
          // Record transaction into ledger
          if (resolvedIntent === "ADD_CREDIT") {
            await recordTransaction(resolvedCustomer, "udhaar", resolvedAmount, undefined, shopId);
          } else {
            await recordTransaction(resolvedCustomer, "jama", resolvedAmount, undefined, shopId);
          }

          const balanceInfo = await getCustomerBalance(resolvedCustomer, shopId);

          const finalCommand: StructuredCommand = {
            intent: resolvedIntent,
            customer_name: balanceInfo.displayName,
            amount: resolvedAmount,
            description: context.pendingDescription || null,
            missing_fields: [],
            needs_clarification: false,
            confidence: 0.98,
          };

          const reply =
            resolvedIntent === "ADD_CREDIT"
              ? `Ho gaya! ${balanceInfo.displayName} ka ₹${resolvedAmount.toLocaleString("en-IN")} udhaar likh liya hai. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`
              : `Theek hai! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama kar liye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;

          return {
            success: true,
            command: finalCommand,
            reply,
            updatedContext: {
              lastCustomerName: balanceInfo.displayName,
            },
            engineUsed,
            evonAvailable,
            customerBalance: balanceInfo.balance,
            totalPending: await getTotalPendingUdhaar(shopId),
            activeCustomersCount: await getActiveCustomersCount(shopId),
            transactions: await getRecentTransactions(5, shopId),
          };
        } else {
          // Customer is known, but amount still needed
          return {
            success: true,
            command: {
              intent: resolvedIntent,
              customer_name: resolvedCustomer,
              amount: null,
              description: null,
              missing_fields: ["amount"],
              needs_clarification: true,
              clarification_question: "Kitne rupaye?",
              confidence: 0.9,
            },
            reply: "Kitne rupaye?",
            updatedContext: {
              pendingCustomerName: resolvedCustomer,
              pendingIntent: resolvedIntent,
              lastQuestionType: "amount",
              lastCustomerName: resolvedCustomer,
            },
            engineUsed,
            evonAvailable,
            totalPending: await getTotalPendingUdhaar(shopId),
            activeCustomersCount: await getActiveCustomersCount(shopId),
            transactions: await getRecentTransactions(5, shopId),
          };
        }
      } else {
        // Still ambiguous, repeat clarification question
        return {
          success: true,
          command: {
            intent: "UNKNOWN",
            customer_name: context.pendingCustomerName || currentCustomer || null,
            amount: context.pendingAmount || currentAmount || null,
            description: null,
            missing_fields: ["intent"],
            needs_clarification: true,
            clarification_question: "Udhaar diya ya paise mile?",
            confidence: 0.5,
          },
          reply: "Udhaar diya ya paise mile?",
          updatedContext: {
            ...context,
            lastQuestionType: "intent",
          },
          engineUsed,
          evonAvailable,
          totalPending: await getTotalPendingUdhaar(shopId),
          activeCustomersCount: await getActiveCustomersCount(shopId),
          transactions: await getRecentTransactions(5, shopId),
        };
      }
    }

    // B. Shopkeeper answered the amount!
    if (context.lastQuestionType === "amount" && currentAmount !== null && currentAmount > 0) {
      const resolvedCustomer = context.pendingCustomerName || context.lastCustomerName || "Grahak";
      const resolvedIntent = context.pendingIntent || "ADD_CREDIT";

      // Record transaction into ledger!
      if (resolvedIntent === "ADD_CREDIT") {
        await recordTransaction(resolvedCustomer, "udhaar", currentAmount, undefined, shopId);
      } else if (resolvedIntent === "ADD_PAYMENT") {
        await recordTransaction(resolvedCustomer, "jama", currentAmount, undefined, shopId);
      }

      const balanceInfo = await getCustomerBalance(resolvedCustomer, shopId);

      const finalCommand: StructuredCommand = {
        intent: resolvedIntent,
        customer_name: balanceInfo.displayName,
        amount: currentAmount,
        description: context.pendingDescription || null,
        missing_fields: [],
        needs_clarification: false,
        confidence: 0.98,
      };

      const reply =
        resolvedIntent === "ADD_CREDIT"
          ? `Ho gaya! ${balanceInfo.displayName} ka ₹${currentAmount.toLocaleString("en-IN")} udhaar likh liya hai. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`
          : `Theek hai! ${balanceInfo.displayName} ke ₹${currentAmount.toLocaleString("en-IN")} jama kar liye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;

      return {
        success: true,
        command: finalCommand,
        reply,
        updatedContext: {
          lastCustomerName: balanceInfo.displayName,
        },
        engineUsed,
        evonAvailable,
        customerBalance: balanceInfo.balance,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    // C. Disambiguation answer (e.g. shopkeeper answers "Patil", "Suresh Patil", "Deshmukh"):
    if (context.lastQuestionType === "customer_disambiguation") {
      const rawAns = transcript.trim();
      const extractedAns = extractCustomerName(transcript) || rawAns;
      let match = await findCustomerMatch(extractedAns, shopId);
      if (match.status !== "exact_match" && match.status !== "single_match" && context.pendingCustomerName) {
        match = await findCustomerMatch(`${context.pendingCustomerName} ${extractedAns}`, shopId);
      }

      if (match.status === "exact_match" || match.status === "single_match") {
        const resolvedCustomer = match.matchedName!;
        const resolvedIntent = context.pendingIntent || "CHECK_BALANCE";

        if (resolvedIntent === "CHECK_BALANCE") {
          const balanceInfo = await getCustomerBalance(resolvedCustomer, shopId);
          let balReply = "";
          if (!balanceInfo.exists || balanceInfo.balance === 0) {
            balReply = `${balanceInfo.displayName} ka koi baaki hisaab nahi hai. Balance ₹0 hai.`;
          } else if (balanceInfo.balance < 0) {
            balReply = `${balanceInfo.displayName} ka koi baaki udhaar nahi hai. Unke ₹${Math.abs(balanceInfo.balance).toLocaleString("en-IN")} jama (advance) hain.`;
          } else {
            balReply = `${balanceInfo.displayName} ka baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
          }

          return {
            success: true,
            command: {
              intent: "CHECK_BALANCE",
              customer_name: balanceInfo.displayName,
              amount: balanceInfo.balance,
              description: null,
              missing_fields: [],
              needs_clarification: false,
              confidence: 0.98,
            },
            reply: balReply,
            updatedContext: {
              lastCustomerName: balanceInfo.displayName,
            },
            engineUsed,
            evonAvailable,
            customerBalance: balanceInfo.balance,
            totalPending: await getTotalPendingUdhaar(shopId),
            activeCustomersCount: await getActiveCustomersCount(shopId),
            transactions: await getRecentTransactions(5, shopId),
          };
        } else {
          // ADD_CREDIT or ADD_PAYMENT
          const resolvedAmount = context.pendingAmount;
          if (resolvedAmount && resolvedAmount > 0) {
            if (resolvedIntent === "ADD_CREDIT") {
              await recordTransaction(resolvedCustomer, "udhaar", resolvedAmount, undefined, shopId);
            } else {
              await recordTransaction(resolvedCustomer, "jama", resolvedAmount, undefined, shopId);
            }
            const balanceInfo = await getCustomerBalance(resolvedCustomer, shopId);

            let addReply = "";
            if (resolvedIntent === "ADD_CREDIT") {
              addReply = `Ho gaya! ${balanceInfo.displayName} ka ₹${resolvedAmount.toLocaleString("en-IN")} udhaar likh liya hai. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
            } else {
              if (balanceInfo.balance > 0) {
                addReply = `Theek hai! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama kar liye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
              } else if (balanceInfo.balance === 0) {
                addReply = `Theek hai! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama kar liye. Poora hisaab barabar ho gaya hai (₹0 baaki).`;
              } else {
                addReply = `Theek hai! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama kar liye. Unka ₹${Math.abs(balanceInfo.balance).toLocaleString("en-IN")} advance (jama) hai, koi udhaar baaki nahi hai.`;
              }
            }

            return {
              success: true,
              command: {
                intent: resolvedIntent,
                customer_name: balanceInfo.displayName,
                amount: resolvedAmount,
                description: null,
                missing_fields: [],
                needs_clarification: false,
                confidence: 0.98,
              },
              reply: addReply,
              updatedContext: {
                lastCustomerName: balanceInfo.displayName,
              },
              engineUsed,
              evonAvailable,
              detectedLanguage: detectedLang,
              customerBalance: balanceInfo.balance,
              totalPending: await getTotalPendingUdhaar(shopId),
              activeCustomersCount: await getActiveCustomersCount(shopId),
              transactions: await getRecentTransactions(5, shopId),
            };
          }
        }
      }
    }

    // D. Shopkeeper answered the customer name!
    if (context.lastQuestionType === "customer_name") {
      const targetCustomer = currentCustomer || extractCustomerName(transcript) || transcript.trim();
      const resolvedIntent = context.pendingIntent || "ADD_CREDIT";

      if (resolvedIntent === "CHECK_BALANCE") {
        const matchResult = await findCustomerMatch(targetCustomer, shopId);

        if (matchResult.status === "ambiguous") {
          const qToken = matchResult.queryFirstToken.charAt(0).toUpperCase() + matchResult.queryFirstToken.slice(1);
          return {
            success: true,
            command: {
              intent: "CHECK_BALANCE",
              customer_name: targetCustomer,
              amount: null,
              description: null,
              missing_fields: ["customer_name"],
              needs_clarification: true,
              clarification_question: `Kaunse ${qToken}?`,
              confidence: 0.8,
            },
            reply: `Kaunse ${qToken}?`,
            updatedContext: {
              pendingCustomerName: targetCustomer,
              pendingIntent: "CHECK_BALANCE",
              lastQuestionType: "customer_disambiguation",
            },
            engineUsed,
            evonAvailable,
            totalPending: await getTotalPendingUdhaar(shopId),
            activeCustomersCount: await getActiveCustomersCount(shopId),
            transactions: await getRecentTransactions(5, shopId),
          };
        }

        if (matchResult.status === "no_match") {
          return {
            success: true,
            command: {
              intent: "CHECK_BALANCE",
              customer_name: targetCustomer,
              amount: null,
              description: null,
              missing_fields: ["customer_name"],
              needs_clarification: true,
              clarification_question: "Ye customer nahi mila. Dobara naam bataiye.",
              confidence: 0.5,
            },
            reply: "Ye customer nahi mila. Dobara naam bataiye.",
            updatedContext: {
              pendingIntent: "CHECK_BALANCE",
              lastQuestionType: "customer_name",
            },
            engineUsed,
            evonAvailable,
            totalPending: await getTotalPendingUdhaar(shopId),
            activeCustomersCount: await getActiveCustomersCount(shopId),
            transactions: await getRecentTransactions(5, shopId),
          };
        }

        const canonicalName = matchResult.matchedName || targetCustomer;
        const balanceInfo = await getCustomerBalance(canonicalName, shopId);
        let balReply = "";
        if (!balanceInfo.exists || balanceInfo.balance === 0) {
          balReply = `${balanceInfo.displayName} ka koi baaki hisaab nahi hai. Balance ₹0 hai.`;
        } else if (balanceInfo.balance < 0) {
          balReply = `${balanceInfo.displayName} ka koi baaki udhaar nahi hai. Unke ₹${Math.abs(balanceInfo.balance).toLocaleString("en-IN")} jama (advance) hain.`;
        } else {
          balReply = `${balanceInfo.displayName} ka baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
        }

        return {
          success: true,
          command: {
            intent: "CHECK_BALANCE",
            customer_name: balanceInfo.displayName,
            amount: balanceInfo.balance,
            description: null,
            missing_fields: [],
            needs_clarification: false,
            confidence: 0.98,
          },
          reply: balReply,
          updatedContext: {
            lastCustomerName: balanceInfo.displayName,
          },
          engineUsed,
          evonAvailable,
          customerBalance: balanceInfo.balance,
          totalPending: await getTotalPendingUdhaar(shopId),
          activeCustomersCount: await getActiveCustomersCount(shopId),
          transactions: await getRecentTransactions(5, shopId),
        };
      }

      const resolvedAmount = context.pendingAmount;

      if (resolvedAmount && resolvedAmount > 0) {
        const matchResult = await findCustomerMatch(targetCustomer, shopId);
        const finalCustomer = (matchResult.status === "exact_match" || matchResult.status === "single_match")
          ? matchResult.matchedName!
          : targetCustomer;

        if (resolvedIntent === "ADD_CREDIT") {
          await recordTransaction(finalCustomer, "udhaar", resolvedAmount, undefined, shopId);
        } else if (resolvedIntent === "ADD_PAYMENT") {
          await recordTransaction(finalCustomer, "jama", resolvedAmount, undefined, shopId);
        }

        const balanceInfo = await getCustomerBalance(finalCustomer, shopId);

        const finalCommand: StructuredCommand = {
          intent: resolvedIntent,
          customer_name: balanceInfo.displayName,
          amount: resolvedAmount,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          confidence: 0.98,
        };

        const reply =
          resolvedIntent === "ADD_CREDIT"
            ? `Ho gaya! ${balanceInfo.displayName} ka ₹${resolvedAmount.toLocaleString("en-IN")} udhaar likh liya hai. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`
            : `Theek hai! ${balanceInfo.displayName} ke ₹${resolvedAmount.toLocaleString("en-IN")} jama kar liye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;

        return {
          success: true,
          command: finalCommand,
          reply,
          updatedContext: {
            lastCustomerName: balanceInfo.displayName,
          },
          engineUsed,
          evonAvailable,
          customerBalance: balanceInfo.balance,
          totalPending: await getTotalPendingUdhaar(shopId),
          activeCustomersCount: await getActiveCustomersCount(shopId),
          transactions: await getRecentTransactions(5, shopId),
        };
      }

      // If amount still needed
      return {
        success: true,
        command: {
          intent: resolvedIntent,
          customer_name: targetCustomer,
          amount: null,
          description: null,
          missing_fields: ["amount"],
          needs_clarification: true,
          clarification_question: "Kitne rupaye?",
          confidence: 0.95,
        },
        reply: "Kitne rupaye?",
        updatedContext: {
          pendingCustomerName: targetCustomer,
          pendingIntent: resolvedIntent,
          lastQuestionType: "amount",
          lastCustomerName: targetCustomer,
        },
        engineUsed,
        evonAvailable,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }
  }

  // 4. If transaction classification is AMBIGUOUS between credit and payment:
  if (classification.isAmbiguous) {
    // Ask one simple clarification question: "Udhaar diya ya paise mile?"
    return {
      success: true,
      command: {
        intent: "UNKNOWN",
        customer_name: currentCustomer,
        amount: currentAmount,
        description: null,
        missing_fields: ["intent"],
        needs_clarification: true,
        clarification_question: "Udhaar diya ya paise mile?",
        confidence: 0.7,
      },
      reply: "Udhaar diya ya paise mile?",
      updatedContext: {
        pendingCustomerName: currentCustomer,
        pendingAmount: currentAmount,
        lastQuestionType: "intent",
        lastCustomerName: currentCustomer || context?.lastCustomerName || null,
      },
      engineUsed,
      evonAvailable,
      totalPending: await getTotalPendingUdhaar(shopId),
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  // 5. Standard Intent Execution
  let missing_fields: ("customer_name" | "amount" | "intent")[] = [];
  let clarification_question: string | null = null;
  let reply = "";
  const updatedContext: ConversationContext = {
    lastCustomerName: currentCustomer || context?.lastCustomerName || null,
  };

  if (intent === "CHECK_TOTAL") {
    const total = await getTotalPendingUdhaar(shopId);
    reply = `Dukaan ka kul baaki udhaar ₹${total.toLocaleString("en-IN")} hai.`;
    return {
      success: true,
      command: {
        intent: "CHECK_TOTAL",
        customer_name: null,
        amount: total,
        description: null,
        missing_fields: [],
        needs_clarification: false,
        confidence: 0.96,
      },
      reply,
      updatedContext,
      engineUsed,
      evonAvailable,
      totalPending: total,
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  if (intent === "CHECK_BALANCE") {
    const targetCustomer = currentCustomer || context?.lastCustomerName || null;

    if (!targetCustomer) {
      missing_fields = ["customer_name"];
      clarification_question = "Kiska hisaab dekhna hai?";
      reply = "Kiska hisaab dekhna hai?";
      updatedContext.pendingIntent = "CHECK_BALANCE";
      updatedContext.lastQuestionType = "customer_name";
      return {
        success: true,
        command: {
          intent: "CHECK_BALANCE",
          customer_name: null,
          amount: null,
          description: null,
          missing_fields,
          needs_clarification: true,
          clarification_question,
          confidence: 0.7,
        },
        reply,
        updatedContext,
        engineUsed,
        evonAvailable,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    // Match customer name against actual records in the ledger
    const matchResult = await findCustomerMatch(targetCustomer, shopId);

    // If multiple customers have similar names, ask: "Kaunse Suresh?"
    if (matchResult.status === "ambiguous") {
      const qToken = matchResult.queryFirstToken.charAt(0).toUpperCase() + matchResult.queryFirstToken.slice(1);
      clarification_question = `Kaunse ${qToken}?`;
      reply = `Kaunse ${qToken}?`;
      updatedContext.pendingCustomerName = targetCustomer;
      updatedContext.pendingIntent = "CHECK_BALANCE";
      updatedContext.lastQuestionType = "customer_disambiguation";
      return {
        success: true,
        command: {
          intent: "CHECK_BALANCE",
          customer_name: targetCustomer,
          amount: null,
          description: null,
          missing_fields: ["customer_name"],
          needs_clarification: true,
          clarification_question,
          confidence: 0.8,
        },
        reply,
        updatedContext,
        engineUsed,
        evonAvailable,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    // If no customer matches, say: "Ye customer nahi mila. Dobara naam bataiye."
    if (matchResult.status === "no_match") {
      clarification_question = "Ye customer nahi mila. Dobara naam bataiye.";
      reply = "Ye customer nahi mila. Dobara naam bataiye.";
      updatedContext.pendingIntent = "CHECK_BALANCE";
      updatedContext.lastQuestionType = "customer_name";
      return {
        success: true,
        command: {
          intent: "CHECK_BALANCE",
          customer_name: targetCustomer,
          amount: null,
          description: null,
          missing_fields: ["customer_name"],
          needs_clarification: true,
          clarification_question,
          confidence: 0.5,
        },
        reply,
        updatedContext,
        engineUsed,
        evonAvailable,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    // Single matched customer found in ledger
    const matchedCustomerName = matchResult.matchedName || targetCustomer;
    const balanceInfo = await getCustomerBalance(matchedCustomerName, shopId);

    if (!balanceInfo.exists || balanceInfo.balance === 0) {
      reply = `${balanceInfo.displayName} ka koi baaki hisaab nahi hai. Balance ₹0 hai.`;
    } else if (balanceInfo.balance < 0) {
      reply = `${balanceInfo.displayName} ka koi baaki udhaar nahi hai. Unke ₹${Math.abs(balanceInfo.balance).toLocaleString("en-IN")} jama (advance) hain.`;
    } else {
      reply = `${balanceInfo.displayName} ka baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
    }

    updatedContext.lastCustomerName = balanceInfo.displayName;

    return {
      success: true,
      command: {
        intent: "CHECK_BALANCE",
        customer_name: balanceInfo.displayName,
        amount: balanceInfo.balance,
        description: null,
        missing_fields: [],
        needs_clarification: false,
        clarification_question: null,
        confidence: 0.98,
      },
      reply,
      updatedContext,
      engineUsed,
      evonAvailable,
      customerBalance: balanceInfo.balance,
      totalPending: await getTotalPendingUdhaar(shopId),
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  if (intent === "ADD_CREDIT" || intent === "ADD_PAYMENT") {
    // Check if customer name is ambiguous (multiple matching customers in ledger)
    if (currentCustomer) {
      const matchResult = await findCustomerMatch(currentCustomer, shopId);
      if (matchResult.status === "ambiguous") {
        const qToken = matchResult.queryFirstToken.charAt(0).toUpperCase() + matchResult.queryFirstToken.slice(1);
        clarification_question = `Kaunse ${qToken}?`;
        reply = `Kaunse ${qToken}?`;
        updatedContext.pendingCustomerName = currentCustomer;
        updatedContext.pendingAmount = currentAmount;
        updatedContext.pendingIntent = intent;
        updatedContext.lastQuestionType = "customer_disambiguation";
        return {
          success: true,
          command: {
            intent,
            customer_name: currentCustomer,
            amount: currentAmount,
            description: null,
            missing_fields: ["customer_name"],
            needs_clarification: true,
            clarification_question,
            confidence: 0.8,
          },
          reply,
          updatedContext,
          engineUsed,
          evonAvailable,
          totalPending: await getTotalPendingUdhaar(shopId),
          activeCustomersCount: await getActiveCustomersCount(shopId),
          transactions: await getRecentTransactions(5, shopId),
        };
      }
    }

    // Check what is missing
    if (!currentCustomer) missing_fields.push("customer_name");
    if (!currentAmount || currentAmount <= 0) missing_fields.push("amount");

    // Single Clarification Engine Rule: Ask only ONE short question!
    if (missing_fields.includes("customer_name") && !currentCustomer) {
      clarification_question = "Kiske naam par?";
      reply = "Kiske naam par?";
      updatedContext.pendingAmount = currentAmount;
      updatedContext.pendingIntent = intent;
      updatedContext.lastQuestionType = "customer_name";
    } else if (missing_fields.includes("amount") && (!currentAmount || currentAmount <= 0)) {
      clarification_question = "Kitne rupaye?";
      reply = "Kitne rupaye?";
      updatedContext.pendingCustomerName = currentCustomer;
      updatedContext.pendingIntent = intent;
      updatedContext.lastQuestionType = "amount";
      updatedContext.lastCustomerName = currentCustomer;
    } else {
      // Both customer and amount are verified!
      // Match against ledger canonical name if exists, else use provided name
      const matchResult = await findCustomerMatch(currentCustomer!, shopId);
      const finalCustomer = (matchResult.status === "exact_match" || matchResult.status === "single_match")
        ? matchResult.matchedName!
        : currentCustomer!;

      // Transaction Safety: Always ask for explicit confirmation before committing to Supabase
      const confirmReply =
        detectedLang === "mr-IN"
          ? (intent === "ADD_CREDIT"
              ? `${finalCustomer} चे ₹${currentAmount!.toLocaleString("en-IN")} उधार नोंदवायचे का? बरोबर आहे?`
              : `${finalCustomer} चे ₹${currentAmount!.toLocaleString("en-IN")} जमा करायचे का? बरोबर आहे?`)
          : (intent === "ADD_CREDIT"
              ? `${finalCustomer} ka ₹${currentAmount!.toLocaleString("en-IN")} udhaar likhna hai. Sahi hai?`
              : `${finalCustomer} ke ₹${currentAmount!.toLocaleString("en-IN")} jama karne hain. Sahi hai?`);

      return {
        success: true,
        command: {
          intent,
          customer_name: finalCustomer,
          amount: currentAmount,
          description: null,
          missing_fields: [],
          needs_clarification: true,
          clarification_question: "Sahi hai?",
          confidence: geminiInterpretation?.confidence ?? amountDetails?.confidence ?? 0.96,
        },
        reply: confirmReply,
        updatedContext: {
          pendingCustomerName: finalCustomer,
          pendingAmount: currentAmount,
          pendingIntent: intent,
          lastQuestionType: "confirmation",
          lastCustomerName: finalCustomer,
        },
        engineUsed,
        evonAvailable,
        geminiUsed: !!geminiInterpretation,
        correctedTranscript: geminiInterpretation?.corrected_transcript,
        detectedLanguage: detectedLang,
        totalPending: await getTotalPendingUdhaar(shopId),
        activeCustomersCount: await getActiveCustomersCount(shopId),
        transactions: await getRecentTransactions(5, shopId),
      };
    }

    const command: StructuredCommand = {
      intent,
      customer_name: currentCustomer,
      amount: currentAmount,
      description: null,
      missing_fields,
      needs_clarification: missing_fields.length > 0,
      clarification_question,
      confidence: missing_fields.length === 0 ? 0.96 : 0.8,
    };

    return {
      success: true,
      command,
      reply,
      updatedContext,
      engineUsed,
      evonAvailable,
      totalPending: await getTotalPendingUdhaar(shopId),
      activeCustomersCount: await getActiveCustomersCount(shopId),
      transactions: await getRecentTransactions(5, shopId),
    };
  }

  // If intent was not explicitly detected, but amount was spoken alone:
  if (currentAmount && !currentCustomer) {
    reply = "Udhaar diya ya paise mile?";
    return {
      success: true,
      command: {
        intent: "UNKNOWN",
        customer_name: null,
        amount: currentAmount,
        description: null,
        missing_fields: ["intent", "customer_name"],
        needs_clarification: true,
        clarification_question: "Udhaar diya ya paise mile?",
        confidence: 0.5,
      },
      reply,
      updatedContext: {
        pendingAmount: currentAmount,
        lastQuestionType: "intent",
      },
      engineUsed,
      evonAvailable,
    };
  }

  // If customer is spoken alone without amount and without intent:
  if (currentCustomer && !currentAmount) {
    reply = `${currentCustomer} ka udhaar likhna hai ya hisaab dekhna hai?`;
    return {
      success: true,
      command: {
        intent: "UNKNOWN",
        customer_name: currentCustomer,
        amount: null,
        description: null,
        missing_fields: ["intent", "amount"],
        needs_clarification: true,
        clarification_question: `${currentCustomer} ka udhaar likhna hai ya hisaab dekhna hai?`,
        confidence: 0.5,
      },
      reply,
      updatedContext: {
        pendingCustomerName: currentCustomer,
        lastCustomerName: currentCustomer,
      },
      engineUsed,
      evonAvailable,
    };
  }

  // UNKNOWN Fallback
  return {
    success: true,
    command: {
      intent: "UNKNOWN",
      customer_name: null,
      amount: null,
      description: null,
      missing_fields: ["intent"],
      needs_clarification: true,
      clarification_question: "Samajh nahi aaya, kripya dobara bolein.",
      confidence: 0.2,
    },
    reply: "Samajh nahi aaya, kripya dobara bolein.",
    updatedContext: {},
    engineUsed,
    evonAvailable,
  };
}
