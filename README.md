# Ekhaata (ई-खाता) 🎙️

**Mobile-first, voice-first conversational udhaar assistant for Indian small shopkeepers.**

Ekhaata is designed to let local shopkeepers manage customer credit (*udhaar*) and daily payments (*jama*) simply by speaking naturally in Marathi, Hindi, or Hinglish. Instead of a traditional, tedious accounting dashboard, Ekhaata operates as a natural voice dialogue, built to showcase **Gnani AI's Prisma STT, Evon NLU, and Timbre TTS models**.

---

## 🚀 Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Speech-to-Text:** Gnani AI Prisma STT v3.0 (`indic-auto`, `codemix`)
- **Conversation Intelligence:** Gnani Evon NLU & Indic Dialect Clarification Engine
- **UI & Styling:** React & Tailwind CSS
- **Icons:** Lucide React
- **Voice Foundation:** Web MediaRecorder API (`getUserMedia`, 16kHz mono WAV encoding)

---

## 📱 Architecture & Components

```
src/
├── app/
│   ├── api/
│   │   ├── conversation/
│   │   │   └── route.ts     # Module 3: Conversation Intelligence & clarification API
│   │   └── stt/
│   │       └── route.ts     # Module 2: Secure Gnani Prisma STT proxy
│   ├── globals.css          # Custom warm-palette themes & voice ripple animations
│   ├── layout.tsx           # Mobile viewport configuration & Indian typography
│   └── page.tsx             # Main screen with multi-turn conversation state
├── components/
│   ├── Header.tsx           # App brand, shopkeeper greeting & Gnani AI model badge
│   ├── BalanceCard.tsx      # Total pending udhaar (₹12,500), customer count & status
│   ├── ConversationArea.tsx # Natural chat dialogue with auto-scroll & structured intent pills
│   ├── RecentActivity.tsx   # Compact feed of latest 2–3 transactions
│   └── VoiceRecorder.tsx    # Prominent mic button, animated listening state, STT loading, & audio preview
├── hooks/
│   └── useVoiceRecorder.ts  # MediaRecorder lifecycle, audio stream, timer & error handling
├── services/
│   └── conversationEngine.ts# Evon NLU client, intent classification, entity extraction & clarification engine
├── utils/
│   └── audio.ts             # Web Audio API 16kHz 16-bit mono PCM WAV converter
└── types/
    └── index.ts             # TypeScript definitions for messages, intents, commands & context
```

---

## 🧠 Module 3: Conversation Intelligence & Evon Inspection

### 1. Gnani Evon API Inspection & Access Report
- **Evon Architecture**: Gnani.ai's Evon (`gnani/gnani-evon-v3.3-30B-A3B`) is an open-weight 30B Mixture-of-Experts (MoE) sovereign foundational LLM for Indian languages, hosted on Hugging Face and served via vLLM / private OpenAI-compatible endpoints (`/v1/chat/completions`).
- **Account Credentials**: The credentials in `.env.local` (`vach_...`) belong to the **Vachana Speech Platform** (powers Prisma STT and Timbre TTS).
- **Evon Connectivity**: `conversationEngine.ts` inspects `process.env.EVON_API_URL` and `process.env.EVON_API_KEY`. When a vLLM/Evon inference host is specified, it proxies requests directly to Evon. If an Evon endpoint is not configured, it employs our dedicated high-precision Indic NLU parser, ensuring zero hallucinated credentials while strictly following the required intent taxonomy.

### 2. Supported Intents & Structured Output
Conforms to the required strict JSON contract:
```json
{
  "intent": "ADD_CREDIT",
  "customer_name": "Ramesh",
  "amount": 500,
  "description": null,
  "missing_fields": [],
  "needs_clarification": false,
  "confidence": 0.96
}
```

- **`ADD_CREDIT`**: Customer received goods or credit (e.g., *"Ramesh ko 500 rupaye ka udhaar likho"*).
- **`ADD_PAYMENT`**: Customer returned money or payment received (e.g., *"Amit ne 200 rupaye wapas diye"*).
- **`CHECK_BALANCE`**: Check a customer's individual balance (e.g., *"Suresh ka kitna baaki hai?"*).
- **`CHECK_TOTAL`**: Check store total pending udhaar (e.g., *"Total baaki kitna hai?"*).
- **`UNKNOWN`**: Ambiguous or unparseable input.

### 3. Single-Question Clarification Engine
Never asks multiple questions together. Focuses on natural shopkeeper dialogue:
- Missing customer: *"Kiske naam par?"*
- Missing amount: *"Kitne rupaye?"*
- Ambiguous transaction: *"Udhaar diya ya paise mile?"*

Maintains conversational state across turns:
- **Turn 1:** Shopkeeper: *"Ramesh ko udhaar likho."* → Ekhaata: *"Kitne rupaye?"*
- **Turn 2:** Shopkeeper: *"500."* → Ekhaata: *"Ramesh ka ₹500 udhaar jod doon?"*

---

## 🧪 Verification & Test Results

All 6 required test scenarios verified against `/api/conversation`:

| # | Input Spoken | Extracted Intent | Customer | Amount | Clarification Asked | Ekhaata Response |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | *"Ramesh ko 500 rupaye ka udhaar likho."* | `ADD_CREDIT` | Ramesh | ₹500 | None (`false`) | *"Ramesh ka ₹500 udhaar jod doon?"* |
| **2** | *"Amit ne 200 rupaye wapas diye."* | `ADD_PAYMENT` | Amit | ₹200 | None (`false`) | *"Amit ka ₹200 jama jod doon?"* |
| **3** | *"Suresh ka kitna baaki hai?"* | `CHECK_BALANCE` | Suresh | — | None (`false`) | *"Suresh ka baaki hisaab ₹1,200 hai."* |
| **4** | *"Ramesh ko udhaar likho."* | `ADD_CREDIT` | Ramesh | null | `amount` (`true`) | *"Kitne rupaye?"* |
| **5** | *"500 rupaye likho."* | `ADD_CREDIT` | null | ₹500 | `customer_name` (`true`) | *"Kiske naam par?"* |
| **6** | *"Ramesh ko 500 udhaar aur Amit ne 200 wapas diye."* | `ADD_CREDIT` + `ADD_PAYMENT` | Ramesh & Amit | ₹500 & ₹200 | Compound resolved | *"Ramesh ka ₹500 udhaar aur Amit ka ₹200 jama - dono likh loon?"* |

---

## 🛠️ How to Run

1. Start development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:3000](http://localhost:3000) and tap the microphone to test live speech recognition and conversation intelligence!
