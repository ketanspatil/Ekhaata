"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Mic,
  Square,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { STTResponse } from "@/types";

interface VoiceRecorderProps {
  onTranscribe?: (
    transcript: string,
    detectedLanguage?: string,
    audioData?: {
      audioBlob: Blob;
      audioBase64: string;
      mimeType: string;
    }
  ) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscribe,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastLanguage, setLastLanguage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Send audio to backend /api/stt when recording completes
  const handleRecordingComplete = async (audioBlob: Blob) => {
    setNoticeMessage(null);
    setLastTranscript(null);

    const formData = new FormData();
    const ext = audioBlob.type.includes("wav")
      ? "wav"
      : audioBlob.type.includes("webm")
      ? "webm"
      : "wav";
    formData.append("audio", audioBlob, `speech.${ext}`);

    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      const data: STTResponse = await res.json();

      if (!res.ok || !data.success) {
        setNoticeMessage(
          data?.error || "Prisma STT se connect nahi ho paya. Kripya dobara koshish karein."
        );
        return;
      }

      if (data.isEmpty || !data.transcript || data.transcript.trim() === "") {
        setNoticeMessage(
          "Koi awaaz detect nahi hui. Kripya microphone ke paas aakar thoda spasht bolein."
        );
        return;
      }

      setLastTranscript(data.transcript);
      setLastLanguage(data.detectedLanguage || "indic-auto");

      if (onTranscribe) {
        // Convert audioBlob to base64 so Gemini API can inspect the original audio
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string) || "";
          onTranscribe(data.transcript!, data.detectedLanguage, {
            audioBlob,
            audioBase64: base64String,
            mimeType: audioBlob.type || "audio/wav",
          });
        };
        reader.readAsDataURL(audioBlob);
      }
    } catch (err: unknown) {
      console.warn("STT submission error:", err);
      setNoticeMessage(
        "Awaaz upload karne me dikkat aayi. Kripya internet check karke dobara bolein."
      );
    }
  };

  const {
    status,
    error,
    recordingSeconds,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    resetRecording,
    isSupported,
  } = useVoiceRecorder({
    onRecordingComplete: handleRecordingComplete,
  });

  // Format seconds into MM:SS
  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Human-readable language name from BCP-47
  const formatLanguageName = (code?: string | null): string => {
    if (!code) return "Auto-detect";
    if (code.includes("mr")) return "मराठी (Marathi)";
    if (code.includes("hi")) return "हिंदी (Hindi)";
    if (code.includes("en")) return "Indian English";
    if (code.includes("gu")) return "ગુજરાતી (Gujarati)";
    if (code.includes("kn")) return "ಕನ್ನಡ (Kannada)";
    if (code.includes("te")) return "తెలుగు (Telugu)";
    if (code.includes("ta")) return "தமிழ் (Tamil)";
    return "Code-mix (Indic)";
  };

  // Handle recorded audio play/pause
  const togglePlayAudio = () => {
    if (!audioPlayerRef.current || !audioUrl) return;

    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  useEffect(() => {
    const player = audioPlayerRef.current;
    if (!player) return;

    const handleEnded = () => setIsPlayingAudio(false);
    const handlePause = () => setIsPlayingAudio(false);

    player.addEventListener("ended", handleEnded);
    player.addEventListener("pause", handlePause);

    return () => {
      player.removeEventListener("ended", handleEnded);
      player.removeEventListener("pause", handlePause);
    };
  }, [audioUrl]);

  const handleReset = () => {
    setLastTranscript(null);
    setNoticeMessage(null);
    resetRecording();
  };

  return (
    <div className="w-full bg-white/95 backdrop-blur-md border-t border-[#EAE6DE] px-4 pt-3 pb-5 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
      {/* Hidden audio element for preview */}
      {audioUrl && (
        <audio
          ref={audioPlayerRef}
          src={audioUrl}
          className="hidden"
          preload="auto"
        />
      )}

      {/* Error state alert banner */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200/80 rounded-xl flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">STT Error</p>
            <p className="mt-0.5 text-red-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] underline text-red-700 font-semibold ml-1 shrink-0 cursor-pointer"
          >
            Theek hai
          </button>
        </div>
      )}

      {/* Empty speech notice */}
      {noticeMessage && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Koi awaaz nahi mili</p>
            <p className="mt-0.5 text-amber-800">{noticeMessage}</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] underline text-amber-800 font-semibold ml-1 shrink-0 cursor-pointer"
          >
            Dobara bolein
          </button>
        </div>
      )}

      {/* Browser Not Supported Warning */}
      {!isSupported && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Is browser me microphone recording uplabdh nahi hai.</span>
        </div>
      )}

      {/* STATE 1: Processing Audio via Gnani Prisma STT */}
      {status === "processing" && (
        <div className="flex flex-col items-center py-4 animate-in fade-in duration-200">
          <div className="relative flex items-center justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500/30 flex items-center justify-center text-[#134E39]">
              <Loader2 className="w-8 h-8 text-[#134E39] animate-spin" />
            </div>
            <div className="absolute w-20 h-20 rounded-full border border-emerald-400/30 animate-ping pointer-events-none"></div>
          </div>
          <span className="text-sm font-bold text-stone-900 tracking-tight">
            Prisma STT: Awaaz samajh raha hoon...
          </span>
          <span className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Automatic Language Detection (मराठी / हिंदी / English)</span>
          </span>
        </div>
      )}

      {/* STATE 2: Recording Stopped - Transcription Display & Audio Preview */}
      {status === "stopped" && audioBlob && (
        <div className="flex flex-col items-center py-2 animate-in fade-in duration-300">
          {/* Milestone indicator */}
          <div className="w-full max-w-sm mb-3 p-3 bg-[#EAF4F0] border border-emerald-300/80 rounded-xl flex items-center gap-2.5 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-[#134E39] text-white flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-[#134E39]">
                  Recording ready for Prisma STT integration.
                </p>
                {lastLanguage && (
                  <span className="text-[10px] font-semibold bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded-full shrink-0">
                    {formatLanguageName(lastLanguage)}
                  </span>
                )}
              </div>
              {lastTranscript ? (
                <p className="text-xs font-medium text-stone-800 mt-1 line-clamp-2 italic">
                  &ldquo;{lastTranscript}&rdquo;
                </p>
              ) : (
                <p className="text-[10px] text-emerald-800 mt-0.5">
                  Audio sent to backend ({Math.max(1, recordingSeconds)}s •{" "}
                  {(audioBlob.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          {/* Action buttons for preview & re-recording */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlayAudio}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#134E39] text-white text-xs font-semibold shadow-sm hover:bg-[#0f3e2e] active:scale-95 transition-all cursor-pointer"
            >
              {isPlayingAudio ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Suno (Pause)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Recording Suno</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold hover:bg-stone-200 active:scale-95 transition-all border border-stone-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-600" />
              <span>Dobara bolein</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: Recording In-Progress */}
      {status === "recording" && (
        <div className="flex flex-col items-center py-1">
          {/* Status Label & Timer */}
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
            </span>
            <span className="text-sm font-bold text-stone-900 tracking-wide">
              Sun raha hoon...
            </span>
            <span className="font-mono text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
              {formatTime(recordingSeconds)}
            </span>
          </div>

          {/* Dynamic sound wave visualizer bars */}
          <div className="flex items-center justify-center gap-1.5 h-7 mb-3">
            <span className="w-1 bg-[#134E39] rounded-full h-6 animate-bar-1 origin-bottom"></span>
            <span className="w-1 bg-[#134E39] rounded-full h-7 animate-bar-2 origin-bottom"></span>
            <span className="w-1 bg-[#134E39] rounded-full h-5 animate-bar-3 origin-bottom"></span>
            <span className="w-1 bg-[#134E39] rounded-full h-8 animate-bar-4 origin-bottom"></span>
            <span className="w-1 bg-[#134E39] rounded-full h-4 animate-bar-5 origin-bottom"></span>
          </div>

          {/* Prominent Stop Button */}
          <div className="relative flex items-center justify-center">
            {/* Pulsing ripples behind stop button */}
            <div className="absolute w-24 h-24 rounded-full bg-red-500/20 animate-voice-ripple-1 pointer-events-none"></div>
            <div className="absolute w-28 h-28 rounded-full bg-red-500/10 animate-voice-ripple-2 pointer-events-none"></div>

            <button
              type="button"
              onClick={stopRecording}
              aria-label="Stop recording"
              className="relative z-10 w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-lg shadow-red-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <Square className="w-7 h-7 fill-white" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">
                Roko
              </span>
            </button>
          </div>

          <p className="text-xs text-stone-500 mt-2.5 font-medium">
            Bolna khatam karne ke liye dabayein
          </p>
        </div>
      )}

      {/* STATE 4: Requesting permission */}
      {status === "requesting" && (
        <div className="flex flex-col items-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-[#134E39] animate-pulse">
            <Mic className="w-7 h-7 animate-bounce" />
          </div>
          <p className="text-xs font-semibold text-stone-700 mt-3">
            Microphone permission maang raha hoon...
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">
            Browser popup me &apos;Allow&apos; par click karein
          </p>
        </div>
      )}

      {/* STATE 5: Idle state (Main Big Tap To Speak Button) */}
      {(status === "idle" ||
        ((status === "error" || status === "stopped") && !audioBlob)) && (
        <div className="flex flex-col items-center py-2">
          {/* Large prominent circular mic button */}
          <div className="relative flex items-center justify-center">
            {/* Subtle idle breathing aura */}
            <div className="absolute w-24 h-24 rounded-full bg-[#134E39]/10 animate-pulse pointer-events-none"></div>

            <button
              type="button"
              onClick={startRecording}
              disabled={!isSupported}
              aria-label="Tap to speak"
              className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-[#1b664e] to-[#134E39] hover:from-[#144e3b] hover:to-[#0f3e2e] text-white flex flex-col items-center justify-center shadow-lg shadow-[#134E39]/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Mic className="w-8 h-8 text-emerald-100" />
            </button>
          </div>

          {/* Clear label */}
          <div className="text-center mt-2.5">
            <span className="text-sm font-bold text-stone-900 block tracking-tight">
              Tap to speak
            </span>
            <span className="text-[11px] text-stone-500 flex items-center justify-center gap-1 mt-0.5">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>Marathi / Hindi / Hinglish</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
