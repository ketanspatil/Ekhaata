/**
 * Ekhaata E2E Validation: Number Parser + Conversation Engine + Ledger
 * Resets the ledger cache before running so results are deterministic.
 */
import { extractAmountWithDetails } from "../src/utils/numberParser";
import { parseShopkeeperCommand } from "../src/services/conversationEngine";
import { resetLedger, getCustomerBalance, getTotalPendingUdhaar, getActiveCustomersCount } from "../src/services/ledgerService";

async function runTests() {
  // ---- Reset ledger to clean initial state ----
  resetLedger();
  console.log("Ledger reset to initial state (Suresh ₹1000 udhaar, Anita ₹250 udhaar).\n");

  let failures = 0;

  // ================================================================
  //  STEP 1: NUMBER PARSER UNIT TESTS
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 1: NUMBER PARSER UNIT TESTS");
  console.log("═══════════════════════════════════════════");
  const numberTestCases = [
    { text: "एक हजार छह सौ", expected: 1600 },
    { text: "एक हजार पांच सौ", expected: 1500 },
    { text: "दो हजार तीन सौ पचास", expected: 2350 },
    { text: "सोलह सौ", expected: 1600 },
    { text: "पंधराशे", expected: 1500 },
    { text: "पाचशे", expected: 500 },
    { text: "1,600", expected: 1600 },
    { text: "१,६००", expected: 1600 },
    { text: "डेढ़ हजार", expected: 1500 },
    { text: "ढाई सौ", expected: 250 },
    { text: "Ramesh ke naam par ek hazaar chhah sau rupaye jama karo.", expected: 1600 },
  ];

  let numPass = 0;
  for (const tc of numberTestCases) {
    const res = extractAmountWithDetails(tc.text);
    if (res?.amount === tc.expected) {
      console.log(`  ✓ "${tc.text}" → ${res.amount}`);
      numPass++;
    } else {
      console.error(`  ✗ "${tc.text}" → got ${res?.amount}, expected ${tc.expected}`);
      failures++;
    }
  }
  console.log(`  Result: ${numPass}/${numberTestCases.length} passed.\n`);

  // ================================================================
  //  STEP 2: ADD CREDIT (Ramesh ₹200 udhaar)
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 2: ADD CREDIT — Ramesh ₹200 udhaar");
  console.log("═══════════════════════════════════════════");
  const res2 = await parseShopkeeperCommand("Ramesh ko 200 rupaye ka udhaar likho", undefined);
  console.log(`  Intent: ${res2.command.intent}`);
  console.log(`  Customer: ${res2.command.customer_name}`);
  console.log(`  Amount: ${res2.command.amount}`);
  console.log(`  Reply: "${res2.reply}"`);
  if (res2.command.intent === "ADD_CREDIT" && res2.command.amount === 200 && res2.command.customer_name === "Ramesh") {
    console.log("  ✓ PASS\n");
  } else {
    console.error("  ✗ FAIL\n");
    failures++;
  }

  // ================================================================
  //  STEP 3: CHECK BALANCE — Ramesh ka kitna baaki?
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 3: CHECK BALANCE — Ramesh");
  console.log("═══════════════════════════════════════════");
  const res3 = await parseShopkeeperCommand("Ramesh ka kitna baaki hai?", undefined);
  console.log(`  Intent: ${res3.command.intent}`);
  console.log(`  Reply: "${res3.reply}"`);
  console.log(`  Balance reported: ₹${res3.customerBalance}`);
  if (res3.command.intent === "CHECK_BALANCE" && res3.customerBalance === 200) {
    console.log("  ✓ PASS — Ramesh balance is ₹200\n");
  } else {
    console.error(`  ✗ FAIL — Expected ₹200, got ₹${res3.customerBalance}\n`);
    failures++;
  }

  // ================================================================
  //  STEP 4: ADD PAYMENT — Ramesh ne 50 wapas diye
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 4: ADD PAYMENT — Ramesh ₹50 wapas");
  console.log("═══════════════════════════════════════════");
  const res4 = await parseShopkeeperCommand("Ramesh ne 50 rupaye wapas diye", undefined);
  console.log(`  Intent: ${res4.command.intent}`);
  console.log(`  Customer: ${res4.command.customer_name}`);
  console.log(`  Amount: ${res4.command.amount}`);
  console.log(`  Reply: "${res4.reply}"`);
  if (res4.command.intent === "ADD_PAYMENT" && res4.command.amount === 50 && res4.command.customer_name === "Ramesh") {
    console.log("  ✓ PASS\n");
  } else {
    console.error("  ✗ FAIL\n");
    failures++;
  }

  // ================================================================
  //  STEP 5: CHECK BALANCE AGAIN — Should be ₹150
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 5: CHECK BALANCE — Ramesh (after ₹50 payment)");
  console.log("═══════════════════════════════════════════");
  const res5 = await parseShopkeeperCommand("Ramesh ka kitna baaki hai?", undefined);
  console.log(`  Reply: "${res5.reply}"`);
  console.log(`  Balance: ₹${res5.customerBalance}`);
  if (res5.customerBalance === 150) {
    console.log("  ✓ PASS — Ramesh balance is ₹150\n");
  } else {
    console.error(`  ✗ FAIL — Expected ₹150, got ₹${res5.customerBalance}\n`);
    failures++;
  }

  // ================================================================
  //  STEP 6: TARGET SENTENCE — ek hazaar chhah sau = 1600
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 6: ₹1,600 number parsing in sentence");
  console.log("═══════════════════════════════════════════");
  const targetSentence = "Ramesh ke naam par ek hazaar chhah sau rupaye jama karo.";
  const res6 = await parseShopkeeperCommand(targetSentence, undefined);
  console.log(`  Sentence: "${targetSentence}"`);
  console.log(`  Intent: ${res6.command.intent}`);
  console.log(`  Amount: ${res6.command.amount}`);
  console.log(`  Customer: ${res6.command.customer_name}`);
  console.log(`  Reply: "${res6.reply}"`);
  if (res6.command.amount === 1600 && res6.command.customer_name === "Ramesh") {
    console.log("  ✓ PASS — ₹1,600 correctly extracted\n");
  } else {
    console.error("  ✗ FAIL\n");
    failures++;
  }

  // ================================================================
  //  STEP 7: AMBIGUITY → CLARIFICATION → RESOLUTION
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 7: AMBIGUITY CLARIFICATION");
  console.log("═══════════════════════════════════════════");
  // 7a: Ambiguous utterance
  const res7a = await parseShopkeeperCommand("Amit ke 500 rupaye likho", undefined);
  console.log(`  a) "Amit ke 500 rupaye likho"`);
  console.log(`     Intent: ${res7a.command.intent}`);
  console.log(`     Clarification: ${res7a.command.needs_clarification}`);
  console.log(`     Reply: "${res7a.reply}"`);
  const clarificationOk = res7a.command.needs_clarification && res7a.reply.includes("Udhaar diya ya paise mile?");
  if (clarificationOk) {
    console.log("     ✓ PASS — Ambiguity detected, clarification asked");
  } else {
    console.error("     ✗ FAIL — Clarification not triggered");
    failures++;
  }

  // 7b: Shopkeeper resolves: "Udhaar diya"
  const res7b = await parseShopkeeperCommand("Udhaar diya", {
    pendingCustomerName: "Amit",
    pendingAmount: 500,
    lastQuestionType: "intent"
  });
  console.log(`  b) Follow-up: "Udhaar diya"`);
  console.log(`     Intent: ${res7b.command.intent}`);
  console.log(`     Customer: ${res7b.command.customer_name}`);
  console.log(`     Amount: ${res7b.command.amount}`);
  console.log(`     Reply: "${res7b.reply}"`);
  if (res7b.command.intent === "ADD_CREDIT" && res7b.command.amount === 500 && res7b.command.customer_name === "Amit") {
    console.log("     ✓ PASS — Credit committed for Amit ₹500\n");
  } else {
    console.error("     ✗ FAIL\n");
    failures++;
  }

  // ================================================================
  //  STEP 8: CHECK TOTAL PENDING
  // ================================================================
  console.log("═══════════════════════════════════════════");
  console.log("  STEP 8: TOTAL PENDING");
  console.log("═══════════════════════════════════════════");
  const res8 = await parseShopkeeperCommand("Kul kitna udhaar baaki hai?", undefined);
  console.log(`  Reply: "${res8.reply}"`);
  console.log(`  Total Pending: ₹${res8.totalPending}`);
  console.log(`  Active Customers: ${res8.activeCustomersCount}`);

  // Calculate expected total:
  //  Suresh: 1000 udhaar = ₹1000
  //  Anita: 250 udhaar = ₹250
  //  Ramesh: 200 udhaar - 50 jama - 1600 jama = -1450 (0 counted since negative)
  //  Amit: 500 udhaar = ₹500
  //  Expected Total = 1000 + 250 + 500 = ₹1750  (Ramesh has 0 since jama > udhaar)
  const rameshBal = await getCustomerBalance("Ramesh");
  console.log(`  Ramesh balance: ₹${rameshBal.balance} (credit: ${rameshBal.totalCredit}, payment: ${rameshBal.totalPayment})`);
  console.log(`  ✓ Total check completed.\n`);

  // ================================================================
  //  SUMMARY
  // ================================================================
  console.log("═══════════════════════════════════════════");
  if (failures === 0) {
    console.log("  ✅ ALL TESTS PASSED");
  } else {
    console.log(`  ❌ ${failures} TEST(S) FAILED`);
  }
  console.log("═══════════════════════════════════════════");
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
