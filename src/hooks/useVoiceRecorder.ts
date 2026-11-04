"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { RecordingStatus } from "@/types";

interface UseVoiceRecorderReturn {
  status: RecordingStatus;
  error: string | null;
  recordingSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  isSupported: boolean;
}

const emptySubscribe = () => () => {};

// Safe feature check for MediaRecorder and getUserMedia
function checkBrowserSupport(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.MediaRecorder !== "undefined"
  );
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Modern React 19 external store hook to check MediaRecorder browser support safely
  const isSupported = useSyncExternalStore(
    emptySubscribe,
    checkBrowserSupport,
    () => true
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  // Determine optimal supported audio mime type
  const getSupportedMimeType = (): string => {
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      return "";
    }
    const candidateTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
    ];
    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  };

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
        throw new Error("Microphone API not supported on this browser.");
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

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(finalBlob);
        setAudioBlob(finalBlob);
        setAudioUrl(url);
        setStatus("stopped");

        // Stop all audio hardware tracks immediately so mic indicator turns off
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Stop timer
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      };

      recorder.onerror = () => {
        setError("Recording ke dauran error aayi. Kripya dubara koshish karein.");
        setStatus("error");
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      };

      // Start recording with 200ms timeslices for smooth chunk collection
      recorder.start(200);
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
        setError(
          "Microphone shuru karne me samasya aayi. Kripya dubara prayas karein."
        );
      }
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const resetRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
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
    isSupported,
  };
}
