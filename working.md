# Ekhaata — Working Document
*Last updated: 9 Nov 2026*

---

## 1. What Is Ekhaata?

A voice-driven shopkeeper's ledger (udhaar-khata) for rural/semi-urban India. The shopkeeper speaks in Hindi, Marathi, or Hinglish; the app transcribes, understands, and records credit/payment transactions — then reads the answer back aloud.

**Target interaction:**
> "Ramesh ko paanch sau ka udhaar likho." → ✅ Records ₹500 credit → speaks confirmation.

---

## 2. Current Architecture

```
Browser (Next.js 16 Client)
│
├── AuthProvider (useAuth hook via @/services/supabaseBrowserClient)
│   ├── Login / Signup UI (/login)
│   ├── Session state (JWT via Supabase Auth)
│   └── Header logout action
│
├── VoiceRecorder (mic button, MediaRecorder API)
│       ↓ records audio Blob
│       ├── 1. POST /api/stt (multipart) → Gnani Prisma v3.0 (vachana.ai)
│       │       ↓ preliminary Devanagari / Hinglish transcript
│       └── 2. Converts audio Blob to Base64
│
├── POST /api/conversation (JSON with transcript + audioBase64 + context)
│   │
│   ├── Google Gemini API (gemini-2.5-flash) [NEW: Multimodal Speech Understanding]
│   │   ├── Listens to original audio (detects ₹500 vs ₹100 discrepancy)
│   │   ├── Inspects Prisma transcript
│   │   └── Outputs structured JSON (customer, amount, intent, language, corrected_transcript)
│   │
│   ├── Conversation Engine (conversationEngine.ts)
│   │   ├── Validates interpretation against actual customer records
│   │   ├── Disambiguates credit vs. payment
│   │   └── Confirmation step ("Sahi hai?" before saving to Supabase)
│   │
│   ├── Supabase Ledger (databaseLedgerService.ts)
│   │   └── Integer-paise atomic storage scoped by authenticated user's shop_id
│   │
│   └── POST /api/tts → Gnani Timbre v3.0 (vachana.ai)
│           ↓ WAV audio (base64)
│
└── Audio.play() ← spoken reply back to shopkeeper
```

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Protected dashboard: balance summary, conversation, audio dispatch |
| `src/app/login/page.tsx` | Mobile-first auth UI (login + signup + shop creation) |
| `src/services/geminiService.ts` | Gemini multimodal speech & bookkeeping interpretation layer |
| `src/services/conversationEngine.ts` | Multi-turn confirmation state machine & ledger resolver |
| `src/components/VoiceRecorder.tsx` | Records audio, calls Prisma STT, passes audio & transcript upstream |
| `src/hooks/useAuth.tsx` | React auth context, session listener, login/signup/logout helpers |
| `src/services/supabaseBrowserClient.ts` | Browser-safe Supabase client (anon key only) |
| `src/services/supabaseClient.ts` | Server-side admin client & `getAuthenticatedUser()` token verifier |
| `src/app/api/auth/signup/route.ts` | Atomic user registration + shop record creation |
| `src/app/api/auth/login/route.ts` | Server-verified credentials login |
| `src/app/api/auth/me/route.ts` | Profile + shop metadata retrieval for authenticated user |
| `src/app/api/conversation/route.ts` | Coordinates Gemini audio interpretation & conversation engine |
| `src/services/ledgerService.ts` | Dual-layer ledger (Supabase primary with `shopId`, JSON fallback) |
| `src/services/databaseLedgerService.ts` | Full PostgreSQL CRUD scoped by `shop_id` |
| `src/components/Header.tsx` | Displays authenticated shop name + sign out button |

---

## 3. What Is Completed ✅

### Module 1 — Voice Input (STT)
- Gnani Prisma v3.0 STT via `POST /api/stt`
- Auto-detects Hindi, Marathi, Hinglish (`indic-auto`)
- Magic-byte audio container detection (WAV, WebM, OGG, MP3, M4A)
- Rejects zero-byte/trivial clicks (< 500 bytes)

### Module 2 — Intelligent Speech & Bookkeeping Layer (Google Gemini API) ✅
- **Multimodal Audio Inspection**: Gemini model `gemini-2.5-flash` analyzes both the raw recorded audio and Gnani Prisma's preliminary transcript.
- **Audio Ground Truth**: Spoken numbers and names are prioritized from raw audio over noisy STT text (resolving ₹500 vs ₹100, "पाचशे", "पंधराशे", "एक हजार छह सौ").
- **Customer & Amount Disambiguation**: Phonetic initial consonant protection ensures "Ramesh" is never confused with "Yogesh" or "Suresh".
- **Structured Financial Extraction**: Extracts `customer_name`, `amount`, `transaction_type` (`ADD_CREDIT`, `ADD_PAYMENT`, `CHECK_BALANCE`, `CHECK_TOTAL`), `language`, `confidence`, and `clarification_question`.
- **Transaction Safety & Confirmation**: Confirms before committing to DB ("Sahi hai?") and immediately returns persisted customer balance & shop-wide totals.
- **Preserved Existing TTS & STT**: Prisma handles initial transcription; Timbre handles voice synthesis; Gemini acts as the intelligent multimodal reasoning brain.

### Module 3 — Permanent Database & Authentication
- Full Supabase Auth (signup, login, logout, session persistence across refreshes)
- Multi-shop data isolation with verified JWTs (no client-side shop_id trusted)
- Integer paise financial arithmetic (`amount_paise BIGINT`)
- Dual-case transaction type matching (`udhaar`/`jama` and `CREDIT`/`PAYMENT`) preventing ₹0 balance disconnects.
- Automatic non-DEFAULT handling for Postgres generated columns (`amount_paise`).
- Idempotent transactions & reversal auditing.

---

## 4. Remaining Tasks

### Module 7 — Reliability & UX Polish ✅
- **Transaction Confirmation**: Before recording any transaction to Supabase, summarizes customer name, exact amount, and transaction type in Hindi or Marathi, asking for explicit confirmation ("Sahi hai?" / "बरोबर आहे?"). Handles cancellation ("nahi", "cancel", "galat") safely without losing session state.
- **Automatic TTS Language Selection**: Detected language (Hindi `hi-IN`, Marathi `mr-IN`, Indian English `en-IN`) is passed dynamically to Gnani Timbre TTS so Marathi speakers hear native Marathi and Hindi speakers hear native Hindi.
- **Multiple Transactions**: Compound utterances (e.g., "Ramesh ko 500 udhaar aur Amit ne 200 rupaye wapas diye") are extracted into individual operations, summarized for complete confirmation, and persisted independently in Supabase.
- **STT Error Recovery**: User-friendly Indian language error messaging for microphone permission rejections, silent/empty audio, and Prisma STT network failures without silently dropping transactions.
- **Offline Indicator**: Real-time `/api/health` monitoring displayed directly in the header banner showing service connectivity status.
- **Transaction Reversal**: Commands like "Galti ho gayi, last transaction wapas karo" find the most recent shop transaction, summarize it, require explicit confirmation, create an immutable reversal audit record in Supabase, and recalculate the customer balance without deleting historical records.

---

## 4. Remaining Tasks

### Module 8 — Customer Management UI ✅
- **Customer Directory List**: Dedicated Customers section displaying all customers belonging to the authenticated shop, their calculated balances, total credit given, total payments received, and last activity timestamps.
- **Search & Sort**: Real-time filtering by customer name or phone number, with one-tap sorting by Highest Pending Udhaar (`balance DESC`) or Alphabetical (`A - Z`).
- **Customer Profile & Ledger History**: Inspecting a customer opens their complete ledger sheet showing total credit, total payments, net balance, and chronological transaction history (dates, amounts, credit/payment badges, and notes).
- **Manual Customer Creation**: Shopkeepers can add new customers manually (`+ Naya Grahak`) with name (required) and phone (optional), protected against accidental duplicates using normalized Indic name matching and scoped strictly to their authenticated `shop_id`.
- **Mark Account as Settled ("Hisaab Barabar")**: One-click settlement button with confirmation modal that records a proper payment (`jama`) transaction for the outstanding balance into Supabase using integer paise accuracy, immediately updating balances without deleting or modifying previous transaction records.
- **Dashboard Integration**: Clean top-level tab switcher between "Awaaz / Khata" (Voice AI ledger) and "Grahak (Customers)", synchronizing balances and transactions across both views.

### Module 9 — Reports & Export ✅
- **Daily & Weekly Financial Summaries**: Real-time aggregate reports displaying total credit given, total payments received, net outstanding amount, transaction counts, and pending customer counts. Filterable across Daily (today IST) and Weekly (current week IST).
- **Monthly Pending Udhaar Report**: Comprehensive monthly report sorted by highest outstanding balance first, listing each customer's total credit, total payments, net remaining balance, along with overall shop totals.
- **PDF Ledger Export**: Client-side vector PDF generation via `jspdf`, branded with Ekhaata header, shop metadata, generation timestamp in IST, summary financial cards, customer accounts table, and page footers.
- **WhatsApp Shareable Reports**: One-click share formatting clean Unicode reports with bold figures, bulleted top pending balances, and click-to-chat `https://api.whatsapp.com/send?text=...` links without requiring third-party business API setups.
- **Strict Integer-Paise Arithmetic & Data Security**: Derived exclusively from authenticated JWT session `shop_id`. Excludes reversed transactions from active totals while preserving audit trails. Zero floating-point rounding errors.

---

## 5. Next Steps
- [ ] SMS / WhatsApp payment reminders for individual customers with high pending udhaar
- [ ] Export reports in CSV format
