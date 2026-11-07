export type MessageSender = "shopkeeper" | "ekhaata";

export type ShopkeeperIntent =
  | "ADD_CREDIT"
  | "ADD_PAYMENT"
  | "CHECK_BALANCE"
  | "CHECK_TOTAL"
  | "UNKNOWN";

export interface StructuredCommand {
  intent: ShopkeeperIntent;
  customer_name: string | null;
  amount: number | null;
  description: string | null;
  missing_fields: ("customer_name" | "amount" | "intent")[];
  needs_clarification: boolean;
  clarification_question?: string | null;
  confidence: number;
  detected_language?: "hi" | "mr" | "en" | "hinglish";
  multiple_operations?: StructuredCommand[];
}

export interface ConversationContext {
  pendingIntent?: ShopkeeperIntent | null;
  pendingCustomerName?: string | null;
  pendingAmount?: number | null;
  pendingDescription?: string | null;
  lastQuestionType?: "customer_name" | "customer_disambiguation" | "amount" | "intent" | null;
  lastCustomerName?: string | null;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  audioNote?: string;
  structuredCommand?: StructuredCommand | null;
  ttsAudioUrl?: string | null;
  isTtsLoading?: boolean;
}

export interface Transaction {
  id: string;
  customerName: string;
  type: "udhaar" | "jama"; // credit or payment
  amount: number;
  time: string;
}

export type RecordingStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "stopped"
  | "error";

export interface VoiceRecordingData {
  audioBlob: Blob | null;
  audioUrl: string | null;
  durationMs: number;
  mimeType: string;
}

export interface STTResponse {
  success: boolean;
  transcript?: string;
  detectedLanguage?: string;
  requestId?: string;
  error?: string;
  isEmpty?: boolean;
}

export interface ConversationResponse {
  success: boolean;
  command: StructuredCommand;
  reply: string;
  updatedContext: ConversationContext;
  engineUsed: "evon-api" | "indic-nlu-engine";
  evonAvailable: boolean;
  error?: string;
  customerBalance?: number | null;
  totalPending?: number;
  activeCustomersCount?: number;
  transactions?: Transaction[];
}

export interface TTSRequest {
  text: string;
  language?: string;
  voice?: string;
}

export interface TTSResponse {
  success: boolean;
  audioBase64?: string;
  audioUrl?: string;
  error?: string;
}
