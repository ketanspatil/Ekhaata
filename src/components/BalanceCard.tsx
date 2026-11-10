import React from "react";
import { ArrowUpRight, Users, ShieldCheck } from "lucide-react";

interface BalanceCardProps {
  totalPendingUdhaar?: number;
  activeCustomersCount?: number;
  todayUdhaar?: number;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  totalPendingUdhaar = 0,
  activeCustomersCount = 0,
  todayUdhaar = 0,
}) => {
  // Format Indian currency cleanly
  const formattedBalance = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(totalPendingUdhaar);

  const formattedToday = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(todayUdhaar);

  return (
    <div className="mx-4 mt-3 p-4 bg-white rounded-2xl border border-[#EFECE6] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>कुल बाकी उधार (Pending Udhaar)</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Surakshit Khata</span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <div>
          <span className="text-3xl font-extrabold tracking-tight text-[#134E39]">
            {formattedBalance}
          </span>
          <span className="text-xs text-stone-500 ml-2 font-medium">
            lene baaki hain
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-stone-600 bg-stone-50 border border-stone-200/60 px-2.5 py-1 rounded-lg">
          <Users className="w-3.5 h-3.5 text-stone-500" />
          <span className="font-semibold text-stone-800">{activeCustomersCount}</span>
          <span className="text-[11px] text-stone-500">customers</span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
        <span className="flex items-center gap-1">
          <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
          <span>
            Aaj ka udhaar:{" "}
            <strong>{todayUdhaar > 0 ? `+${formattedToday}` : "₹0"}</strong>
          </span>
        </span>
        <span className="text-stone-400 font-mono text-[10px]">
          Aaj ka hisaab up-to-date
        </span>
      </div>
    </div>
  );
};

