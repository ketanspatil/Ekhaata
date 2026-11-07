# Ekhaata — Working Document
*Last updated: 7 Nov 2026*

---

## 1. What Is Ekhaata?

A voice-driven shopkeeper's ledger (udhaar-khata) for rural/semi-urban India. The shopkeeper speaks in Hindi, Marathi, or Hinglish; the app transcribes, understands, and records credit/payment transactions — then reads the answer back aloud.

**Target interaction:**
> "Ramesh ko paaanch sau ka udhaar likho." → ✅ Records ₹500 credit → speaks confirmation.

---

## 2. Current Architecture

```
Browser (Next.js client)
│
├── VoiceRecorder (mic button, MediaRecorder API)
│       ↓ raw audio blob
├── POST /api/stt          → Gnani Prisma v3.0 (vachana.ai)
│       ↓ Devanagari / Hinglish transcript
├── POST /api/conversation → conversationEngine.ts (Indic NLU)
│       ↓ structured intent + reply text
├── POST /api/tts          → Gnani Timbre v3.0 (vachana.ai)
│       ↓ WAV audio (base64)
└── Audio.play()           ← spoken reply back to shopkeeper
```

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Root UI: orchestrates STT → conversation → TTS pipeline |
| `src/app/api/stt/route.ts` | Server-side Gnani Prisma STT proxy |
| `src/app/api/tts/route.ts` | Server-side Gnani Timbre TTS proxy |
| `src/app/api/conversation/route.ts` | Thin REST wrapper around `conversationEngine` |
| `src/services/conversationEngine.ts` | Intent classification, number extraction, name extraction, clarification state machine |
| `src/services/ledgerService.ts` | Dual-layer ledger: Supabase → JSON-file fallback |
| `src/services/databaseLedgerService.ts` | All Supabase DB operations (CRUD, balance calc, dedup) |
| `src/services/supabaseClient.ts` | `getSupabaseClient()` with graceful missing-credential detection |
| `src/utils/numberParser.ts` | Hindi/Marathi/Hinglish number-word → integer (e.g. "एक हजार छह सौ" → 1600) |
| `src/utils/nameNormalizer.ts` | Devanagari transliteration, full-name extraction, phonetic match |
| `src/types/index.ts` | Shared TypeScript types |
| `supabase/schema.sql` | PostgreSQL schema (run once in Supabase SQL Editor) |

### Storage Layer

**Current state: JSON fallback is active.** Supabase is fully coded but not yet connected.

```
Supabase PostgreSQL (PRIMARY — not yet connected)
  tables: shops, customers, transactions
  view:   customer_balances_view
  arithmetic: integer paise (BIGINT), no float rounding errors

data/ledger.json (FALLBACK — active right now)
  seed data: Suresh Patil ₹1000, Anita Bai ₹250
  persistence: file on disk, lost on serverless redeploy
```

---

## 3. What Is Completed ✅

### Module 1 — Voice Input (STT)
- Gnani Prisma v3.0 STT via `POST /api/stt`
- Auto-detects Hindi, Marathi, Hinglish (`indic-auto`)
- Magic-byte audio format detection (WAV, WebM, OGG, MP3, M4A)
- Guards against 0-byte clicks (< 500 bytes rejected)

### Module 2 — Conversation Engine (NLU)
- Intent classification: `ADD_CREDIT`, `ADD_PAYMENT`, `CHECK_BALANCE`, `CHECK_TOTAL`, `UNKNOWN`
- Disambiguates credit vs. payment using grammatical markers (`ne`/`ko`, `udhaar`/`jama`)
- Asks one clarifying question when ambiguous: *"Udhaar diya ya paise mile?"*
- Multi-turn context (pending customer, pending amount, pending intent carried across turns)
- Pronoun resolution: *"uska kitna baaki hai"* → uses `lastCustomerName` from context
- Multi-operation parsing: *"Ramesh ko 500 udhaar aur Amit ne 200 wapas diye"*
- Optional Gnani Evon LLM integration (via `EVON_API_URL` env var, falls back gracefully)

### Module 3 — Number Parsing
- Full Hindi/Marathi/Hinglish number word dictionary (1–99 + hundreds + thousands + lakhs)
- Compound phrase parsing: "एक हजार छह सौ" = 1600, "सोलह सौ" = 1600, "पाचशे" = 500
- Devanagari digit normalisation (०-९ → 0-9)
- Colloquial Marathi: "पंधराशे" = 1500, "अडीचशे" = 250
- Amount validation: never commits an uncertain amount

### Module 4 — Customer Name Handling
- Full multi-word name extraction (up to 3 tokens: first + middle + last)
- Devanagari → Latin transliteration for phonetic matching
- Phonetic token matching (Ramesh ≈ Ramesh, Patil ≈ Patel with controlled tolerance)
- Full-name required when both names are multi-token (prevents "Suresh Patil" matching "Suresh Deshmukh")
- Disambiguation flow: *"Kaunse Suresh?"* when multiple customers share a first name
- Not-found flow: *"Ye customer nahi mila. Dobara naam bataiye."*

### Module 5 — Permanent Database (Code Complete, Needs Credentials)
- Supabase PostgreSQL schema written (`supabase/schema.sql`)
- Tables: `shops`, `customers`, `transactions` with UUID PKs
- View: `customer_balances_view` for efficient balance aggregation
- Integer paise arithmetic (no float errors)
- Idempotency key on transactions (prevents duplicates)
- RLS policies prepared (owner isolation for Module 6)
- `databaseLedgerService.ts`: full CRUD + balance + dedup + reversal
- Dual-layer `ledgerService.ts`: Supabase primary, JSON fallback
- 7-step verification test: `scripts/test-supabase.ts`
- **TypeScript: 0 errors. ESLint: 0 errors. Build: passing.**

### Module — TTS (Voice Output)
- Gnani Timbre v3.0 via `POST /api/tts`
- Auto-plays every assistant response after transcription
- Currency symbol expansion: ₹500 → "500 rupaye" before TTS
- Cached audio URL per message (re-play without re-fetching)
- Loading, playing, and error states in UI
- Voice: Shivani, Language: hi-IN

---

## 4. What Is Broken / Not Yet Working ⚠️

### 🔴 Critical: Supabase Not Connected
**All transactions save to `data/ledger.json` only.** This file is lost on server restart in production. The entire Supabase layer is coded and type-safe but needs 2 environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Without these, Module 5 is not functional.** Data does not persist across deploys.

### 🟡 No Authentication (by design — Module 6)
- Shop ID is hardcoded to UUID `00000000-0000-0000-0000-000000000001`
- All data belongs to one "Sharma Kirana Store"
- No login, no shop selection, no owner verification

### 🟡 TTS Language is Fixed to hi-IN
- TTS always sends `language: "hi-IN"` regardless of STT-detected language
- Marathi replies may be pronounced with Hindi accent
- Fix: pass `detectedLanguage` from STT through to TTS payload

### 🟡 Multi-Operation Transactions Not Saved
- `detectMultipleOperations()` parses compound sentences correctly
- But it returns a reply without actually calling `recordTransaction()` for both ops
- Only the first operation would be saved if the UI triggered it

### 🟡 No Confirmation Step Before Saving
- Transactions are saved immediately upon intent recognition
- No *"Ramesh ko ₹1600 udhaar — sahi hai?"* confirmation round-trip
- Risk: a misheard number commits a wrong amount

### 🟡 `getAllCustomerBalances()` Not Async-Safe
- `ledgerService.ts` line 296: `getAllCustomerBalances()` is sync and reads JSON only
- Used internally by `getTotalPendingUdhaar()` / `getActiveCustomersCount()` in fallback path — this is fine in fallback mode but could diverge if partially migrated

---

## 5. Remaining Tasks

### Module 5 Completion (Blocker)

- [ ] **User: Create Supabase project** at [supabase.com](https://supabase.com)
- [ ] **User: Run `supabase/schema.sql`** in Supabase SQL Editor
- [ ] **User: Add env vars** to `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```
- [ ] Restart dev server: `npm run dev`
- [ ] Run verification: `npx tsx scripts/test-supabase.ts` → all 7 steps must pass
- [ ] Verify persistence: kill server, restart, re-run test — balances must survive

### Module 6 — Authentication & Multi-Shop

- [ ] Add login (phone OTP or Google) via Supabase Auth
- [ ] Replace hardcoded `DEFAULT_SHOP_ID` with session-derived shop ID
- [ ] Enable Supabase RLS policies (already written in `schema.sql`, just need `auth.uid()` to be non-null)
- [ ] Never trust `shop_id` from browser — always derive from server session
- [ ] Show shop owner's name / store name from `shops` table

### Module 7 — Reliability & UX Polish

- [ ] **Confirmation step**: before saving, ask *"Sahi hai?"* and require "haan" to commit
- [ ] **TTS language passthrough**: use STT-detected language (`mr-IN` / `hi-IN`) for TTS voice selection
- [ ] **Multi-op save fix**: call `recordTransaction()` for each op in `detectMultipleOperations()`
- [ ] **Error recovery**: if STT fails, show mic-off error with retry (not silent)
- [ ] **Offline indicator**: detect when Gnani APIs are unreachable, show fallback UI
- [ ] **Reversal UI**: allow shopkeeper to say *"Galti hua, wapas karo"* to reverse last transaction

### Module 8 — Customer Management UI

- [ ] Customer list screen (all names + outstanding balances)
- [ ] Tap a customer to see full transaction history
- [ ] Add customer manually (name + optional phone)
- [ ] Mark a customer's account as settled

### Module 9 — Reports & Export

- [ ] Daily/weekly summary: *"Aaj kitna udhaar gaya?"*
- [ ] Export ledger as PDF or WhatsApp-shareable text
- [ ] Monthly pending report sorted by amount owed

### Module 10 — Production Hardening

- [ ] Deploy to Vercel (with Supabase env vars in Vercel project settings)
- [ ] Rate-limit `/api/stt` and `/api/tts` (Gnani API costs money per call)
- [ ] Add Sentry or similar error tracking
- [ ] Load test with 50+ customers and 500+ transactions

---

## 6. How to Run Right Now

```powershell
cd d:\Projects\Ekhaata

# Dev server (already running as background task)
npm run dev
# → http://localhost:3000

# TypeScript type-check
npx tsc --noEmit

# Lint
npm run lint

# Unit tests (run offline, no API keys needed)
npx tsx scripts/test-validation.ts
npx tsx scripts/test-customer-name-bug.ts

# Supabase 7-step test (requires DB credentials)
npx tsx scripts/test-supabase.ts
```

---

## 7. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GNANI_API_KEY` | ✅ Yes (present) | Gnani Prisma STT + Timbre TTS |
| `NEXT_PUBLIC_SUPABASE_URL` | ⚠️ Missing | Supabase PostgreSQL connection |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Missing | Supabase server-side auth (never expose to browser) |
| `EVON_API_URL` | Optional | Gnani Evon LLM for advanced NLU (falls back to rule engine if absent) |
| `EVON_API_KEY` | Optional | Auth for Evon LLM (falls back to `GNANI_API_KEY`) |
| `EVON_MODEL` | Optional | Defaults to `gnani/gnani-evon-v3.3-30B-A3B` |

