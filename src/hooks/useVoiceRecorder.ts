"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { RecordingStatus } from "@/types";
import { startPcmWavRecorder, PcmWavRecorder } from "@/utils/audio";

interface UseVoiceRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob) => Promise<void> | void;
}

interface UseVoiceRecorderReturn {
  status: RecordingStatus;
  error: string | null;
  recordingSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  setStatus: React.Dispatch<React.SetStateAction<RecordingStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  isSupported: boolean;
}

const emptySubscribe = () => () => {};

// Safe feature check for MediaDevices and AudioContext
function checkBrowserSupport(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function useVoiceRecorder(
  options?: UseVoiceRecorderOptions
): UseVoiceRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const onRecordingCompleteRef = useRef(options?.onRecordingComplete);
  useEffect(() => {
    onRecordingCompleteRef.current = options?.onRecordingComplete;
  }, [options?.onRecordingComplete]);

  // Modern React 19 external store hook to check browser support safely
  const isSupported = useSyncExternalStore(
    emptySubscribe,
    checkBrowserSupport,
    () => true
  );

  const streamRef = useRef<MediaStream | null>(null);
  const pcmRecorderRef = useRef<PcmWavRecorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingSeconds(0);
    setStatus("requesting");

    try {
      if (!checkBrowserSupport()) {
        throw new Error(
          "Microphone is not accessible. Please ensure you are running on localhost or HTTPS."
        );
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // 1. Primary: Direct 16kHz PCM WAV recorder via Web Audio API
      try {
        pcmRecorderRef.current = startPcmWavRecorder(stream);
      } catch (pcmErr) {
        console.warn("Direct PCM recorder initialization failed:", pcmErr);
        pcmRecorderRef.current = null;
      }

      // 2. Secondary/Backup: Native MediaRecorder
      if (typeof window.MediaRecorder !== "undefined") {
        try {
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          recorder.start(200);
        } catch (recErr) {
          console.warn("MediaRecorder backup start failed:", recErr);
        }
      }

      setStatus("recording");

      // Start duration counter
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } catch (err: unknown) {
      // Release stream if partially acquired
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setStatus("error");
      const errName = (err as { name?: string })?.name;

      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setError(
          "Microphone permission nahi mili. Kripya browser me microphone permission allow karein."
        );
      } else if (
        errName === "NotFoundError" ||
        errName === "DevicesNotFoundError"
      ) {
        setError("Aapke device me koi microphone nahi mila.");
      } else if (
        errName === "NotReadableError" ||
        errName === "TrackStartError"
      ) {
        setError("Microphone kisi doosre app me vyast hai.");
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : "Microphone shuru karne me samasya aayi.";
        setError(msg);
      }
    }
  }, [audioUrl]);

  const stopRecording = useCallback(async () => {
    if (status !== "recording") return;

    // Stop duration timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop MediaRecorder backup if running
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }

    // Obtain final audio blob
    let finalBlob: Blob | null = null;

    if (pcmRecorderRef.current) {
      try {
        finalBlob = await pcmRecorderRef.current.stop();
        pcmRecorderRef.current = null;
      } catch (err) {
        console.warn("PCM recorder stop error:", err);
      }
    }

    // Fallback to MediaRecorder chunks if PCM recorder didn't produce a blob
    if (!finalBlob || finalBlob.size === 0) {
      finalBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
    }

    // Release hardware audio tracks immediately
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const url = URL.createObjectURL(finalBlob);
    setAudioBlob(finalBlob);
    setAudioUrl(url);

    // Call completion callback (which posts to /api/stt)
    if (onRecordingCompleteRef.current) {
      setStatus("processing");
      try {
        await onRecordingCompleteRef.current(finalBlob);
        setStatus("stopped");
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Prisma STT recording conversion failed.";
        setError(msg);
        setStatus("error");
      }
    } else {
      setStatus("stopped");
    }
  }, [status]);

  const resetRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (pcmRecorderRef.current) {
      pcmRecorderRef.current.stop().catch(() => {});
      pcmRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingSeconds(0);
    setError(null);
    setStatus("idle");
  }, [audioUrl]);

  return {
    status,
    error,
    recordingSeconds,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    resetRecording,
    setStatus,
    setError,
    isSupported,
  };
}
