import React from "react";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { Transaction } from "@/types";

interface RecentActivityProps {
  transactions?: Transaction[];
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  transactions = [],
}) => {
  if (transactions.length === 0) {
    return (
      <div className="mx-4 mt-3 mb-2 p-4 bg-white/90 rounded-2xl border border-[#EFECE6] shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center text-center py-6">
        <Clock className="w-5 h-5 text-stone-300 mb-2" />
        <p className="text-xs font-semibold text-stone-500">Abhi koi len-den nahi</p>
        <p className="text-[11px] text-stone-400 mt-0.5">Pehla udhaar ya jama darj karein.</p>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 mb-2 p-3.5 bg-white/90 rounded-2xl border border-[#EFECE6] shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
          <Clock className="w-3.5 h-3.5 text-stone-500" />
          <span>Haal hi ka hisaab (Recent)</span>
        </div>
        <span className="text-[10px] text-stone-400 font-medium">{transactions.length} len-den</span>
      </div>

      <div className="divide-y divide-stone-100">
        {transactions.map((tx) => {
          const isUdhaar = tx.type === "udhaar";

          return (
            <div
              key={tx.id}
              className="py-2 first:pt-1 last:pb-1 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isUdhaar
                      ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                  }`}
                >
                  {isUdhaar ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-stone-900 leading-snug">
                    {tx.customerName}
                  </p>
                  <p className="text-[10px] text-stone-500">
                    {isUdhaar ? "Udhaar diya" : "Jama liya"} • {tx.time}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`font-bold font-mono text-xs ${
                    isUdhaar ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {isUdhaar ? "-" : "+"}₹{tx.amount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

