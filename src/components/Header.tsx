import React from "react";
import { Sparkles, Mic, LogOut } from "lucide-react";

interface HeaderProps {
  storeName?: string;
  userEmail?: string;
  onSignOut?: () => void;
  isOnline?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  storeName = "Meri Dukaan",
  userEmail,
  onSignOut,
  isOnline = true,
}) => {
  return (
    <header className="w-full pt-4 pb-3 px-4 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-[#EFECE6]">
      <div className="flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#134E39] flex items-center justify-center text-white shadow-sm ring-2 ring-[#134E39]/10">
            <Mic className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-bold tracking-tight text-[#134E39]">
                Ekhaata
              </h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-[#134E39] px-1.5 py-0.5 rounded-full">
                Voice AI
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium">
              {storeName}
            </p>
          </div>
        </div>

        {/* Right side: Gnani badge + logout */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-[#EAF4F0] px-2.5 py-1 rounded-full border border-emerald-200/60">
            <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span>Prisma &amp; Timbre</span>
          </div>

          {/* Logout button — only shown when user is authenticated */}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title={userEmail ? `Logout (${userEmail})` : "Logout"}
              aria-label="Log out"
              className="w-8 h-8 rounded-full bg-stone-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-stone-500 transition-colors cursor-pointer border border-stone-200/60"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Greeting Banner */}
      <div className="mt-3 pt-2.5 border-t border-stone-100/80 flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900 tracking-tight">
            Namaste! Aaj kya likhna hai?
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            उधार या जमा बोलने के लिए नीचे माइक दबाएं
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
            }`}
          ></span>
          <span
            className={`text-[11px] font-medium ${
              isOnline ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>
    </header>
  );
};
