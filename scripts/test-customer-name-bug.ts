/**
 * Ekhaata Customer-Name Recognition Bug Verification Test Suite
 */
import { extractCustomerName } from "../src/utils/nameNormalizer";
import { parseShopkeeperCommand } from "../src/services/conversationEngine";
import { resetLedger, recordTransaction, getCustomerBalance } from "../src/services/ledgerService";

async function runTestSuite() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  EKHAATA CUSTOMER-NAME RECOGNITION BUG TEST SUITE");
  console.log("══════════════════════════════════════════════════════════════\n");

  let totalFailures = 0;

  // Reset ledger before testing
  resetLedger();
  console.log("Initial seed ledger: Suresh Patil (₹1000 udhaar), Anita Bai (₹250 udhaar).\n");

  // =========================================================================
  // TEST 1: Full-Name Extraction from User's Example Sentences
  // =========================================================================
  console.log("─── TEST 1: Full-Name Extraction ───");
  const extractionTests = [
    { input: "सुरेश पाटिल का हिसाब बताओ।", expected: "सुरेश पाटिल" },
    { input: "Suresh Patil ka hisaab batao.", expected: "Suresh Patil" },
    { input: "Ramesh Kumar ko 500 rupaye ka udhaar likho.", expected: "Ramesh Kumar" },
    { input: "Amit Sharma ne 200 rupaye diye.", expected: "Amit Sharma" },
    { input: "Suresh Patil ka balance kitna hai?", expected: "Suresh Patil" },
  ];

  for (const t of extractionTests) {
    const extracted = extractCustomerName(t.input);
    const pass = extracted === t.expected;
    console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}: "${t.input}" → "${extracted}" (expected "${t.expected}")`);
    if (!pass) totalFailures++;
  }
  console.log("");

  // =========================================================================
  // TEST 2: CHECK_BALANCE with Devanagari "सुरेश पाटिल का हिसाब बताओ।"
  // =========================================================================
  console.log("─── TEST 2: CHECK_BALANCE in Devanagari ('सुरेश पाटिल का हिसाब बताओ।') ───");
  const resDevanagari = await parseShopkeeperCommand("सुरेश पाटिल का हिसाब बताओ।", undefined);
  console.log(`  Customer: ${resDevanagari.command.customer_name}`);
  console.log(`  Intent: ${resDevanagari.command.intent}`);
  console.log(`  Reply: "${resDevanagari.reply}"`);
  console.log(`  Balance: ₹${resDevanagari.customerBalance}`);
  if (
    resDevanagari.command.customer_name === "Suresh Patil" &&
    resDevanagari.customerBalance === 1000 &&
    !resDevanagari.command.needs_clarification
  ) {
    console.log("  ✓ PASS — 'सुरेश पाटिल' correctly identified as 'Suresh Patil' with actual balance ₹1,000\n");
  } else {
    console.error("  ✗ FAIL — Devanagari lookup failed\n");
    totalFailures++;
  }

  // =========================================================================
  // TEST 3: CHECK_BALANCE with Latin "Suresh Patil ka hisaab batao."
  // =========================================================================
  console.log("─── TEST 3: CHECK_BALANCE with Latin 'Suresh Patil ka hisaab batao.' ───");
  const resSureshLatin = await parseShopkeeperCommand("Suresh Patil ka hisaab batao.", undefined);
  console.log(`  Customer: ${resSureshLatin.command.customer_name}`);
  console.log(`  Intent: ${resSureshLatin.command.intent}`);
  console.log(`  Reply: "${resSureshLatin.reply}"`);
  console.log(`  Balance: ₹${resSureshLatin.customerBalance}`);
  if (
    resSureshLatin.command.customer_name === "Suresh Patil" &&
    resSureshLatin.customerBalance === 1000
  ) {
    console.log("  ✓ PASS — 'Suresh Patil' balance ₹1,000 returned\n");
  } else {
    console.error("  ✗ FAIL\n");
    totalFailures++;
  }

  // =========================================================================
  // TEST 4: ADD_CREDIT with "Ramesh Kumar ko 500 rupaye ka udhaar likho."
  // =========================================================================
  console.log("─── TEST 4: ADD_CREDIT ('Ramesh Kumar ko 500 rupaye ka udhaar likho.') ───");
  const resRamesh = await parseShopkeeperCommand("Ramesh Kumar ko 500 rupaye ka udhaar likho.", undefined);
  console.log(`  Customer: ${resRamesh.command.customer_name}`);
  console.log(`  Amount: ₹${resRamesh.command.amount}`);
  console.log(`  Intent: ${resRamesh.command.intent}`);
  console.log(`  Reply: "${resRamesh.reply}"`);
  if (
    resRamesh.command.customer_name === "Ramesh Kumar" &&
    resRamesh.command.amount === 500 &&
    resRamesh.command.intent === "ADD_CREDIT" &&
    resRamesh.reply.includes("Ramesh Kumar")
  ) {
    console.log("  ✓ PASS — Complete name 'Ramesh Kumar' preserved and credit recorded\n");
  } else {
    console.error("  ✗ FAIL\n");
    totalFailures++;
  }

  // =========================================================================
  // TEST 5: ADD_PAYMENT with "Amit Sharma ne 200 rupaye diye."
  // =========================================================================
  console.log("─── TEST 5: ADD_PAYMENT ('Amit Sharma ne 200 rupaye diye.') ───");
  const resAmit = await parseShopkeeperCommand("Amit Sharma ne 200 rupaye diye.", undefined);
  console.log(`  Customer: ${resAmit.command.customer_name}`);
  console.log(`  Amount: ₹${resAmit.command.amount}`);
  console.log(`  Intent: ${resAmit.command.intent}`);
  console.log(`  Reply: "${resAmit.reply}"`);
  if (
    resAmit.command.customer_name === "Amit Sharma" &&
    resAmit.command.amount === 200 &&
    resAmit.command.intent === "ADD_PAYMENT" &&
    resAmit.reply.includes("Amit Sharma")
  ) {
    console.log("  ✓ PASS — Complete name 'Amit Sharma' preserved and payment recorded\n");
  } else {
    console.error("  ✗ FAIL\n");
    totalFailures++;
  }

  // =========================================================================
  // TEST 6: CHECK_BALANCE with "Suresh Patil ka balance kitna hai?"
  // =========================================================================
  console.log("─── TEST 6: CHECK_BALANCE ('Suresh Patil ka balance kitna hai?') ───");
  const resBalance = await parseShopkeeperCommand("Suresh Patil ka balance kitna hai?", undefined);
  console.log(`  Customer: ${resBalance.command.customer_name}`);
  console.log(`  Reply: "${resBalance.reply}"`);
  console.log(`  Balance: ₹${resBalance.customerBalance}`);
  if (
    resBalance.command.customer_name === "Suresh Patil" &&
    resBalance.customerBalance === 1000
  ) {
    console.log("  ✓ PASS — Suresh Patil balance confirmed at ₹1,000\n");
  } else {
    console.error("  ✗ FAIL\n");
    totalFailures++;
  }

  // =========================================================================
  // TEST 7: Unknown Customer Lookup (Never silently return ₹0)
  // Requirement 7 & 8: "If no customer matches, say: 'Ye customer nahi mila. Dobara naam bataiye.'"
  // =========================================================================
  console.log("─── TEST 7: Unknown Customer Lookup (Requirement 7 & 8) ───");
  const resUnknown = await parseShopkeeperCommand("Kailash ka hisaab batao.", undefined);
  console.log(`  Query: "Kailash ka hisaab batao."`);
  console.log(`  Needs Clarification: ${resUnknown.command.needs_clarification}`);
  console.log(`  Reply: "${resUnknown.reply}"`);
  if (
    resUnknown.command.needs_clarification &&
    resUnknown.reply === "Ye customer nahi mila. Dobara naam bataiye."
  ) {
    console.log("  ✓ PASS — Correctly replied 'Ye customer nahi mila. Dobara naam bataiye.' without returning ₹0\n");
  } else {
    console.error(`  ✗ FAIL — Expected 'Ye customer nahi mila. Dobara naam bataiye.', got: "${resUnknown.reply}"\n`);
    totalFailures++;
  }

  // =========================================================================
  // TEST 8: Multiple Customers Disambiguation (Requirement 6)
  // "If multiple customers have similar names, ask: 'Kaunse Suresh?'"
  // =========================================================================
  console.log("─── TEST 8: Ambiguity Disambiguation (Requirement 6) ───");
  // Add a second Suresh to create an ambiguous scenario
  await recordTransaction("Suresh Deshmukh", "udhaar", 300);
  console.log("  Added 'Suresh Deshmukh' to ledger (now there are 2 Sureshes: Suresh Patil and Suresh Deshmukh).");

  const resAmbiguous = await parseShopkeeperCommand("Suresh ka hisaab batao.", undefined);
  console.log(`  Query: "Suresh ka hisaab batao."`);
  console.log(`  Needs Clarification: ${resAmbiguous.command.needs_clarification}`);
  console.log(`  Reply: "${resAmbiguous.reply}"`);
  console.log(`  Question Type: ${resAmbiguous.updatedContext.lastQuestionType}`);
  const askedKaunseSuresh = resAmbiguous.reply.includes("Kaunse Suresh");
  if (resAmbiguous.command.needs_clarification && askedKaunseSuresh) {
    console.log("  ✓ PASS — Asked 'Kaunse Suresh?'\n");
  } else {
    console.error(`  ✗ FAIL — Expected 'Kaunse Suresh?', got: "${resAmbiguous.reply}"\n`);
    totalFailures++;
  }

  // Follow-up: Shopkeeper answers "Patil"
  console.log("─── TEST 9: Resolving Ambiguity with Follow-up 'Patil' ───");
  const resResolved = await parseShopkeeperCommand("Patil", {
    pendingCustomerName: "Suresh",
    pendingIntent: "CHECK_BALANCE",
    lastQuestionType: "customer_disambiguation",
  });
  console.log(`  Follow-up Answer: "Patil"`);
  console.log(`  Resolved Customer: ${resResolved.command.customer_name}`);
  console.log(`  Reply: "${resResolved.reply}"`);
  console.log(`  Balance: ₹${resResolved.customerBalance}`);
  if (
    resResolved.command.customer_name === "Suresh Patil" &&
    resResolved.customerBalance === 1000
  ) {
    console.log("  ✓ PASS — Disambiguated to 'Suresh Patil' and returned balance ₹1,000\n");
  } else {
    console.error("  ✗ FAIL — Disambiguation failed\n");
    totalFailures++;
  }

  // Clean up ledger back to initial state
  resetLedger();

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("══════════════════════════════════════════════════════════════");
  if (totalFailures === 0) {
    console.log("  ✅ ALL CUSTOMER-NAME RECOGNITION TESTS PASSED (100%)");
  } else {
    console.log(`  ❌ ${totalFailures} TESTS FAILED`);
  }
  console.log("══════════════════════════════════════════════════════════════");

  if (totalFailures > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});

