export type MessageSender = "shopkeeper" | "ekhaata";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  audioNote?: string;
}

export interface Transaction {
  id: string;
  customerName: string;
  type: "udhaar" | "jama"; // credit or payment
  amount: number;
  time: string;
}

export type RecordingStatus = "idle" | "requesting" | "recording" | "stopped" | "error";

export interface VoiceRecordingData {
  audioBlob: Blob | null;
  audioUrl: string | null;
  durationMs: number;
  mimeType: string;
}

