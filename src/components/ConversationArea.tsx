import React from "react";
import { Mic, Volume2, Bot, User, CheckCircle2 } from "lucide-react";
import { ChatMessage } from "@/types";

interface ConversationAreaProps {
  messages?: ChatMessage[];
}

const DEFAULT_SAMPLE_CONVERSATION: ChatMessage[] = [
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
    audioNote: "Gnani Timbre TTS",
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
    audioNote: "Gnani Timbre TTS • Khata updated",
  },
];

export const ConversationArea: React.FC<ConversationAreaProps> = ({
  messages = DEFAULT_SAMPLE_CONVERSATION,
}) => {
  return (
    <div className="mx-4 mt-4 flex flex-col flex-1">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#134E39]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600">
            Awaaz Baat-Cheet (Sample Dialogue)
          </h3>
        </div>
        <span className="text-[10px] text-stone-400 font-medium">
          Prisma STT + Timbre TTS Preview
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="space-y-3 pb-2">
        {messages.map((message) => {
          const isShopkeeper = message.sender === "shopkeeper";

          return (
            <div
              key={message.id}
              className={`flex flex-col ${
                isShopkeeper ? "items-end" : "items-start"
              }`}
            >
              {/* Sender Pill */}
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
                className={`relative max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed transition-all ${
                  isShopkeeper
                    ? "bg-white text-stone-900 border border-[#E8E4DC] shadow-[0_2px_8px_rgba(0,0,0,0.03)] rounded-tr-sm"
                    : "bg-[#134E39] text-white shadow-[0_4px_14px_rgba(19,78,57,0.18)] rounded-tl-sm"
                }`}
              >
                <p className="font-medium">{message.text}</p>

                {/* Bubble Footer */}
                <div
                  className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] ${
                    isShopkeeper ? "text-stone-400" : "text-emerald-200/80"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {isShopkeeper ? (
                      <User className="w-2.5 h-2.5" />
                    ) : (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-300" />
                    )}
                    <span>{message.audioNote}</span>
                  </span>
                  <span className="font-mono">{message.timestamp}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

