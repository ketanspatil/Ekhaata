"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Search,
  ArrowUpDown,
  UserPlus,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";

export interface CustomerSummary {
  exists: boolean;
  customerId: string;
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

export interface CustomerTransaction {
  id: string;
  type: "udhaar" | "jama" | "reversal";
  amount: number;
  description: string | null;
  createdAt: string;
}

interface CustomerManagerProps {
  getAuthHeader: () => Record<string, string>;
  onBalanceUpdated?: () => void;
}

export function CustomerManager({
  getAuthHeader,
  onBalanceUpdated,
}: CustomerManagerProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"balance" | "name">("balance");

  // Add Customer Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Customer Details View / Modal State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [customerDetails, setCustomerDetails] = useState<{
    customer: { id: string; name: string; phone?: string | null; created_at: string };
    balanceInfo: CustomerSummary;
    transactions: CustomerTransaction[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Settle Account Confirmation State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [settleSuccessMsg, setSettleSuccessMsg] = useState<string | null>(null);

  // Fetch all customers for authenticated shop
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/customers", {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.customers) {
          setCustomers(data.customers);
        }
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch single customer details
  const openCustomerDetails = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIsLoadingDetails(true);
    setSettleSuccessMsg(null);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerDetails(data);
      }
    } catch (err) {
      console.error("Error fetching customer details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle Manual Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      setCreateError("Grahak ka naam likhna anivarya hai (Name is required).");
      return;
    }

    setIsCreatingCustomer(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAddModalOpen(false);
        setNewCustomerName("");
        setNewCustomerPhone("");
        await fetchCustomers();
        if (onBalanceUpdated) onBalanceUpdated();
      } else {
        setCreateError(data?.error || "Grahak jodte samay truti aayi.");
      }
    } catch (err: any) {
      setCreateError(err?.message || "Network error. Kripya punah prayas karein.");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Handle Settle Account
  const handleSettleAccount = async () => {
    if (!selectedCustomerId || !customerDetails) return;

    setIsSettling(true);
    try {
      const res = await fetch(`/api/customers/${selectedCustomerId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          action: "settle",
          notes: "Poora hisaab barabar (Manual settlement)",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSettleSuccessMsg(data.settlement?.message || "Hisaab barabar ho gaya!");
        setIsSettleModalOpen(false);
        // Refresh detail view & list
        await openCustomerDetails(selectedCustomerId);
        await fetchCustomers();
        if (onBalanceUpdated) onBalanceUpdated();
      } else {
        alert(data?.error || "Hisaab barabar karne me truti aayi.");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to settle account.");
    } finally {
      setIsSettling(false);
    }
  };

  // Filter and sort customers
  const filteredCustomers = customers
    .filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const matchName = c.displayName.toLowerCase().includes(q);
      const matchPhone = c.phone?.toLowerCase().includes(q);
      return matchName || matchPhone;
    })
    .sort((a, b) => {
      if (sortBy === "balance") {
        return b.balance - a.balance; // Highest pending udhaar first
      } else {
        return a.displayName.localeCompare(b.displayName); // Alphabetical A-Z
      }
    });

  return (
    <div className="flex-1 flex flex-col bg-[#F9F7F2] relative">
      {/* Search & Action Bar */}
      <div className="p-3 bg-white/70 border-b border-stone-200/80 backdrop-blur-sm space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Grahak ka naam ya phone khojein..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#134E39]/30 text-stone-800 placeholder-stone-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add Customer Button */}
          <button
            onClick={() => {
              setCreateError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#134E39] hover:bg-[#0f3f2e] text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Naya Grahak</span>
          </button>
        </div>

        {/* Sorting Controls & Stats */}
        <div className="flex items-center justify-between text-xs text-stone-500 px-0.5">
          <div className="flex items-center gap-1 font-medium">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            <span>
              {filteredCustomers.length}{" "}
              {filteredCustomers.length === 1 ? "Grahak" : "Grahak"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-stone-400" />
            <span className="text-[11px] text-stone-400">Sort:</span>
            <button
              onClick={() => setSortBy("balance")}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                sortBy === "balance"
                  ? "bg-[#134E39] text-white shadow-xs"
                  : "bg-stone-200/70 text-stone-600 hover:bg-stone-200"
              }`}
            >
              Highest Udhaar
            </button>
            <button
              onClick={() => setSortBy("name")}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                sortBy === "name"
                  ? "bg-[#134E39] text-white shadow-xs"
                  : "bg-stone-200/70 text-stone-600 hover:bg-stone-200"
              }`}
            >
              A - Z
            </button>
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-stone-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#134E39]" />
            <span className="text-xs">Grahak suchi load ho rahi hai...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-stone-700">
              {searchQuery ? "Koi grahak nahi mila" : "Abhi koi grahak nahi hai"}
            </p>
            <p className="text-xs text-stone-400 mt-1 max-w-[240px]">
              {searchQuery
                ? `"${searchQuery}" se milta julta koi grahak darj nahi hai.`
                : "Pehla udhaar bol kar darj karein ya '+ Naya Grahak' dabayein."}
            </p>
          </div>
        ) : (
          filteredCustomers.map((cust) => {
            const hasUdhaar = cust.balance > 0;
            const isAdvance = cust.balance < 0;

            return (
              <div
                key={cust.customerId}
                onClick={() => openCustomerDetails(cust.customerId)}
                className="bg-white rounded-2xl p-3.5 border border-stone-200/80 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] hover:border-[#134E39]/40 hover:shadow-md transition active:scale-[0.99] cursor-pointer flex items-center justify-between gap-3"
              >
                {/* Left: Avatar & Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${
                      hasUdhaar
                        ? "bg-amber-50 text-amber-900 border border-amber-200"
                        : isAdvance
                        ? "bg-blue-50 text-blue-900 border border-blue-200"
                        : "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    }`}
                  >
                    {cust.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-stone-900 truncate">
                      {cust.displayName}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400">
                      {cust.phone ? (
                        <span className="flex items-center gap-0.5">
                          <Phone className="w-2.5 h-2.5" />
                          {cust.phone}
                        </span>
                      ) : (
                        <span>{cust.transactionCount} hisaab-kitaab</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Balance Pill */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div
                      className={`text-sm font-extrabold ${
                        hasUdhaar
                          ? "text-red-600"
                          : isAdvance
                          ? "text-blue-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {hasUdhaar
                        ? `₹${cust.balance.toLocaleString("en-IN")}`
                        : isAdvance
                        ? `+₹${Math.abs(cust.balance).toLocaleString("en-IN")}`
                        : "₹0"}
                    </div>
                    <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                      {hasUdhaar ? "Udhaar" : isAdvance ? "Advance" : "Barabar"}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. Add Customer Modal */}
      {/* ──────────────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-[#134E39] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-stone-900">
                  Naya Grahak Jodein
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Grahak Ka Naam <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Ramesh Kumar, Sunita Ben"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#134E39]/40 text-stone-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mobile Number <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#134E39]/40 text-stone-800"
                />
              </div>

              {createError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition"
                >
                  Radd Karein
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCustomer || !newCustomerName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#134E39] hover:bg-[#0f3f2e] disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  {isCreatingCustomer ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Jodein</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. Customer Detail Modal / Slide-over */}
      {/* ──────────────────────────────────────────────────────────── */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-b from-stone-50 to-white border-b border-stone-200/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#134E39]/10 text-[#134E39] flex items-center justify-center font-bold text-base">
                  {customerDetails?.customer.name.charAt(0).toUpperCase() || "G"}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">
                    {customerDetails?.customer.name || "Grahak Vivaran"}
                  </h3>
                  {customerDetails?.customer.phone && (
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-2.5 h-2.5" />
                      {customerDetails.customer.phone}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerDetails(null);
                }}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingDetails ? (
                <div className="flex flex-col items-center justify-center py-16 text-stone-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#134E39]" />
                  <span className="text-xs">Vivaran nikal rahe hain...</span>
                </div>
              ) : customerDetails ? (
                <>
                  {settleSuccessMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{settleSuccessMsg}</span>
                    </div>
                  )}

                  {/* Balance Summary Card */}
                  <div className="bg-[#134E39] text-white rounded-2xl p-4 shadow-md relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="text-xs text-emerald-200/90 font-medium">
                        Kul Baki Udhaar (Outstanding)
                      </span>
                      <div className="text-3xl font-extrabold tracking-tight mt-0.5">
                        ₹
                        {customerDetails.balanceInfo.balance.toLocaleString(
                          "en-IN"
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-emerald-600/50 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-emerald-200/80 block text-[10px]">
                            Kul Diya Udhaar
                          </span>
                          <span className="font-bold text-amber-200">
                            ₹
                            {customerDetails.balanceInfo.totalCredit.toLocaleString(
                              "en-IN"
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-200/80 block text-[10px]">
                            Kul Prapt Jama
                          </span>
                          <span className="font-bold text-emerald-100">
                            ₹
                            {customerDetails.balanceInfo.totalPayment.toLocaleString(
                              "en-IN"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Settle Action Button */}
                  {customerDetails.balanceInfo.balance > 0 && (
                    <button
                      onClick={() => setIsSettleModalOpen(true)}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        Hisaab Barabar Karein (Settle ₹
                        {customerDetails.balanceInfo.balance.toLocaleString("en-IN")}
                        )
                      </span>
                    </button>
                  )}

                  {/* Transaction History Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                        Len-Den Itihas (History)
                      </h4>
                      <span className="text-[11px] text-stone-400">
                        {customerDetails.transactions.length} record
                      </span>
                    </div>

                    {customerDetails.transactions.length === 0 ? (
                      <div className="p-6 text-center bg-stone-50 rounded-2xl border border-stone-200/80 text-xs text-stone-400">
                        Is grahak ka abhi tak koi len-den nahi hua hai.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {customerDetails.transactions.map((t) => {
                          const isUdhaar = t.type === "udhaar";
                          const isJama = t.type === "jama";
                          const isReversal = t.type === "reversal";

                          return (
                            <div
                              key={t.id}
                              className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isUdhaar
                                      ? "bg-red-50 text-red-600 border border-red-200"
                                      : isJama
                                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                      : "bg-purple-50 text-purple-600 border border-purple-200"
                                  }`}
                                >
                                  {isUdhaar && <ArrowUpRight className="w-3.5 h-3.5" />}
                                  {isJama && <ArrowDownLeft className="w-3.5 h-3.5" />}
                                  {isReversal && <RotateCcw className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  <div className="font-bold text-stone-900">
                                    {isUdhaar
                                      ? "Udhaar Diya"
                                      : isJama
                                      ? "Paisa Jama Mila"
                                      : "Transaction Wapas"}
                                  </div>
                                  <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5">
                                    <Calendar className="w-2.5 h-2.5" />
                                    <span>
                                      {new Date(t.createdAt).toLocaleDateString(
                                        "en-IN",
                                        {
                                          day: "numeric",
                                          month: "short",
                                          year: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                          hour12: true,
                                        }
                                      )}
                                    </span>
                                  </div>
                                  {t.description && (
                                    <div className="text-[10px] text-stone-500 italic mt-0.5">
                                      {t.description}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div
                                className={`text-sm font-extrabold ${
                                  isUdhaar
                                    ? "text-red-600"
                                    : isJama
                                    ? "text-emerald-700"
                                    : "text-purple-600"
                                }`}
                              >
                                {isUdhaar ? `+₹${t.amount}` : `-₹${t.amount}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. Settle Confirmation Dialog */}
      {/* ──────────────────────────────────────────────────────────── */}
      {isSettleModalOpen && customerDetails && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl border border-stone-200 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h4 className="text-sm font-bold text-stone-900">
              Hisaab Barabar Karna Chahte Hain?
            </h4>
            <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
              Kya aap <span className="font-bold text-stone-800">{customerDetails.customer.name}</span> ka{" "}
              <span className="font-extrabold text-stone-900">
                ₹{customerDetails.balanceInfo.balance.toLocaleString("en-IN")}
              </span>{" "}
              ka poora udhaar chukta karke jama record karna chahte hain?
            </p>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettleModalOpen(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition"
              >
                Nahi
              </button>
              <button
                type="button"
                disabled={isSettling}
                onClick={handleSettleAccount}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center justify-center gap-1.5"
              >
                {isSettling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Haan, Barabar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

