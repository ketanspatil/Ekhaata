import fs from "fs";
import path from "path";
import { Transaction } from "@/types";
import {
  normalizeCustomerName,
  matchCustomerNameAgainstLedger,
  formatCustomerNameForDisplay,
  isTokenMatch,
  CustomerMatchResult,
} from "@/utils/nameNormalizer";
import { checkSupabaseConfig } from "./supabaseClient";
import {
  dbRecordTransaction,
  dbGetCustomerBalance,
  dbGetTotalPendingUdhaar,
  dbGetRecentTransactions,
  dbGetAllCustomers,
  dbFindCustomerMatch,
  dbReverseTransaction,
  dbGetLastReversibleTransaction,
  dbGetTodayUdhaar,
} from "./databaseLedgerService";

export interface CustomerBalanceInfo {
  exists: boolean;
  balance: number;
  totalCredit: number;
  totalPayment: number;
  transactionCount: number;
  displayName: string;
}

/**
 * Checks if two customer name representations refer to the exact same customer.
 * Uses normalized phonetic matching across English, Devanagari, and Hinglish.
 */
export function isSameCustomer(nameA: string, nameB: string): boolean {
  const normA = normalizeCustomerName(nameA);
  const normB = normalizeCustomerName(nameB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const tokensA = normA.split(/\s+/).filter(Boolean);
  const tokensB = normB.split(/\s+/).filter(Boolean);

  if (tokensA.length !== tokensB.length) return false;

  return tokensA.every((t, i) => isTokenMatch(t, tokensB[i]));
}

// DEV ONLY: Seed transactions for local offline fallback.
// In production, the app always reads from Supabase.
const INITIAL_TRANSACTIONS: Transaction[] =
  process.env.NODE_ENV !== "production"
    ? [
        {
          id: "tx-suresh-1",
          customerName: "Suresh Patil",
          type: "udhaar",
          amount: 1000,
          time: "Aaj, 9:30 AM",
        },
        {
          id: "tx-anita-1",
          customerName: "Anita Bai",
          type: "udhaar",
          amount: 250,
          time: "Kal dopahar",
        },
      ]
    : [];

const DATA_DIR = path.join(process.cwd(), "data");
const LEDGER_FILE = path.join(DATA_DIR, "ledger.json");

let transactionsCache: Transaction[] | null = null;

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore in read-only environments
  }
}

function loadTransactions(): Transaction[] {
  if (transactionsCache !== null) {
    return transactionsCache;
  }

  try {
    ensureDataDir();
    if (fs.existsSync(LEDGER_FILE)) {
      const data = fs.readFileSync(LEDGER_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        transactionsCache = parsed;
        return transactionsCache;
      }
    }
  } catch (err) {
    console.warn("Could not load ledger from file, using initial state:", err);
  }

  transactionsCache = [...INITIAL_TRANSACTIONS];
  saveTransactions(transactionsCache);
  return transactionsCache;
}

function saveTransactions(txs: Transaction[]): void {
  transactionsCache = txs;
  try {
    ensureDataDir();
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(txs, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist ledger to disk:", err);
  }
}

/**
 * Returns a list of all distinct canonical customer names currently in the ledger.
 * shopId is used only for the Supabase path; ignored in JSON fallback.
 */
export async function getAllCustomerNames(shopId?: string | null): Promise<string[]> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const dbCusts = await dbGetAllCustomers(shopId);
      return dbCusts.map((c) => c.name);
    } catch (err) {
      console.warn("Falling back to local cache for customer names:", err);
    }
  }

  const transactions = loadTransactions();
  const names = new Set<string>();
  for (const tx of transactions) {
    if (tx.customerName && tx.customerName.trim()) {
      names.add(tx.customerName.trim());
    }
  }
  return Array.from(names);
}

/**
 * Searches for a customer using normalized Indic full-name matching.
 */
export async function findCustomerMatch(
  queryName: string,
  shopId?: string | null
): Promise<CustomerMatchResult> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      return await dbFindCustomerMatch(queryName, shopId);
    } catch (err) {
      console.warn("Falling back to local customer match:", err);
    }
  }

  const existingNames = await getAllCustomerNames(shopId);
  return matchCustomerNameAgainstLedger(queryName, existingNames);
}

/**
 * Adds a new credit (udhaar) or payment (jama) transaction.
 * Automatically persists to Supabase PostgreSQL when credentials exist.
 * shopId scopes the transaction to the authenticated user's shop.
 */
export async function recordTransaction(
  customerName: string,
  type: "udhaar" | "jama",
  amount: number,
  timeString?: string,
  shopId?: string | null
): Promise<Transaction> {
  let canonicalName = customerName.trim();

  // Try Supabase first if configured and shopId is known
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const dbResult = await dbRecordTransaction(customerName, type, amount, {
        shopId,
      });
      canonicalName = dbResult.customer.name;
    } catch (err) {
      console.error("Supabase recordTransaction failed, writing to fallback:", err);
    }
  }

  // Also maintain local transactions cache
  const transactions = loadTransactions();
  const matchResult = await findCustomerMatch(customerName, shopId);

  if (matchResult.status === "exact_match" || matchResult.status === "single_match") {
    canonicalName = matchResult.matchedName!;
  } else {
    canonicalName = formatCustomerNameForDisplay(canonicalName);
  }

  const time =
    timeString ||
    new Date().toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const newTx: Transaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    customerName: canonicalName,
    type,
    amount,
    time,
  };

  const updated = [newTx, ...transactions];
  saveTransactions(updated);
  return newTx;
}

/**
 * Reverses a transaction for financial corrections (never silently deletes history).
 */
export async function reverseTransaction(
  transactionId: string,
  reason?: string,
  shopId?: string | null
): Promise<Transaction> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const rev = await dbReverseTransaction(transactionId, shopId, reason);
      return {
        id: rev.id,
        customerName: "Reversal",
        type: rev.type === "udhaar" ? "udhaar" : "jama",
        amount: Number(rev.amount),
        time: new Date().toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      };
    } catch (err) {
      console.error("Supabase reverseTransaction failed:", err);
    }
  }

  throw new Error("Reversal currently requires permanent database configuration.");
}

/**
 * Gets the last transaction eligible for reversal in the given shop.
 */
export async function getLastReversibleTransaction(
  shopId?: string | null
): Promise<{
  id: string;
  customerName: string;
  type: "udhaar" | "jama";
  amount: number;
} | null> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const last = await dbGetLastReversibleTransaction(shopId);
      if (last) {
        const typeUpper = (last.type || "").toUpperCase();
        const normType: "udhaar" | "jama" =
          typeUpper === "JAMA" || typeUpper === "PAYMENT" ? "jama" : "udhaar";
        return {
          id: last.id,
          customerName: last.customer_name,
          type: normType,
          amount: last.amount,
        };
      }
    } catch (err) {
      console.warn("dbGetLastReversibleTransaction failed:", err);
    }
  }

  // Fallback to local transactions
  const txs = loadTransactions();
  if (txs.length > 0) {
    const last = txs[0];
    return {
      id: last.id,
      customerName: last.customerName,
      type: last.type,
      amount: last.amount,
    };
  }

  return null;
}

/**
 * Calculates individual customer balance using credit and payment history.
 * Balance = Total Udhaar - Total Jama.
 */
export async function getCustomerBalance(
  customerName: string,
  shopId?: string | null
): Promise<CustomerBalanceInfo> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const dbBal = await dbGetCustomerBalance(customerName, shopId);
      if (dbBal.exists) {
        return {
          exists: dbBal.exists,
          balance: dbBal.balance,
          totalCredit: dbBal.totalCredit,
          totalPayment: dbBal.totalPayment,
          transactionCount: dbBal.transactionCount,
          displayName: dbBal.displayName,
        };
      }
    } catch (err) {
      console.warn("Supabase balance lookup failed, using local cache:", err);
    }
  }

  // Local fallback
  const transactions = loadTransactions();
  let totalCredit = 0;
  let totalPayment = 0;
  let matchCount = 0;

  const matchResult = await findCustomerMatch(customerName, shopId);
  let canonicalName = customerName.trim();
  if (matchResult.status === "exact_match" || matchResult.status === "single_match") {
    canonicalName = matchResult.matchedName!;
  }

  for (const tx of transactions) {
    if (isSameCustomer(tx.customerName, canonicalName)) {
      matchCount++;
      canonicalName = tx.customerName;
      if (tx.type === "udhaar") {
        totalCredit += tx.amount;
      } else if (tx.type === "jama") {
        totalPayment += tx.amount;
      }
    }
  }

  const balance = totalCredit - totalPayment;

  return {
    exists: matchCount > 0,
    balance,
    totalCredit,
    totalPayment,
    transactionCount: matchCount,
    displayName: canonicalName,
  };
}

/**
 * Returns a map of customer canonical names to their net outstanding balances.
 * Used only for JSON fallback path.
 */
export function getAllCustomerBalances(): Record<string, number> {
  const transactions = loadTransactions();
  const balances: Record<string, number> = {};

  for (const tx of transactions) {
    const key = tx.customerName;
    if (balances[key] === undefined) {
      balances[key] = 0;
    }
    if (tx.type === "udhaar") {
      balances[key] += tx.amount;
    } else {
      balances[key] -= tx.amount;
    }
  }

  return balances;
}

/**
 * Calculates total pending udhaar across all customers.
 * Total pending equals the sum of all individual positive balances.
 */
export async function getTotalPendingUdhaar(shopId?: string | null): Promise<number> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const { totalPendingRupees } = await dbGetTotalPendingUdhaar(shopId);
      return totalPendingRupees;
    } catch (err) {
      console.warn("Supabase total pending failed, falling back:", err);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const balances = getAllCustomerBalances();
    let sum = 0;
    for (const bal of Object.values(balances)) {
      if (bal > 0) {
        sum += bal;
      }
    }
    return sum;
  }

  return 0;
}

/**
 * Returns the number of active customers with an outstanding credit balance.
 */
export async function getActiveCustomersCount(shopId?: string | null): Promise<number> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const { activeCustomersCount } = await dbGetTotalPendingUdhaar(shopId);
      return activeCustomersCount;
    } catch (err) {
      console.warn("Supabase active count failed, falling back:", err);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const balances = getAllCustomerBalances();
    return Object.values(balances).filter((b) => b > 0).length;
  }

  return 0;
}

/**
 * Returns today's total udhaar for the dashboard.
 */
export async function getTodayUdhaar(shopId?: string | null): Promise<number> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      return await dbGetTodayUdhaar(shopId);
    } catch (err) {
      console.warn("Supabase getTodayUdhaar failed:", err);
    }
  }
  return 0;
}

/**
 * Returns the latest recent transactions.
 */
export async function getRecentTransactions(
  limit = 10,
  shopId?: string | null
): Promise<Transaction[]> {
  if (checkSupabaseConfig().isConfigured && shopId) {
    try {
      const txs = await dbGetRecentTransactions(limit, shopId);
      return txs; // Return actual database transactions (empty array if none exist)
    } catch (err) {
      console.warn("Supabase recent transactions failed, falling back:", err);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const transactions = loadTransactions();
    return transactions.slice(0, limit);
  }

  return [];
}

/**
 * Resets ledger (clears or restores to clean initial state).
 */
export function resetLedger(): void {
  transactionsCache = [...INITIAL_TRANSACTIONS];
  saveTransactions(transactionsCache);
}
