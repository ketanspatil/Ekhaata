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
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import {
  ChatMessage,
  ConversationContext,
  ConversationResponse,
  Transaction,
} from "@/types";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, session, isLoading: authLoading, isAuthenticated, signOut } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>(
    DEFAULT_SAMPLE_CONVERSATION
  );
  const [conversationContext, setConversationContext] =
    useState<ConversationContext>({});
  const [isThinking, setIsThinking] = useState(false);
  const [totalPending, setTotalPending] = useState<number>(0);
  const [activeCustomersCount, setActiveCustomersCount] = useState<number>(0);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Stop any currently playing TTS audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  // Check backend & API connectivity periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setIsOnline(data.status === "online");
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Returns Authorization header value with the user's access token.
   * This lets API routes derive shop_id from the authenticated session
   * without trusting any client-supplied value.
   */
  const getAuthHeader = (): Record<string, string> => {
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
  };

  // Fetch real ledger state on initial mount (after auth is ready)
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    fetch("/api/conversation", { headers: getAuthHeader() })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

  // Synthesize and play speech via Gnani Timbre TTS
  const playAssistantSpeech = async (
    messageId: string,
    text: string,
    cachedAudioUrl?: string | null,
    languageCode?: string
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

        const targetLang = languageCode || "hi-IN";

        const res = await fetch("/api/tts?format=json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            language: targetLang,
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
    detectedLanguage?: string,
    audioData?: {
      audioBlob: Blob;
      audioBase64: string;
      mimeType: string;
    }
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
      // 2. Send transcript, audio, and existing conversation context to conversation engine
      //    Include auth header so the API can derive the user's shop_id securely
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          transcript,
          context: conversationContext,
          audioBase64: audioData?.audioBase64 || null,
          audioMimeType: audioData?.mimeType || null,
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

        // 3. Automatically play Ekhaata response speech using Gnani Timbre TTS with detected language
        playAssistantSpeech(assistantMsgId, data.reply, null, data.detectedLanguage);
      } else {
        // Fallback message on error
        const errId = `ekhaata-err-${Date.now()}`;
        const errorReplyText = data?.reply || "Samajh nahi aaya, kripya dobara bolein.";
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
        playAssistantSpeech(errId, errorReplyText, null, data?.detectedLanguage);
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

  // Show loading while auth is initialising
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F3F0E9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#134E39] animate-spin" />
      </div>
    );
  }

  // Don't render dashboard for unauthenticated users (redirect is in progress)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#F3F0E9] flex flex-col justify-center items-center sm:py-6 sm:px-4">
      {/* Mobile Device Frame for Desktop & Responsive Viewport */}
      <div className="w-full sm:max-w-md bg-[#F9F7F2] min-h-screen sm:min-h-[860px] sm:max-h-[920px] flex flex-col sm:rounded-[36px] sm:shadow-[0_20px_60px_-15px_rgba(19,78,57,0.15)] sm:border-[6px] sm:border-stone-800/10 overflow-hidden relative">
        {/* Subtle decorative phone notch / speaker bar on desktop */}
        <div className="hidden sm:flex justify-center pt-2 pb-1 bg-white/80">
          <div className="w-20 h-1.5 bg-stone-300 rounded-full"></div>
        </div>

        {/* 1. Header — shows authenticated shop name, logout button and online indicator */}
        <Header
          storeName={user?.shopName || "Meri Dukaan"}
          onSignOut={signOut}
          userEmail={user?.email}
          isOnline={isOnline}
        />

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
