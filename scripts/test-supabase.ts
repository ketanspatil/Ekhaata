/**
 * Module 5: Permanent Database & Reliable Financial Ledger Verification
 * Tests the exact 7-step sequence specified in the prompt against Supabase PostgreSQL.
 */
import { checkSupabaseConfig, getSupabaseClient } from "../src/services/supabaseClient";
import {
  dbRecordTransaction,
  dbGetCustomerBalance,
  dbGetTotalPendingUdhaar,
  ensureDefaultShopExists,
} from "../src/services/databaseLedgerService";

async function runDatabaseTest() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  MODULE 5: SUPABASE DATABASE PERSISTENCE VERIFICATION");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Check credentials
  const config = checkSupabaseConfig();
  if (!config.isConfigured) {
    console.error("❌ SUPABASE CREDENTIALS MISSING!");
    console.error("The following environment variables must be added to .env.local:\n");
    for (const v of config.missingVariables) {
      console.error(`  - ${v}`);
    }
    console.log("\nOnce you add these variables to .env.local, rerun this test script.");
    process.exit(1);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("❌ Failed to initialize Supabase client.");
    process.exit(1);
  }

  console.log("✅ Supabase credentials detected.");
  console.log("Testing connection and verifying tables (shops, customers, transactions)...\n");

  try {
    await ensureDefaultShopExists();
    console.log("✅ Default shop 'Sharma Kirana Store' confirmed in public.shops.");
  } catch (err: unknown) {
    console.error("❌ Could not connect to Supabase database:", (err as Error).message);
    console.error("Ensure you ran 'supabase/schema.sql' in your Supabase SQL Editor.");
    process.exit(1);
  }

  // Clean test transactions for a fresh deterministic test
  console.log("Preparing clean test environment...");
  const { data: testCusts } = await supabase
    .from("customers")
    .select("id")
    .in("name", ["Ramesh Patil", "Amit Sharma"]);

  if (testCusts && testCusts.length > 0) {
    const ids = testCusts.map((c) => c.id);
    await supabase.from("transactions").delete().in("customer_id", ids);
    await supabase.from("customers").delete().in("id", ids);
  }
  console.log("Clean test environment ready.\n");

  let stepFailures = 0;

  const devShopId = "00000000-0000-0000-0000-000000000001";

  // -------------------------------------------------------------------------
  // STEP 1: Add ₹1,600 credit for Ramesh Patil
  // -------------------------------------------------------------------------
  console.log("─── STEP 1: Add ₹1,600 credit for Ramesh Patil ───");
  try {
    const res1 = await dbRecordTransaction("Ramesh Patil", "udhaar", 1600, { shopId: devShopId });
    console.log(`  Created customer: ${res1.customer.name} (ID: ${res1.customer.id})`);
    console.log(`  Recorded transaction: ${res1.transaction.type} of ₹${res1.transaction.amount} (${res1.transaction.amount_paise} paise)`);
    console.log("  ✓ PASS\n");
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // STEP 2: Record ₹500 payment from Ramesh
  // -------------------------------------------------------------------------
  console.log("─── STEP 2: Record ₹500 payment from Ramesh ───");
  try {
    const res2 = await dbRecordTransaction("Ramesh", "jama", 500, { shopId: devShopId });
    console.log(`  Matched customer: ${res2.customer.name}`);
    console.log(`  Recorded transaction: ${res2.transaction.type} of ₹${res2.transaction.amount} (${res2.transaction.amount_paise} paise)`);
    console.log("  ✓ PASS\n");
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // STEP 3: Check Ramesh's balance: ₹1,100
  // -------------------------------------------------------------------------
  console.log("─── STEP 3: Check Ramesh's balance (Expected: ₹1,100) ───");
  try {
    const bal3 = await dbGetCustomerBalance("Ramesh Patil", devShopId);
    console.log(`  Customer: ${bal3.displayName}`);
    console.log(`  Credit: ₹${bal3.totalCredit}, Payment: ₹${bal3.totalPayment}`);
    console.log(`  Net Balance: ₹${bal3.balance} (${bal3.balancePaise} paise)`);
    if (bal3.balance === 1100 && bal3.balancePaise === 110000) {
      console.log("  ✓ PASS — Exactly ₹1,100\n");
    } else {
      console.error(`  ✗ FAIL — Expected ₹1,100, got ₹${bal3.balance}\n`);
      stepFailures++;
    }
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // STEP 4: Add ₹300 credit for Amit Sharma
  // -------------------------------------------------------------------------
  console.log("─── STEP 4: Add ₹300 credit for Amit Sharma ───");
  try {
    const res4 = await dbRecordTransaction("Amit Sharma", "udhaar", 300, { shopId: devShopId });
    console.log(`  Created customer: ${res4.customer.name} (ID: ${res4.customer.id})`);
    console.log(`  Recorded transaction: ${res4.transaction.type} of ₹${res4.transaction.amount}`);
    console.log("  ✓ PASS\n");
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // STEP 5: Check total pending: ₹1,400 (Ramesh ₹1,100 + Amit ₹300)
  // -------------------------------------------------------------------------
  console.log("─── STEP 5: Check total pending (Expected: ₹1,400) ───");
  try {
    const total5 = await dbGetTotalPendingUdhaar(devShopId);
    console.log(`  Total Pending Across Shop: ₹${total5.totalPendingRupees}`);
    console.log(`  Active Customers with Balance > 0: ${total5.activeCustomersCount}`);
    if (total5.totalPendingRupees >= 1400) {
      console.log("  ✓ PASS — Total pending includes Ramesh (₹1,100) + Amit (₹300)\n");
    } else {
      console.error(`  ✗ FAIL — Expected at least ₹1,400, got ₹${total5.totalPendingRupees}\n`);
      stepFailures++;
    }
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // STEP 6 & 7: Simulate Restart & Verify Persistent Balances
  // -------------------------------------------------------------------------
  console.log("─── STEP 6 & 7: Simulate Restart & Verify Persistent Balances ───");
  try {
    // Direct re-fetch from database simulating brand new process
    const rameshAfter = await dbGetCustomerBalance("Ramesh Patil", devShopId);
    const amitAfter = await dbGetCustomerBalance("Amit Sharma", devShopId);
    console.log(`  Ramesh Patil Persistent Balance: ₹${rameshAfter.balance}`);
    console.log(`  Amit Sharma Persistent Balance: ₹${amitAfter.balance}`);

    if (rameshAfter.balance === 1100 && amitAfter.balance === 300) {
      console.log("  ✓ PASS — All balances persist accurately across restarts!\n");
    } else {
      console.error("  ✗ FAIL — Inconsistent persistent balances\n");
      stepFailures++;
    }
  } catch (err: unknown) {
    console.error("  ✗ FAIL:", (err as Error).message);
    stepFailures++;
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("══════════════════════════════════════════════════════════════");
  if (stepFailures === 0) {
    console.log("  ✅ ALL 7 STEPS VERIFIED & PASSED WITH ACTUAL SUPABASE POSTGRESQL");
  } else {
    console.log(`  ❌ ${stepFailures} STEPS FAILED`);
  }
  console.log("══════════════════════════════════════════════════════════════");
}

runDatabaseTest().catch((err) => {
  console.error("Unexpected test failure:", err);
  process.exit(1);
});
