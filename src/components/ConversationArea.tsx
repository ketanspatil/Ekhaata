"use client";

import React, { useRef, useEffect } from "react";
import {
  Mic,
  Volume2,
  Bot,
  User,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Layers,
  Loader2,
} from "lucide-react";
import { ChatMessage } from "@/types";

export const DEFAULT_SAMPLE_CONVERSATION: ChatMessage[] = [
  {
    id: "1",
    sender: "shopkeeper",
    text: "Ramesh ko 500 rupaye ka udhaar likho.",
    timestamp: "10:14 AM",
    audioNote: "Spoken in Hinglish",
  },
  {
    id: "2",
    sender: "ekhaata",
    text: "Ramesh ka 500 rupaye udhaar jod doon?",
    timestamp: "10:14 AM",
    audioNote: "Ekhaata Intelligence • ADD_CREDIT",
    structuredCommand: {
      intent: "ADD_CREDIT",
      customer_name: "Ramesh",
      amount: 500,
      description: null,
      missing_fields: [],
      needs_clarification: false,
      confidence: 0.96,
    },
  },
  {
    id: "3",
    sender: "shopkeeper",
    text: "Haan.",
    timestamp: "10:15 AM",
    audioNote: "Confirmed via voice",
  },
  {
    id: "4",
    sender: "ekhaata",
    text: "Ho gaya! Ramesh ka total baaki ₹1,200 hai.",
    timestamp: "10:15 AM",
    audioNote: "Ekhaata Intelligence • Khata updated",
  },
];

interface ConversationAreaProps {
  messages?: ChatMessage[];
  isThinking?: boolean;
  activePlayingId?: string | null;
  onPlayMessageAudio?: (messageId: string, text: string) => void;
}

export const ConversationArea: React.FC<ConversationAreaProps> = ({
  messages = DEFAULT_SAMPLE_CONVERSATION,
  isThinking = false,
  activePlayingId = null,
  onPlayMessageAudio,
}) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new messages arrive or when thinking state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isThinking]);

  return (
    <div className="mx-3.5 sm:mx-4 mt-3 flex flex-col flex-1">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#134E39]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
            Awaaz Baat-Cheet
          </h3>
        </div>
        <span className="text-[10px] text-stone-400 font-medium">
          Prisma STT + Conversation Engine
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="space-y-2.5 pb-2">
        {messages.map((message) => {
          const isShopkeeper = message.sender === "shopkeeper";
          const cmd = message.structuredCommand;

          return (
            <div
              key={message.id}
              className={`flex flex-col ${
                isShopkeeper ? "items-end" : "items-start"
              }`}
            >
              {/* Sender Label */}
              <div
                className={`flex items-center gap-1 text-[10px] font-semibold mb-1 px-1.5 ${
                  isShopkeeper ? "text-stone-600" : "text-[#134E39]"
                }`}
              >
                {isShopkeeper ? (
                  <>
                    <span>Aap (Dukaandaar)</span>
                    <Mic className="w-2.5 h-2.5 text-stone-500" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-[#134E39]" />
                    <span>Ekhaata Assistant</span>
                  </>
                )}
              </div>

              {/* Chat Bubble */}
              <div
                className={`relative max-w-[88%] rounded-2xl p-3 text-sm leading-relaxed transition-all ${
                  isShopkeeper
                    ? "bg-white text-stone-900 border border-[#E8E4DC] shadow-[0_2px_8px_rgba(0,0,0,0.03)] rounded-tr-sm"
                    : "bg-[#134E39] text-white shadow-[0_4px_14px_rgba(19,78,57,0.18)] rounded-tl-sm"
                }`}
              >
                <p className="font-medium whitespace-pre-wrap">{message.text}</p>

                {/* Structured Intent Tag if present */}
                {cmd && cmd.intent !== "UNKNOWN" && (
                  <div className="mt-2 pt-1.5 border-t border-emerald-700/60 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center gap-1 bg-emerald-950/60 text-emerald-200 px-2 py-0.5 rounded-md font-mono font-semibold">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-300" />
                      <span>{cmd.intent}</span>
                    </span>

                    {cmd.customer_name && (
                      <span className="bg-emerald-900/80 text-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                        {cmd.customer_name}
                      </span>
                    )}

                    {cmd.amount !== null && (
                      <span className="bg-emerald-900/80 text-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        ₹{cmd.amount.toLocaleString("en-IN")}
                      </span>
                    )}

                    {cmd.needs_clarification && (
                      <span className="inline-flex items-center gap-0.5 bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        <HelpCircle className="w-2.5 h-2.5" />
                        <span>Clarification</span>
                      </span>
                    )}

                    {cmd.multiple_operations && (
                      <span className="inline-flex items-center gap-0.5 bg-purple-200 text-purple-950 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        <Layers className="w-2.5 h-2.5" />
                        <span>{cmd.multiple_operations.length} Ops</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Bubble Footer */}
                <div
                  className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] ${
                    isShopkeeper ? "text-stone-400" : "text-emerald-200/80"
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      {isShopkeeper ? (
                        <User className="w-2.5 h-2.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
                      )}
                      <span className="truncate max-w-[130px] sm:max-w-[170px]">
                        {message.audioNote}
                      </span>
                    </span>

                    {/* Ekhaata TTS Audio Control & Playing State */}
                    {!isShopkeeper && (
                      <div className="flex items-center gap-1">
                        {activePlayingId === message.id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-800 text-emerald-100 text-[10px] font-semibold animate-pulse border border-emerald-400/40">
                            <Volume2 className="w-3 h-3 text-emerald-300 animate-bounce" />
                            <span>Bol raha hoon...</span>
                          </span>
                        ) : message.isTtsLoading ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-200 text-[9px]">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-300" />
                            <span>Awaaz taiyaar...</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onPlayMessageAudio?.(message.id, message.text)
                            }
                            title="Timbre TTS se dobara sunein"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/80 hover:bg-emerald-950 text-emerald-200 hover:text-white transition-all text-[10px] font-medium border border-emerald-700/50 cursor-pointer active:scale-95"
                          >
                            <Volume2 className="w-2.5 h-2.5 text-emerald-300" />
                            <span>Suno</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="font-mono text-[9px] shrink-0">
                    {message.timestamp}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Thinking / Processing indicator */}
        {isThinking && (
          <div className="flex flex-col items-start animate-in fade-in duration-200">
            <div className="flex items-center gap-1 text-[10px] font-semibold mb-1 px-1.5 text-[#134E39]">
              <Bot className="w-3 h-3 text-[#134E39]" />
              <span>Ekhaata Assistant</span>
            </div>
            <div className="bg-[#134E39] text-white rounded-2xl rounded-tl-sm p-3 text-sm shadow-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-bounce"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-bounce [animation-delay:0.4s]"></span>
              <span className="text-xs text-emerald-200 font-medium ml-1">
                Samajh raha hoon...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
