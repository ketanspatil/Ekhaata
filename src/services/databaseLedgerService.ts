/**
 * Database Ledger Service (Module 5+6: Permanent Database & Financial Ledger)
 * Backed by Supabase PostgreSQL with accurate integer paise arithmetic,
 * atomic transactions, and dynamic balance calculation from transaction history.
 *
 * All functions require an explicit shopId — the hardcoded DEFAULT_SHOP_ID
 * is preserved only as a last-resort dev fallback and is never used when
 * the user is authenticated (Module 6+).
 */
import { getSupabaseClient, checkSupabaseConfig } from "./supabaseClient";
import {
  normalizeCustomerName,
  formatCustomerNameForDisplay,
  matchCustomerNameAgainstLedger,
  CustomerMatchResult,
} from "@/utils/nameNormalizer";
import { Transaction } from "@/types";

// Development-only fallback shop ID (used only when no authenticated user is present)
// Preserved for JSON-fallback path; never used when user is authenticated.
const DEV_DEFAULT_SHOP_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_SHOP_ID = process.env.NODE_ENV !== "production" ? DEV_DEFAULT_SHOP_ID : undefined;

export interface DBCustomer {
  id: string;
  shop_id: string;
  name: string;
  normalized_name: string;
  phone?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DBTransaction {
  id: string;
  shop_id: string;
  customer_id: string;
  type: "udhaar" | "jama" | "reversal";
  amount: number;
  amount_paise: number;
  idempotency_key?: string | null;
  description?: string | null;
  reversal_of_id?: string | null;
  created_at: string;
}

export interface DBCustomerBalanceInfo {
  exists: boolean;
  customerId?: string;
  displayName: string;
  phone?: string | null;
  balance: number;
  balancePaise: number;
  totalCredit: number;
  totalCreditPaise: number;
  totalPayment: number;
  totalPaymentPaise: number;
  transactionCount: number;
  lastTransactionAt?: string | null;
  createdAt?: string;
}

/**
 * Ensures the development default shop exists.
 * DEV ONLY — never called in production (NODE_ENV=production).
 */
export async function ensureDefaultShopExists(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ensureDefaultShopExists must not be called in production. " +
      "Every shop must be created through the authenticated signup flow."
    );
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Missing environment variables: " +
      checkSupabaseConfig().missingVariables.join(", ")
    );
  }

  // Dev-only: hardcoded shop for local testing
  const devShopId = "00000000-0000-0000-0000-000000000001";
  const { error } = await supabase.from("shops").upsert(
    {
      id: devShopId,
      shop_name: "Sharma Kirana Store",
      currency: "INR",
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("Could not ensure default shop:", error.message);
  }

  return devShopId;
}

/**
 * Fetches all customers for the shop.
 */
export async function dbGetAllCustomers(
  shopId: string
): Promise<DBCustomer[]> {
  if (!shopId) {
    throw new Error('shopId is required to fetch customers');
  }
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching customers from Supabase:", error);
    return [];
  }

  return data || [];
}

/**
 * Searches for a customer using normalized Indic full-name matching in Supabase.
 */
export async function dbFindCustomerMatch(
  queryName: string,
  shopId: string
): Promise<CustomerMatchResult & { customerRecord?: DBCustomer | null }> {
  if (!shopId) {
    throw new Error('shopId is required to find customer match');
  }
  const customers = await dbGetAllCustomers(shopId);
  const existingNames = customers.map((c) => c.name);

  const match = matchCustomerNameAgainstLedger(queryName, existingNames);

  let customerRecord: DBCustomer | null = null;
  if (match.matchedName) {
    customerRecord =
      customers.find(
        (c) =>
          normalizeCustomerName(c.name) ===
          normalizeCustomerName(match.matchedName!)
      ) || null;
  }

  return {
    ...match,
    customerRecord,
  };
}

/**
 * Finds or creates a customer by complete name in the shop.
 * Prevents accidental duplicate customers using normalized names.
 */
export async function dbFindOrCreateCustomer(
  customerName: string,
  shopId: string,
  phone?: string | null
): Promise<DBCustomer> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!shopId) {
    throw new Error("shopId is required to create a customer.");
  }

  const formattedName = formatCustomerNameForDisplay(customerName);
  const normalized = normalizeCustomerName(customerName);

  // 1. Check if customer already exists by normalized name or matching
  const matchResult = await dbFindCustomerMatch(customerName, shopId);
  if (
    (matchResult.status === "exact_match" ||
      matchResult.status === "single_match") &&
    matchResult.customerRecord
  ) {
    return matchResult.customerRecord;
  }

  // 2. Insert new customer
  const { data, error } = await supabase
    .from("customers")
    .insert({
      shop_id: shopId,
      full_name: formattedName,
      normalized_name: normalized,
      phone: phone || null,
    })
    .select()
    .single();

  if (error) {
    // If conflict on normalized name, retrieve existing
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("shop_id", shopId)
      .eq("normalized_name", normalized)
      .single();

    if (existing) {
      return existing;
    }
    throw new Error(`Failed to create customer: ${error.message}`);
  }

  return data;
}

/**
 * Records a financial transaction into Supabase.
 * Uses integer paise (amount_paise) and NUMERIC(12,2) for 100% calculation accuracy.
 * Prevents duplicates via optional idempotency_key.
 */
export async function dbRecordTransaction(
  customerName: string,
  type: "udhaar" | "jama",
  amountRupees: number,
  options?: {
    idempotencyKey?: string;
    description?: string;
    shopId?: string;
  }
): Promise<{ transaction: DBTransaction; customer: DBCustomer }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const shopId = options?.shopId;
  if (!shopId) {
    throw new Error("shopId is required to record a transaction.");
  }
  const customer = await dbFindOrCreateCustomer(customerName, shopId, null);

  // Convert to integer paise (e.g. 1600.00 -> 160000 paise)
  const amountPaise = Math.round(amountRupees * 100);
  const normalizedRupees = Math.round(amountRupees * 100) / 100;

  const idempotencyKey =
    options?.idempotencyKey ||
    `tx-${customer.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const txRecord: Record<string, unknown> = {
    shop_id: shopId,
    customer_id: customer.id,
    type,
    amount: normalizedRupees,
    idempotency_key: idempotencyKey,
    description: options?.description || null,
  };

  let { data, error } = await supabase
    .from("transactions")
    .insert(txRecord)
    .select()
    .single();

  // If column amount_paise exists as non-generated in some environments or fails, retry without or with it
  if (error && error.message.includes('null value in column "amount_paise"')) {
    const { data: retryData, error: retryErr } = await supabase
      .from("transactions")
      .insert({
        ...txRecord,
        amount_paise: amountPaise,
      })
      .select()
      .single();
    data = retryData;
    error = retryErr;
  }

  if (error) {
    throw new Error(`Failed to record transaction: ${error.message}`);
  }

  return {
    transaction: data,
    customer,
  };
}

/**
 * Records a reversal transaction for corrections (never silently deletes history).
 */
export async function dbReverseTransaction(
  transactionId: string,
  shopId: string,
  reason?: string
): Promise<DBTransaction> {
  if (!shopId) {
    throw new Error("shopId is required to reverse a transaction.");
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  // 1. Fetch original transaction
  const { data: original, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("shop_id", shopId)
    .single();

  if (fetchErr || !original) {
    throw new Error(`Original transaction not found: ${fetchErr?.message}`);
  }

  const reverseType =
    original.type === "udhaar" || original.type === "CREDIT"
      ? "jama"
      : "udhaar";

  const { data: reversal, error: insertErr } = await supabase
    .from("transactions")
    .insert({
      shop_id: shopId,
      customer_id: original.customer_id,
      type: reverseType,
      amount: original.amount,
      idempotency_key: `reversal-${transactionId}-${Date.now()}`,
      description: `Reversal of tx ${transactionId}: ${reason || "Correction"}`,
      reversal_of_id: transactionId,
    })
    .select()
    .single();

  if (insertErr) {
    throw new Error(`Failed to create reversal transaction: ${insertErr.message}`);
  }

  return reversal;
}

/**
 * Retrieves the most recent eligible transaction for reversal in the given shop.
 */
export async function dbGetLastReversibleTransaction(
  shopId: string
): Promise<{
  id: string;
  customer_id: string;
  customer_name: string;
  type: string;
  amount: number;
  created_at: string;
} | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // Find last transaction in this shop that is not itself a reversal
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id, customer_id, type, amount, created_at, reversal_of_id, customers(name)")
    .eq("shop_id", shopId)
    .is("reversal_of_id", null)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !txs || txs.length === 0) return null;

  // Filter out any transaction that has already been reversed by another transaction
  for (const t of txs) {
    const { data: revCheck } = await supabase
      .from("transactions")
      .select("id")
      .eq("reversal_of_id", t.id)
      .maybeSingle();

    if (!revCheck) {
      interface RowWithCust {
        id: string;
        customer_id: string;
        type: string;
        amount: number;
        created_at: string;
        customers: { name: string } | null;
      }
      const item = t as unknown as RowWithCust;
      return {
        id: item.id,
        customer_id: item.customer_id,
        customer_name: item.customers?.name || "Grahak",
        type: item.type,
        amount: Number(item.amount),
        created_at: item.created_at,
      };
    }
  }

  return null;
}

/**
 * Calculates customer balance dynamically from transaction history.
 * Balance = Total Udhaar - Total Jama.
 */
export async function dbGetCustomerBalance(
  customerQuery: string,
  shopId: string
): Promise<DBCustomerBalanceInfo> {
  if (!shopId) {
    return {
      exists: false,
      displayName: customerQuery,
      balance: 0,
      balancePaise: 0,
      totalCredit: 0,
      totalCreditPaise: 0,
      totalPayment: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
    };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      exists: false,
      displayName: customerQuery,
      balance: 0,
      balancePaise: 0,
      totalCredit: 0,
      totalCreditPaise: 0,
      totalPayment: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
    };
  }

  const match = await dbFindCustomerMatch(customerQuery, shopId);
  if (!match.customerRecord) {
    return {
      exists: false,
      displayName: customerQuery,
      balance: 0,
      balancePaise: 0,
      totalCredit: 0,
      totalCreditPaise: 0,
      totalPayment: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
    };
  }

  const customer = match.customerRecord;

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("type, amount, amount_paise")
    .eq("shop_id", shopId)
    .eq("customer_id", customer.id);

  if (error || !txs) {
    console.error("Error calculating customer balance:", error);
    return {
      exists: true,
      customerId: customer.id,
      displayName: customer.name,
      balance: 0,
      balancePaise: 0,
      totalCredit: 0,
      totalCreditPaise: 0,
      totalPayment: 0,
      totalPaymentPaise: 0,
      transactionCount: 0,
    };
  }

  let totalCreditPaise = 0;
  let totalPaymentPaise = 0;

  for (const t of txs) {
    const paise =
      t.amount_paise != null
        ? Number(t.amount_paise)
        : Math.round(Number(t.amount || 0) * 100);
    const typeUpper = (t.type || "").toUpperCase();
    if (typeUpper === "UDHAAR" || typeUpper === "CREDIT") {
      totalCreditPaise += paise;
    } else if (typeUpper === "JAMA" || typeUpper === "PAYMENT") {
      totalPaymentPaise += paise;
    }
  }

  const balancePaise = totalCreditPaise - totalPaymentPaise;

  return {
    exists: true,
    customerId: customer.id,
    displayName: customer.name,
    balance: balancePaise / 100,
    balancePaise,
    totalCredit: totalCreditPaise / 100,
    totalCreditPaise,
    totalPayment: totalPaymentPaise / 100,
    totalPaymentPaise,
    transactionCount: txs.length,
  };
}

/**
 * Calculates total pending udhaar across all customers in the shop.
 */
export async function dbGetTotalPendingUdhaar(
  shopId: string
): Promise<{ totalPendingRupees: number; activeCustomersCount: number }> {
  if (!shopId) {
    return { totalPendingRupees: 0, activeCustomersCount: 0 };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { totalPendingRupees: 0, activeCustomersCount: 0 };
  }

  const customers = await dbGetAllCustomers(shopId);
  let totalPendingPaise = 0;
  let activeCustomersCount = 0;

  for (const c of customers) {
    const { data: txs } = await supabase
      .from("transactions")
      .select("type, amount, amount_paise")
      .eq("shop_id", shopId)
      .eq("customer_id", c.id);

    if (txs) {
      let custBalancePaise = 0;
      for (const t of txs) {
        const paise =
          t.amount_paise != null
            ? Number(t.amount_paise)
            : Math.round(Number(t.amount || 0) * 100);
        const typeUpper = (t.type || "").toUpperCase();
        if (typeUpper === "UDHAAR" || typeUpper === "CREDIT") {
          custBalancePaise += paise;
        } else if (typeUpper === "JAMA" || typeUpper === "PAYMENT") {
          custBalancePaise -= paise;
        }
      }
      if (custBalancePaise > 0) {
        totalPendingPaise += custBalancePaise;
        activeCustomersCount++;
      }
    }
  }

  return {
    totalPendingRupees: totalPendingPaise / 100,
    activeCustomersCount,
  };
}

/**
 * Calculates total credit given today in Indian Standard Time (IST).
 */
export async function dbGetTodayUdhaar(
  shopId: string
): Promise<number> {
  if (!shopId) return 0;
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { startISO, endISO } = getISTDateRange("daily");

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("type, amount, amount_paise, reversal_of_id")
    .eq("shop_id", shopId)
    .gte("created_at", startISO)
    .lte("created_at", endISO);

  if (error || !txs) return 0;

  // Track reversals
  const reversedIds = new Set<string>();
  for (const t of txs) {
    if (t.reversal_of_id) reversedIds.add(t.reversal_of_id);
  }

  let todayCreditPaise = 0;
  for (const t of txs) {
    const typeUpper = (t.type || "").toUpperCase();
    if (typeUpper === "UDHAAR" || typeUpper === "CREDIT") {
      const paise =
        t.amount_paise != null
          ? Number(t.amount_paise)
          : Math.round(Number(t.amount || 0) * 100);
      todayCreditPaise += paise;
    }
  }

  return todayCreditPaise / 100;
}

/**
 * Returns recent transactions formatted for the Ekhaata UI.
 */
export async function dbGetRecentTransactions(
  limit = 10,
  shopId?: string
): Promise<Transaction[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !shopId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, created_at, customer_id, customers(name)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  interface TransactionWithCustomer {
    id: string;
    type: string;
    amount: number | string;
    created_at: string;
    customers: { name: string } | null;
  }

  return (data as unknown as TransactionWithCustomer[]).map((t) => {
    const typeUpper = (t.type || "").toUpperCase();
    const normalizedType: "udhaar" | "jama" =
      typeUpper === "JAMA" || typeUpper === "PAYMENT" ? "jama" : "udhaar";

    return {
      id: t.id,
      customerName: t.customers?.name || "Grahak",
      type: normalizedType,
      amount: Number(t.amount),
      time: new Date(t.created_at).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    };
  });
}

/**
 * Fetches all customers for a shop with their aggregated balance details.
 * Module 8: Customer List View
 */
export async function dbGetShopCustomersWithBalances(
  shopId: string
): Promise<DBCustomerBalanceInfo[]> {
  if (!shopId) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  // 1. Fetch all customers
  const customers = await dbGetAllCustomers(shopId);
  if (!customers || customers.length === 0) return [];

  // 2. Fetch all transactions for this shop to aggregate balances in memory
  // This is fast and completely accurate with integer paise
  const { data: allTxs, error } = await supabase
    .from("transactions")
    .select("id, customer_id, type, amount, amount_paise, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching transactions for customer balance summary:", error);
  }

  // Group transactions by customer_id
  const txsByCustomer: Record<string, Array<{ type: string; amount: number; amount_paise?: number; created_at: string }>> = {};
  if (allTxs) {
    for (const tx of allTxs) {
      if (!txsByCustomer[tx.customer_id]) {
        txsByCustomer[tx.customer_id] = [];
      }
      txsByCustomer[tx.customer_id].push(tx);
    }
  }

  return customers.map((c) => {
    const custTxs = txsByCustomer[c.id] || [];
    let totalCreditPaise = 0;
    let totalPaymentPaise = 0;
    let lastTxAt: string | null = null;

    for (const t of custTxs) {
      if (!lastTxAt) {
        lastTxAt = t.created_at;
      }
      const paise =
        t.amount_paise != null
          ? Number(t.amount_paise)
          : Math.round(Number(t.amount || 0) * 100);
      const typeUpper = (t.type || "").toUpperCase();
      if (typeUpper === "UDHAAR" || typeUpper === "CREDIT") {
        totalCreditPaise += paise;
      } else if (typeUpper === "JAMA" || typeUpper === "PAYMENT") {
        totalPaymentPaise += paise;
      }
    }

    const balancePaise = totalCreditPaise - totalPaymentPaise;

    return {
      exists: true,
      customerId: c.id,
      displayName: c.name,
      phone: c.phone || null,
      balance: balancePaise / 100,
      balancePaise,
      totalCredit: totalCreditPaise / 100,
      totalCreditPaise,
      totalPayment: totalPaymentPaise / 100,
      totalPaymentPaise,
      transactionCount: custTxs.length,
      lastTransactionAt: lastTxAt,
      createdAt: c.created_at,
    };
  });
}

/**
 * Fetches full profile and transaction history for a single customer.
 * Module 8: Customer Details View
 */
export async function dbGetCustomerDetails(
  customerId: string,
  shopId: string
): Promise<{
  customer: DBCustomer;
  balanceInfo: DBCustomerBalanceInfo;
  transactions: Array<{
    id: string;
    type: "udhaar" | "jama" | "reversal";
    amount: number;
    description: string | null;
    createdAt: string;
  }>;
} | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("shop_id", shopId)
    .single();

  if (custErr || !customer) {
    return null;
  }

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("id, type, amount, amount_paise, description, created_at")
    .eq("customer_id", customerId)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (txErr) {
    console.error("Error fetching customer transactions:", txErr);
  }

  const transactionList = txs || [];
  let totalCreditPaise = 0;
  let totalPaymentPaise = 0;

  const formattedTransactions = transactionList.map((t) => {
    const paise =
      t.amount_paise != null
        ? Number(t.amount_paise)
        : Math.round(Number(t.amount || 0) * 100);
    const typeUpper = (t.type || "").toUpperCase();

    let normalizedType: "udhaar" | "jama" | "reversal" = "udhaar";
    if (typeUpper === "JAMA" || typeUpper === "PAYMENT") {
      normalizedType = "jama";
      totalPaymentPaise += paise;
    } else if (typeUpper === "REVERSAL") {
      normalizedType = "reversal";
    } else {
      normalizedType = "udhaar";
      totalCreditPaise += paise;
    }

    return {
      id: t.id,
      type: normalizedType,
      amount: Number(t.amount),
      description: t.description || null,
      createdAt: t.created_at,
    };
  });

  const balancePaise = totalCreditPaise - totalPaymentPaise;

  const balanceInfo: DBCustomerBalanceInfo = {
    exists: true,
    customerId: customer.id,
    displayName: customer.name,
    phone: customer.phone || null,
    balance: balancePaise / 100,
    balancePaise,
    totalCredit: totalCreditPaise / 100,
    totalCreditPaise,
    totalPayment: totalPaymentPaise / 100,
    totalPaymentPaise,
    transactionCount: transactionList.length,
    lastTransactionAt: transactionList[0]?.created_at || null,
    createdAt: customer.created_at,
  };

  return {
    customer,
    balanceInfo,
    transactions: formattedTransactions,
  };
}

/**
 * Settles a customer's entire outstanding balance by recording a proper payment (jama) transaction.
 * Never modifies or deletes previous records.
 * Module 8: Mark Account as Settled
 */
export async function dbSettleCustomerAccount(
  customerId: string,
  shopId: string,
  notes?: string
): Promise<{
  settled: boolean;
  settledAmount: number;
  newBalance: number;
  transaction?: DBTransaction;
  message: string;
}> {
  const details = await dbGetCustomerDetails(customerId, shopId);
  if (!details) {
    throw new Error("Customer not found.");
  }

  const currentBalance = details.balanceInfo.balance;
  if (currentBalance <= 0) {
    return {
      settled: false,
      settledAmount: 0,
      newBalance: currentBalance,
      message: currentBalance === 0
        ? "Grahak ka hisaab pehle se hi barabar hai (Balance is ₹0)."
        : "Grahak ka advance jama hai, koi udhaar baki nahi hai.",
    };
  }

  // Record a payment ('jama') transaction equal to the full outstanding balance
  const result = await dbRecordTransaction(
    details.customer.name,
    "jama",
    currentBalance,
    {
      shopId,
      description: notes || "Poora hisaab barabar (Account settled in full)",
      idempotencyKey: `settle-${customerId}-${Date.now()}`,
    }
  );

  return {
    settled: true,
    settledAmount: currentBalance,
    newBalance: 0,
    transaction: result.transaction,
    message: `${details.customer.name} ka ₹${currentBalance} ka hisaab poora barabar ho gaya.`,
  };
}

/**
 * Report summary interface for Module 9
 */
export interface DBFinancialReportSummary {
  period: "daily" | "weekly" | "monthly";
  startDate: string;
  endDate: string;
  shopName: string;
  totalCreditPaise: number;
  totalCreditRupees: number;
  totalPaymentPaise: number;
  totalPaymentRupees: number;
  netPendingPaise: number;
  netPendingRupees: number;
  transactionCount: number;
  pendingCustomersCount: number;
  customers: Array<{
    customerId: string;
    customerName: string;
    phone?: string | null;
    creditPaise: number;
    creditRupees: number;
    paymentPaise: number;
    paymentRupees: number;
    balancePaise: number;
    balanceRupees: number;
    transactionCount: number;
  }>;
  transactions: Array<{
    id: string;
    createdAt: string;
    customerName: string;
    type: "udhaar" | "jama" | "reversal";
    amount: number;
    description?: string | null;
  }>;
}

/**
 * Calculates start and end timestamps in Indian Standard Time (IST, UTC+5:30)
 */
function getISTDateRange(period: "daily" | "weekly" | "monthly"): {
  startISO: string;
  endISO: string;
} {
  // Current time in IST
  const now = new Date();
  // IST offset is +330 minutes (+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  const istYear = istTime.getUTCFullYear();
  const istMonth = istTime.getUTCMonth();
  const istDate = istTime.getUTCDate();
  const istDay = istTime.getUTCDay(); // 0 is Sunday

  let startYear = istYear;
  let startMonth = istMonth;
  let startDate = istDate;

  if (period === "daily") {
    // Start of today IST
    startDate = istDate;
  } else if (period === "weekly") {
    // Start of current week (Monday) in IST
    const daysSinceMonday = (istDay + 6) % 7;
    startDate = istDate - daysSinceMonday;
  } else if (period === "monthly") {
    // Start of current month in IST
    startDate = 1;
  }

  // Construct start date in IST midnight (00:00:00.000) converted back to UTC ISO
  const istStartMidnight = new Date(Date.UTC(startYear, startMonth, startDate, 0, 0, 0, 0));
  const utcStart = new Date(istStartMidnight.getTime() - istOffset);

  // End date is current moment in UTC
  const utcEnd = now;

  return {
    startISO: utcStart.toISOString(),
    endISO: utcEnd.toISOString(),
  };
}

/**
 * Generates financial report (Daily, Weekly, or Monthly) with integer paise accuracy.
 * Excludes reversed transactions from totals while preserving audit integrity.
 * Module 9: Reports & Export
 */
export async function dbGenerateFinancialReport(
  period: "daily" | "weekly" | "monthly",
  shopId: string
): Promise<DBFinancialReportSummary> {
  if (!shopId) {
    throw new Error("shopId is required to generate a financial report.");
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  // 1. Get Shop metadata
  const { data: shop } = await supabase
    .from("shops")
    .select("shop_name")
    .eq("id", shopId)
    .maybeSingle();

  const shopName = shop?.shop_name || "Meri Dukaan";

  // 2. Determine IST date range
  const { startISO, endISO } = getISTDateRange(period);

  // 3. Get all customers for this shop
  const customers = await dbGetAllCustomers(shopId);
  const customerMap = new Map<string, DBCustomer>();
  for (const c of customers) {
    customerMap.set(c.id, c);
  }

  // 4. Fetch all transactions for this shop in the period
  // Also fetch any reversal links to exclude reversed entries
  const { data: txsData, error: txErr } = await supabase
    .from("transactions")
    .select("id, customer_id, type, amount, amount_paise, description, reversal_of_id, created_at")
    .eq("shop_id", shopId)
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: false });

  if (txErr) {
    console.error("Error fetching transactions for report:", txErr);
  }

  const periodTxs = txsData || [];

  // Identify all transaction IDs that have been reversed
  const reversedTxIds = new Set<string>();
  for (const t of periodTxs) {
    if (t.reversal_of_id) {
      reversedTxIds.add(t.reversal_of_id);
    }
  }

  // Aggregate period totals and customer breakdown
  let totalCreditPaise = 0;
  let totalPaymentPaise = 0;
  let validTxCount = 0;

  interface CustomerPeriodAcc {
    creditPaise: number;
    paymentPaise: number;
    txCount: number;
  }
  const custAccMap = new Map<string, CustomerPeriodAcc>();

  const reportTransactions: DBFinancialReportSummary["transactions"] = [];

  for (const t of periodTxs) {
    const cust = customerMap.get(t.customer_id);
    const custName = cust?.name || "Grahak";

    const paise =
      t.amount_paise != null
        ? Number(t.amount_paise)
        : Math.round(Number(t.amount || 0) * 100);

    const typeUpper = (t.type || "").toUpperCase();
    const isReversed = reversedTxIds.has(t.id);
    const isReversalRecord = typeUpper === "REVERSAL";

    let normType: "udhaar" | "jama" | "reversal" = "udhaar";
    if (isReversalRecord) {
      normType = "reversal";
    } else if (typeUpper === "JAMA" || typeUpper === "PAYMENT") {
      normType = "jama";
    }

    reportTransactions.push({
      id: t.id,
      createdAt: t.created_at,
      customerName: custName,
      type: normType,
      amount: Number(t.amount),
      description: isReversed
        ? `[Wapas / Reversed] ${t.description || ""}`.trim()
        : t.description || null,
    });

    // Skip financial accumulation for reversed or reversal records
    if (isReversed || isReversalRecord) {
      continue;
    }

    validTxCount++;
    if (!custAccMap.has(t.customer_id)) {
      custAccMap.set(t.customer_id, { creditPaise: 0, paymentPaise: 0, txCount: 0 });
    }
    const acc = custAccMap.get(t.customer_id)!;
    acc.txCount++;

    if (normType === "udhaar") {
      totalCreditPaise += paise;
      acc.creditPaise += paise;
    } else if (normType === "jama") {
      totalPaymentPaise += paise;
      acc.paymentPaise += paise;
    }
  }

  // Format customer summaries for report
  // If period is monthly, include all customers with their active balances or period activity
  const reportCustomers: DBFinancialReportSummary["customers"] = [];

  if (period === "monthly") {
    // For monthly report, requirement says:
    // Customer name, Total credit, Total payments, Remaining outstanding balance, Number of pending customers
    // Sort customers by highest outstanding amount first
    const allCustomerBalances = await dbGetShopCustomersWithBalances(shopId);
    for (const cb of allCustomerBalances) {
      const periodAcc = custAccMap.get(cb.customerId || "") || {
        creditPaise: 0,
        paymentPaise: 0,
        txCount: 0,
      };

      reportCustomers.push({
        customerId: cb.customerId || "",
        customerName: cb.displayName,
        phone: cb.phone,
        creditPaise: periodAcc.creditPaise,
        creditRupees: periodAcc.creditPaise / 100,
        paymentPaise: periodAcc.paymentPaise,
        paymentRupees: periodAcc.paymentPaise / 100,
        balancePaise: cb.balancePaise,
        balanceRupees: cb.balance,
        transactionCount: periodAcc.txCount || cb.transactionCount,
      });
    }

    // Sort by highest outstanding balance first
    reportCustomers.sort((a, b) => b.balancePaise - a.balancePaise);
  } else {
    // Daily / Weekly: include customers active in this period or with pending balance
    for (const [custId, acc] of custAccMap.entries()) {
      const cust = customerMap.get(custId);
      const balancePaise = acc.creditPaise - acc.paymentPaise;
      reportCustomers.push({
        customerId: custId,
        customerName: cust?.name || "Grahak",
        phone: cust?.phone,
        creditPaise: acc.creditPaise,
        creditRupees: acc.creditPaise / 100,
        paymentPaise: acc.paymentPaise,
        paymentRupees: acc.paymentPaise / 100,
        balancePaise,
        balanceRupees: balancePaise / 100,
        transactionCount: acc.txCount,
      });
    }

    reportCustomers.sort((a, b) => b.balancePaise - a.balancePaise);
  }

  // Count customers with positive pending balance
  const pendingCustomersCount = reportCustomers.filter((c) => c.balancePaise > 0).length;
  const netPendingPaise = totalCreditPaise - totalPaymentPaise;

  return {
    period,
    startDate: startISO,
    endDate: endISO,
    shopName,
    totalCreditPaise,
    totalCreditRupees: totalCreditPaise / 100,
    totalPaymentPaise,
    totalPaymentRupees: totalPaymentPaise / 100,
    netPendingPaise,
    netPendingRupees: netPendingPaise / 100,
    transactionCount: validTxCount,
    pendingCustomersCount,
    customers: reportCustomers,
    transactions: reportTransactions,
  };
}
