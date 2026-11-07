"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { BalanceCard } from "@/components/BalanceCard";
import {
  ConversationArea,
  DEFAULT_SAMPLE_CONVERSATION,
} from "@/components/ConversationArea";
import { RecentActivity } from "@/components/RecentActivity";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import {
  ChatMessage,
  ConversationContext,
  ConversationResponse,
  Transaction,
} from "@/types";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(
    DEFAULT_SAMPLE_CONVERSATION
  );
  const [conversationContext, setConversationContext] =
    useState<ConversationContext>({});
  const [isThinking, setIsThinking] = useState(false);
  const [totalPending, setTotalPending] = useState<number>(1250);
  const [activeCustomersCount, setActiveCustomersCount] = useState<number>(2);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any currently playing TTS audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  // Fetch real ledger state on initial mount
  useEffect(() => {
    fetch("/api/conversation")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (typeof data.totalPending === "number") {
            setTotalPending(data.totalPending);
          }
          if (typeof data.activeCustomersCount === "number") {
            setActiveCustomersCount(data.activeCustomersCount);
          }
          if (Array.isArray(data.transactions) && data.transactions.length > 0) {
            setRecentTransactions(data.transactions);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not fetch initial ledger:", err);
      });
  }, []);

  // Synthesize and play speech via Gnani Timbre TTS
  const playAssistantSpeech = async (
    messageId: string,
    text: string,
    cachedAudioUrl?: string | null
  ) => {
    // Stop any ongoing audio playback
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setActivePlayingId(null);
    }

    try {
      let audioUrl = cachedAudioUrl;

      if (!audioUrl) {
        // Mark message as loading TTS
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isTtsLoading: true } : m
          )
        );

        const res = await fetch("/api/tts?format=json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            language: "hi-IN",
            voice: "Shivani",
          }),
        });

        const data = await res.json();

        // Clear loading state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isTtsLoading: false,
                  ttsAudioUrl: data?.audioBase64 || null,
                }
              : m
          )
        );

        if (res.ok && data?.success && data.audioBase64) {
          audioUrl = data.audioBase64;
        } else {
          console.warn("Timbre TTS synthesis failed:", data?.error);
          return;
        }
      }

      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        setActivePlayingId(messageId);

        audio.onended = () => {
          setActivePlayingId(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setActivePlayingId(null);
          currentAudioRef.current = null;
        };

        await audio.play().catch((playErr) => {
          console.warn("Audio autoplay blocked by browser policy:", playErr);
          setActivePlayingId(null);
        });
      }
    } catch (err) {
      console.warn("TTS playback error:", err);
      setActivePlayingId(null);
    }
  };

  const handleTranscribe = async (
    transcript: string,
    detectedLanguage?: string
  ) => {
    let langLabel = "Code-mix";
    if (detectedLanguage?.includes("mr")) langLabel = "मराठी";
    else if (detectedLanguage?.includes("hi")) langLabel = "हिंदी";
    else if (detectedLanguage?.includes("en")) langLabel = "English";

    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // 1. Add shopkeeper's spoken transcription to chat
    const shopkeeperMsg: ChatMessage = {
      id: `shopkeeper-${Date.now()}`,
      sender: "shopkeeper",
      text: transcript,
      timestamp,
      audioNote: `Gnani Prisma STT • ${langLabel}`,
    };

    setMessages((prev) => [...prev, shopkeeperMsg]);
    setIsThinking(true);

    try {
      // 2. Send transcript & existing conversation context to conversation engine
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript,
          context: conversationContext,
        }),
      });

      const data: ConversationResponse = await res.json();

      if (res.ok && data.success) {
        // Save updated context for multi-turn clarification
        setConversationContext(data.updatedContext || {});

        // Update real ledger balance and transactions
        if (typeof data.totalPending === "number") {
          setTotalPending(data.totalPending);
        }
        if (typeof data.activeCustomersCount === "number") {
          setActiveCustomersCount(data.activeCustomersCount);
        }
        if (Array.isArray(data.transactions)) {
          setRecentTransactions(data.transactions);
        }

        const assistantMsgId = `ekhaata-${Date.now()}`;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          sender: "ekhaata",
          text: data.reply,
          timestamp: new Date().toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          audioNote: `Ekhaata Intelligence • ${data.command.intent}`,
          structuredCommand: data.command,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // 3. Automatically play Ekhaata response speech using Gnani Timbre TTS
        playAssistantSpeech(assistantMsgId, data.reply);
      } else {
        // Fallback message on error
        const errId = `ekhaata-err-${Date.now()}`;
        const errorReplyText = "Samajh nahi aaya, kripya dobara bolein.";
        const errorReply: ChatMessage = {
          id: errId,
          sender: "ekhaata",
          text: errorReplyText,
          timestamp: new Date().toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          audioNote: "Ekhaata Intelligence • Error",
        };
        setMessages((prev) => [...prev, errorReply]);
        playAssistantSpeech(errId, errorReplyText);
      }
    } catch (err) {
      console.error("Conversation engine error:", err);
      const errId = `ekhaata-err-${Date.now()}`;
      const errorReplyText = "Samajh nahi aaya, kripya dobara bolein.";
      const errorReply: ChatMessage = {
        id: errId,
        sender: "ekhaata",
        text: errorReplyText,
        timestamp: new Date().toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        audioNote: "Ekhaata Intelligence • Network Error",
      };
      setMessages((prev) => [...prev, errorReply]);
      playAssistantSpeech(errId, errorReplyText);
    } finally {
      setIsThinking(false);
    }
  };

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
        <div className="flex-1 overflow-y-auto pb-3 flex flex-col">
          {/* 2. Dynamic Balance Card connected to real ledger */}
          <BalanceCard
            totalPendingUdhaar={totalPending}
            activeCustomersCount={activeCustomersCount}
          />

          {/* 3. Conversation Area with Gnani Timbre TTS speech playback */}
          <ConversationArea
            messages={messages}
            isThinking={isThinking}
            activePlayingId={activePlayingId}
            onPlayMessageAudio={(msgId, text) => {
              const msg = messages.find((m) => m.id === msgId);
              playAssistantSpeech(msgId, text, msg?.ttsAudioUrl);
            }}
          />

          {/* 4. Recent Activity connected to real ledger */}
          <RecentActivity
            transactions={
              recentTransactions.length > 0 ? recentTransactions : undefined
            }
          />
        </div>

        {/* 5. Sticky Microphone Recording Area at the Bottom */}
        <div className="sticky bottom-0 z-30">
          <VoiceRecorder onTranscribe={handleTranscribe} />
        </div>
      </div>
    </main>
  );
}
