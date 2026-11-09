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
 * Ensures the development default shop exists.
 * Only called in legacy/fallback paths — not used when user is authenticated.
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
      shop_name: "Sharma Kirana Store",
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

  const shopId = options?.shopId || DEFAULT_SHOP_ID;
  const customer = await dbFindOrCreateCustomer(customerName, null, shopId);

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
  shopId: string = DEFAULT_SHOP_ID
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

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("type, amount, amount_paise")
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
      .select("type, amount, amount_paise")
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
