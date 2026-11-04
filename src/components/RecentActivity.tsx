import React from "react";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { Transaction } from "@/types";

interface RecentActivityProps {
  transactions?: Transaction[];
}

const DEFAULT_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-1",
    customerName: "Ramesh Kumar",
    type: "udhaar",
    amount: 500,
    time: "Abhi-abhi",
  },
  {
    id: "tx-2",
    customerName: "Suresh Patil",
    type: "jama",
    amount: 1000,
    time: "Aaj, 9:30 AM",
  },
  {
    id: "tx-3",
    customerName: "Anita Bai",
    type: "udhaar",
    amount: 250,
    time: "Kal dopahar",
  },
];

export const RecentActivity: React.FC<RecentActivityProps> = ({
  transactions = DEFAULT_TRANSACTIONS,
}) => {
  return (
    <div className="mx-4 mt-3 mb-2 p-3.5 bg-white/90 rounded-2xl border border-[#EFECE6] shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
          <Clock className="w-3.5 h-3.5 text-stone-500" />
          <span>Haal hi ka hisaab (Recent)</span>
        </div>
        <span className="text-[10px] text-stone-400 font-medium">3 len-den</span>
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

