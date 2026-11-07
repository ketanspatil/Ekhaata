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
} from "@/services/ledgerService";
import {
  extractAmount,
  extractAmountWithDetails,
} from "@/utils/numberParser";
import {
  extractCustomerName,
} from "@/utils/nameNormalizer";

export interface IntentClassification {
  intent: ShopkeeperIntent;
  isAmbiguous: boolean;
}

/**
 * Classifies transaction intent reliably distinguishing ADD_CREDIT vs ADD_PAYMENT.
 * If sentence is ambiguous (e.g. only generic "likho" without "udhaar" or "jama"), marks isAmbiguous = true.
 */
export function classifyTransactionIntent(text: string): IntentClassification {
  const lower = text.toLowerCase();
  const detectedCust = extractCustomerName(text);

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
  context?: ConversationContext
): Promise<ConversationResponse> {
  const evonApiUrl = process.env.EVON_API_URL;
  const evonApiKey = process.env.EVON_API_KEY || process.env.GNANI_API_KEY;

  let evonAvailable = false;
  let engineUsed: "evon-api" | "indic-nlu-engine" = "indic-nlu-engine";

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
      };
    }
  }

  // 2. Multi-operation check (e.g. "Ramesh ko 500 udhaar aur Amit ne 200 wapas diye")
  const multiOps = detectMultipleOperations(transcript);
  if (multiOps && multiOps.length >= 2) {
    const op1 = multiOps[0];
    const op2 = multiOps[1];

    const reply = `${op1.customer_name || "Grahak"} ka ₹${op1.amount || 0} ${
      op1.intent === "ADD_CREDIT" ? "udhaar" : "jama"
    } aur ${op2.customer_name || "Grahak"} ka ₹${op2.amount || 0} ${
      op2.intent === "ADD_CREDIT" ? "udhaar" : "jama"
    } - dono likh loon?`;

    const compoundCommand: StructuredCommand = {
      intent: op1.intent,
      customer_name: op1.customer_name,
      amount: op1.amount,
      description: null,
      missing_fields: [],
      needs_clarification: false,
      clarification_question: null,
      confidence: 0.95,
      multiple_operations: multiOps,
    };

    return {
      success: true,
      command: compoundCommand,
      reply,
      updatedContext: {},
      engineUsed,
      evonAvailable,
    };
  }

  // 3. Contextual resolution (Handling follow-up responses)
  const amountDetails = extractAmountWithDetails(transcript);
  const currentAmount = amountDetails ? amountDetails.amount : null;
  let currentCustomer = extractCustomerName(transcript);
  const classification = classifyTransactionIntent(transcript);
  const intent = classification.intent;

  // If customer is not explicitly mentioned but shopkeeper asks "uska kitna baaki hai" or gives an amount
  if (!currentCustomer && context?.lastCustomerName) {
    const lower = transcript.toLowerCase();
    if (
      lower.includes("uska") ||
      lower.includes("uske") ||
      lower.includes("unka") ||
      lower.includes("unke") ||
      lower.includes("tyacha") ||
      lower.includes("tyanche") ||
      lower.includes("उसका") ||
      lower.includes("उसके") ||
      lower.includes("उनका") ||
      lower.includes("उनके") ||
      lower.includes("त्याचा") ||
      lower.includes("त्यांचे") ||
      intent === "CHECK_BALANCE"
    ) {
      currentCustomer = context.lastCustomerName;
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
            await recordTransaction(resolvedCustomer, "udhaar", resolvedAmount);
          } else {
            await recordTransaction(resolvedCustomer, "jama", resolvedAmount);
          }

          const balanceInfo = await getCustomerBalance(resolvedCustomer);

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
            totalPending: await getTotalPendingUdhaar(),
            activeCustomersCount: await getActiveCustomersCount(),
            transactions: await getRecentTransactions(5),
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
            totalPending: await getTotalPendingUdhaar(),
            activeCustomersCount: await getActiveCustomersCount(),
            transactions: await getRecentTransactions(5),
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
          totalPending: await getTotalPendingUdhaar(),
          activeCustomersCount: await getActiveCustomersCount(),
          transactions: await getRecentTransactions(5),
        };
      }
    }

    // B. Shopkeeper answered the amount!
    if (context.lastQuestionType === "amount" && currentAmount !== null && currentAmount > 0) {
      const resolvedCustomer = context.pendingCustomerName || context.lastCustomerName || "Grahak";
      const resolvedIntent = context.pendingIntent || "ADD_CREDIT";

      // Record transaction into ledger!
      if (resolvedIntent === "ADD_CREDIT") {
        await recordTransaction(resolvedCustomer, "udhaar", currentAmount);
      } else if (resolvedIntent === "ADD_PAYMENT") {
        await recordTransaction(resolvedCustomer, "jama", currentAmount);
      }

      const balanceInfo = await getCustomerBalance(resolvedCustomer);

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
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
      };
    }

    // C. Disambiguation answer (e.g. shopkeeper answers "Patil", "Suresh Patil", "Deshmukh"):
    if (context.lastQuestionType === "customer_disambiguation") {
      const rawAns = transcript.trim();
      const extractedAns = extractCustomerName(transcript) || rawAns;
      let match = await findCustomerMatch(extractedAns);
      if (match.status !== "exact_match" && match.status !== "single_match" && context.pendingCustomerName) {
        match = await findCustomerMatch(`${context.pendingCustomerName} ${extractedAns}`);
      }

      if (match.status === "exact_match" || match.status === "single_match") {
        const resolvedCustomer = match.matchedName!;
        const resolvedIntent = context.pendingIntent || "CHECK_BALANCE";

        if (resolvedIntent === "CHECK_BALANCE") {
          const balanceInfo = await getCustomerBalance(resolvedCustomer);
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
            totalPending: await getTotalPendingUdhaar(),
            activeCustomersCount: await getActiveCustomersCount(),
            transactions: await getRecentTransactions(5),
          };
        } else {
          // ADD_CREDIT or ADD_PAYMENT
          const resolvedAmount = context.pendingAmount;
          if (resolvedAmount && resolvedAmount > 0) {
            if (resolvedIntent === "ADD_CREDIT") {
              await recordTransaction(resolvedCustomer, "udhaar", resolvedAmount);
            } else {
              await recordTransaction(resolvedCustomer, "jama", resolvedAmount);
            }
            const balanceInfo = await getCustomerBalance(resolvedCustomer);

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
              customerBalance: balanceInfo.balance,
              totalPending: await getTotalPendingUdhaar(),
              activeCustomersCount: await getActiveCustomersCount(),
              transactions: await getRecentTransactions(5),
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
        const matchResult = await findCustomerMatch(targetCustomer);

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
            totalPending: await getTotalPendingUdhaar(),
            activeCustomersCount: await getActiveCustomersCount(),
            transactions: await getRecentTransactions(5),
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
            totalPending: await getTotalPendingUdhaar(),
            activeCustomersCount: await getActiveCustomersCount(),
            transactions: await getRecentTransactions(5),
          };
        }

        const canonicalName = matchResult.matchedName || targetCustomer;
        const balanceInfo = await getCustomerBalance(canonicalName);
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
          totalPending: await getTotalPendingUdhaar(),
          activeCustomersCount: await getActiveCustomersCount(),
          transactions: await getRecentTransactions(5),
        };
      }

      const resolvedAmount = context.pendingAmount;

      if (resolvedAmount && resolvedAmount > 0) {
        const matchResult = await findCustomerMatch(targetCustomer);
        const finalCustomer = (matchResult.status === "exact_match" || matchResult.status === "single_match")
          ? matchResult.matchedName!
          : targetCustomer;

        if (resolvedIntent === "ADD_CREDIT") {
          await recordTransaction(finalCustomer, "udhaar", resolvedAmount);
        } else if (resolvedIntent === "ADD_PAYMENT") {
          await recordTransaction(finalCustomer, "jama", resolvedAmount);
        }

        const balanceInfo = await getCustomerBalance(finalCustomer);

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
          totalPending: await getTotalPendingUdhaar(),
          activeCustomersCount: await getActiveCustomersCount(),
          transactions: await getRecentTransactions(5),
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
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
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
      totalPending: await getTotalPendingUdhaar(),
      activeCustomersCount: await getActiveCustomersCount(),
      transactions: await getRecentTransactions(5),
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
    const total = await getTotalPendingUdhaar();
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
      activeCustomersCount: await getActiveCustomersCount(),
      transactions: await getRecentTransactions(5),
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
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
      };
    }

    // Match customer name against actual records in the ledger
    const matchResult = await findCustomerMatch(targetCustomer);

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
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
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
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
      };
    }

    // Single matched customer found in ledger
    const matchedCustomerName = matchResult.matchedName || targetCustomer;
    const balanceInfo = await getCustomerBalance(matchedCustomerName);

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
      totalPending: await getTotalPendingUdhaar(),
      activeCustomersCount: await getActiveCustomersCount(),
      transactions: await getRecentTransactions(5),
    };
  }

  if (intent === "ADD_CREDIT" || intent === "ADD_PAYMENT") {
    // Check if customer name is ambiguous (multiple matching customers in ledger)
    if (currentCustomer) {
      const matchResult = await findCustomerMatch(currentCustomer);
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
          totalPending: await getTotalPendingUdhaar(),
          activeCustomersCount: await getActiveCustomersCount(),
          transactions: await getRecentTransactions(5),
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
      const matchResult = await findCustomerMatch(currentCustomer!);
      const finalCustomer = (matchResult.status === "exact_match" || matchResult.status === "single_match")
        ? matchResult.matchedName!
        : currentCustomer!;

      if (intent === "ADD_CREDIT") {
        await recordTransaction(finalCustomer, "udhaar", currentAmount!);
      } else {
        await recordTransaction(finalCustomer, "jama", currentAmount!);
      }

      const balanceInfo = await getCustomerBalance(finalCustomer);
      updatedContext.lastCustomerName = balanceInfo.displayName;

      if (intent === "ADD_CREDIT") {
        reply = `Ho gaya! ${balanceInfo.displayName} ka ₹${currentAmount!.toLocaleString("en-IN")} udhaar likh liya hai. Ab kul baaki ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
      } else {
        if (balanceInfo.balance > 0) {
          reply = `Theek hai! ${balanceInfo.displayName} ke ₹${currentAmount!.toLocaleString("en-IN")} jama kar liye. Ab baaki hisaab ₹${balanceInfo.balance.toLocaleString("en-IN")} hai.`;
        } else if (balanceInfo.balance === 0) {
          reply = `Theek hai! ${balanceInfo.displayName} ke ₹${currentAmount!.toLocaleString("en-IN")} jama kar liye. Poora hisaab barabar ho gaya hai (₹0 baaki).`;
        } else {
          reply = `Theek hai! ${balanceInfo.displayName} ke ₹${currentAmount!.toLocaleString("en-IN")} jama kar liye. Unka ₹${Math.abs(balanceInfo.balance).toLocaleString("en-IN")} advance (jama) hai, koi udhaar baaki nahi hai.`;
        }
      }

      return {
        success: true,
        command: {
          intent,
          customer_name: balanceInfo.displayName,
          amount: currentAmount,
          description: null,
          missing_fields: [],
          needs_clarification: false,
          clarification_question: null,
          confidence: amountDetails?.confidence ?? 0.96,
        },
        reply,
        updatedContext,
        engineUsed,
        evonAvailable,
        customerBalance: balanceInfo.balance,
        totalPending: await getTotalPendingUdhaar(),
        activeCustomersCount: await getActiveCustomersCount(),
        transactions: await getRecentTransactions(5),
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
      totalPending: await getTotalPendingUdhaar(),
      activeCustomersCount: await getActiveCustomersCount(),
      transactions: await getRecentTransactions(5),
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
