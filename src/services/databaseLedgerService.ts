/**
 * Database Ledger Service (Module 5: Permanent Database & Financial Ledger)
 * Backed by Supabase PostgreSQL with accurate integer paise arithmetic,
 * atomic transactions, and dynamic balance calculation from transaction history.
 */
import { getSupabaseClient, checkSupabaseConfig } from "./supabaseClient";
import {
  normalizeCustomerName,
  formatCustomerNameForDisplay,
  matchCustomerNameAgainstLedger,
  CustomerMatchResult,
} from "@/utils/nameNormalizer";
import { Transaction } from "@/types";

// Default shop UUID for development isolation (prior to Module 6 Auth)
export const DEFAULT_SHOP_ID = "00000000-0000-0000-0000-000000000001";

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
  balance: number;
  balancePaise: number;
  totalCredit: number;
  totalCreditPaise: number;
  totalPayment: number;
  totalPaymentPaise: number;
  transactionCount: number;
}

/**
 * Ensures the default shop exists in the database.
 */
export async function ensureDefaultShopExists(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Missing environment variables: " +
        checkSupabaseConfig().missingVariables.join(", ")
    );
  }

  const { error } = await supabase.from("shops").upsert(
    {
      id: DEFAULT_SHOP_ID,
      name: "Sharma Kirana Store",
      owner_phone: "+919876543210",
      currency: "INR",
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("Could not ensure default shop:", error.message);
  }

  return DEFAULT_SHOP_ID;
}

/**
 * Fetches all customers for the shop.
 */
export async function dbGetAllCustomers(
  shopId: string = DEFAULT_SHOP_ID
): Promise<DBCustomer[]> {
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
  shopId: string = DEFAULT_SHOP_ID
): Promise<CustomerMatchResult & { customerRecord?: DBCustomer | null }> {
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
  phone?: string | null,
  shopId: string = DEFAULT_SHOP_ID
): Promise<DBCustomer> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  await ensureDefaultShopExists();

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
      name: formattedName,
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

  const shopId = options?.shopId || DEFAULT_SHOP_ID;
  const customer = await dbFindOrCreateCustomer(customerName, null, shopId);

  // Convert to integer paise (e.g. 1600.00 -> 160000 paise)
  const amountPaise = Math.round(amountRupees * 100);
  const normalizedRupees = Math.round(amountRupees * 100) / 100;

  const idempotencyKey =
    options?.idempotencyKey ||
    `tx-${customer.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      shop_id: shopId,
      customer_id: customer.id,
      type,
      amount: normalizedRupees,
      amount_paise: amountPaise,
      idempotency_key: idempotencyKey,
      description: options?.description || null,
    })
    .select()
    .single();

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
  reason?: string,
  shopId: string = DEFAULT_SHOP_ID
): Promise<DBTransaction> {
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

  // A reversal inverts the transaction effect:
  // If original was udhaar (credit), reversal is payment (jama) of identical amount
  // If original was jama, reversal is udhaar of identical amount
  const reverseType = original.type === "udhaar" ? "jama" : "udhaar";

  const { data: reversal, error: insertErr } = await supabase
    .from("transactions")
    .insert({
      shop_id: shopId,
      customer_id: original.customer_id,
      type: reverseType,
      amount: original.amount,
      amount_paise: original.amount_paise,
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
 * Calculates customer balance dynamically from transaction history.
 * Balance = Total Udhaar - Total Jama.
 */
export async function dbGetCustomerBalance(
  customerQuery: string,
  shopId: string = DEFAULT_SHOP_ID
): Promise<DBCustomerBalanceInfo> {
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

  // Retrieve all transactions for this customer
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("type, amount_paise")
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
    if (t.type === "udhaar") {
      totalCreditPaise += Number(t.amount_paise);
    } else if (t.type === "jama") {
      totalPaymentPaise += Number(t.amount_paise);
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
 * Total pending equals the sum of all individual positive balances.
 */
export async function dbGetTotalPendingUdhaar(
  shopId: string = DEFAULT_SHOP_ID
): Promise<{ totalPendingRupees: number; activeCustomersCount: number }> {
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
      .select("type, amount_paise")
      .eq("customer_id", c.id);

    if (txs) {
      let custBalancePaise = 0;
      for (const t of txs) {
        if (t.type === "udhaar") custBalancePaise += Number(t.amount_paise);
        else if (t.type === "jama") custBalancePaise -= Number(t.amount_paise);
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
 * Returns recent transactions formatted for the Ekhaata UI.
 */
export async function dbGetRecentTransactions(
  limit = 10,
  shopId: string = DEFAULT_SHOP_ID
): Promise<Transaction[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

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

  return (data as unknown as TransactionWithCustomer[]).map((t) => ({
    id: t.id,
    customerName: t.customers?.name || "Grahak",
    type: t.type === "jama" ? "jama" : "udhaar",
    amount: Number(t.amount),
    time: new Date(t.created_at).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  }));
}
