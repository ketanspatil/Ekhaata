"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  Download,
  Share2,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  TrendingUp,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { DBFinancialReportSummary } from "@/services/databaseLedgerService";
import { exportReportToPDF, shareViaWhatsApp } from "@/utils/reportExport";

interface ReportsManagerProps {
  getAuthHeader: () => Record<string, string>;
}

export function ReportsManager({ getAuthHeader }: ReportsManagerProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [report, setReport] = useState<DBFinancialReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const fetchReport = async (selectedPeriod: "daily" | "weekly" | "monthly") => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?period=${selectedPeriod}`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setReport(data.report);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData?.error || "Report prapt karne me truti aayi.");
      }
    } catch (err: any) {
      console.error("Error fetching report:", err);
      setError("Network truti. Kripya punah prayas karein.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(period);
  }, [period]);

  const handleDownloadPDF = () => {
    if (!report) return;
    setIsExportingPDF(true);
    try {
      exportReportToPDF(report);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDF download karne me truti aayi.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!report) return;
    shareViaWhatsApp(report);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F9F7F2] overflow-y-auto">
      {/* Top Period Selector Bar */}
      <div className="p-3 bg-white/80 border-b border-stone-200/80 backdrop-blur-sm space-y-2 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
            <FileText className="w-4 h-4 text-[#134E39]" />
            <span>Vitthiya Report (Financial Summary)</span>
          </div>
          <span className="text-[11px] text-stone-400">IST Timezone</span>
        </div>

        {/* 3-way Period Toggle */}
        <div className="grid grid-cols-3 gap-1.5 bg-stone-100 p-1 rounded-xl">
          <button
            onClick={() => setPeriod("daily")}
            className={`py-1.5 text-xs font-bold rounded-lg transition ${
              period === "daily"
                ? "bg-[#134E39] text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Aaj (Daily)
          </button>
          <button
            onClick={() => setPeriod("weekly")}
            className={`py-1.5 text-xs font-bold rounded-lg transition ${
              period === "weekly"
                ? "bg-[#134E39] text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Hafta (Weekly)
          </button>
          <button
            onClick={() => setPeriod("monthly")}
            className={`py-1.5 text-xs font-bold rounded-lg transition ${
              period === "monthly"
                ? "bg-[#134E39] text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Mahina (Monthly)
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-3 space-y-3.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#134E39]" />
            <span className="text-xs">Report taiyaar ho rahi hai...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : report ? (
          <>
            {/* Quick Export Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPDF}
                disabled={isExportingPDF}
                className="py-2.5 px-3 bg-stone-800 hover:bg-stone-900 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
              >
                {isExportingPDF ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>PDF Download</span>
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp Share</span>
              </button>
            </div>

            {/* Overview Card */}
            <div className="bg-[#134E39] text-white rounded-2xl p-4 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-emerald-200/90 font-medium">
                <span>
                  {period === "daily"
                    ? "Aaj Ka Kul Udhaar / Baki"
                    : period === "weekly"
                    ? "Hafte Ka Net Baki"
                    : "Mahine Ka Kul Baki Udhaar"}
                </span>
                <span className="bg-emerald-950/60 px-2 py-0.5 rounded-full text-[10px] text-emerald-200 border border-emerald-500/30">
                  {report.shopName}
                </span>
              </div>

              <div className="text-3xl font-extrabold tracking-tight mt-1">
                ₹{report.netPendingRupees.toLocaleString("en-IN")}
              </div>

              {/* Grid Metrics */}
              <div className="mt-4 pt-3 border-t border-emerald-600/50 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-emerald-900/40 p-2.5 rounded-xl border border-emerald-700/40">
                  <div className="flex items-center gap-1 text-amber-200 text-[11px] font-semibold">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Kul Diya Udhaar</span>
                  </div>
                  <div className="text-base font-extrabold text-white mt-0.5">
                    ₹{report.totalCreditRupees.toLocaleString("en-IN")}
                  </div>
                </div>

                <div className="bg-emerald-900/40 p-2.5 rounded-xl border border-emerald-700/40">
                  <div className="flex items-center gap-1 text-emerald-200 text-[11px] font-semibold">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Kul Prapt Jama</span>
                  </div>
                  <div className="text-base font-extrabold text-white mt-0.5">
                    ₹{report.totalPaymentRupees.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Summary Stats footer */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-200/80 pt-2 border-t border-emerald-700/30">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {report.transactionCount} transactions
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {report.pendingCustomersCount} baki grahak
                </span>
              </div>
            </div>

            {/* Customer Breakdown Section */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  {period === "monthly"
                    ? "Monthly Pending Udhaar by Customer"
                    : "Grahak-wise Vivaran"}
                </h4>
                <span className="text-[11px] text-stone-400">
                  {report.customers.length} grahak
                </span>
              </div>

              {report.customers.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-2xl border border-stone-200 text-xs text-stone-400">
                  Is samay me koi len-den darj nahi hai.
                </div>
              ) : (
                <div className="space-y-2">
                  {report.customers.map((c) => {
                    const hasUdhaar = c.balanceRupees > 0;
                    const isAdvance = c.balanceRupees < 0;

                    return (
                      <div
                        key={c.customerId}
                        className="bg-white rounded-xl p-3 border border-stone-200/80 shadow-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-stone-900 truncate">
                            {c.customerName}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
                            <span>Diya: ₹{c.creditRupees.toLocaleString("en-IN")}</span>
                            <span>•</span>
                            <span>Jama: ₹{c.paymentRupees.toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`text-xs font-extrabold ${
                              hasUdhaar
                                ? "text-red-600"
                                : isAdvance
                                ? "text-blue-600"
                                : "text-emerald-700"
                            }`}
                          >
                            {hasUdhaar
                              ? `+₹${c.balanceRupees.toLocaleString("en-IN")}`
                              : isAdvance
                              ? `-₹${Math.abs(c.balanceRupees).toLocaleString("en-IN")}`
                              : "₹0"}
                          </div>
                          <div className="text-[9px] font-semibold text-stone-400 uppercase">
                            {hasUdhaar ? "Udhaar" : isAdvance ? "Advance" : "Barabar"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reversal / Integrity Notice */}
            <div className="p-2.5 bg-stone-100 rounded-xl text-[10px] text-stone-500 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Reversed transactions are audited and excluded from financial totals with integer-paise accuracy.
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

