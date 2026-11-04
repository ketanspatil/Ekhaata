import React from "react";
import { Header } from "@/components/Header";
import { BalanceCard } from "@/components/BalanceCard";
import { ConversationArea } from "@/components/ConversationArea";
import { RecentActivity } from "@/components/RecentActivity";
import { VoiceRecorder } from "@/components/VoiceRecorder";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F3F0E9] flex flex-col justify-center items-center sm:py-6 sm:px-4">
      {/* Mobile Device Frame for Desktop & Responsive Viewport */}
      <div className="w-full sm:max-w-md bg-[#F9F7F2] min-h-screen sm:min-h-[860px] sm:max-h-[920px] flex flex-col sm:rounded-[36px] sm:shadow-[0_20px_60px_-15px_rgba(19,78,57,0.15)] sm:border-[6px] sm:border-stone-800/10 overflow-hidden relative">
        {/* Subtle decorative phone notch / speaker bar on desktop */}
        <div className="hidden sm:flex justify-center pt-2 pb-1 bg-white/80">
          <div className="w-20 h-1.5 bg-stone-300 rounded-full"></div>
        </div>

        {/* 1. Header */}
        <Header storeName="Sharma Kirana Store" />

        {/* Scrollable Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-4 flex flex-col">
          {/* 2. Balance Card */}
          <BalanceCard totalPendingUdhaar={12500} activeCustomersCount={14} />

          {/* 3. Conversation Area (Sample Dialogue) */}
          <ConversationArea />

          {/* 4. Recent Activity (Compact 2-3 transactions) */}
          <RecentActivity />
        </div>

        {/* 5. Sticky Microphone Recording Area at the Bottom */}
        <div className="sticky bottom-0 z-30">
          <VoiceRecorder />
        </div>
      </div>
    </main>
  );
}
