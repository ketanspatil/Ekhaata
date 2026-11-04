# Ekhaata (ई-खाता) 🎙️

**Mobile-first, voice-first conversational udhaar assistant for Indian small shopkeepers.**

Ekhaata is designed to let local shopkeepers manage customer credit (*udhaar*) and daily payments (*jama*) simply by speaking naturally in Marathi, Hindi, or Hinglish. Instead of a traditional, tedious accounting dashboard, Ekhaata operates as a natural voice dialogue, built to showcase **Gnani AI's Prisma STT and Timbre TTS models**.

---

## 🚀 Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **UI & Styling:** React & Tailwind CSS
- **Icons:** Lucide React
- **Voice Foundation:** Web MediaRecorder API (`getUserMedia`, audio streams, WebM/Opus)

---

## 📱 Architecture & Components

```
src/
├── app/
│   ├── globals.css          # Custom warm-palette themes & voice ripple animations
│   ├── layout.tsx           # Mobile viewport configuration & Indian typography
│   └── page.tsx             # Responsive mobile shell container
├── components/
│   ├── Header.tsx           # App brand, shopkeeper greeting & Gnani AI model badge
│   ├── BalanceCard.tsx      # Total pending udhaar (₹12,500), customer count & status
│   ├── ConversationArea.tsx # Natural chat dialogue between Shopkeeper & Ekhaata
│   ├── RecentActivity.tsx   # Compact feed of latest 2–3 transactions
│   └── VoiceRecorder.tsx    # Prominent mic button, animated listening state & audio preview
├── hooks/
│   └── useVoiceRecorder.ts  # MediaRecorder lifecycle, audio stream, timer & error handling
└── types/
    └── index.ts             # TypeScript definitions for messages, transactions, and audio
```

---

## 🛠️ How to Run the Application

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000).

4. **Production Build**:
   ```bash
   npm run build
   npm run start
   ```

---

## 🎙️ How Microphone Recording Works

1. **Permission Request**: When the shopkeeper taps the large circular microphone button, `navigator.mediaDevices.getUserMedia({ audio: true })` asks for browser microphone permission.
2. **Audio Streaming & Slicing**: Audio is streamed into the browser's native `MediaRecorder` API using supported codecs (`audio/webm;codecs=opus`, with fallbacks to `audio/mp4` or default). Data chunks are gathered every 200ms.
3. **Listening Animation**: While active, the UI transitions to the `"Sun raha hoon..."` state with animated audio waves and pulsing ripple rings, displaying an active recording timer.
4. **Stopping & Cleanup**: Clicking the stop button halts recording, stops all media hardware tracks (turning off the browser microphone indicator), and bundles audio chunks into a `Blob`.
5. **Prisma STT Readiness**: The UI renders `"Recording ready for Prisma STT integration."` alongside audio duration, file size, and an interactive playback preview so the user can verify their captured voice.
6. **Error Handling**: Gracefully detects and displays friendly Hindi/English warnings for permission denial (`NotAllowedError`), missing microphones, or device busy states.

---

## 🧪 How to Test Recording

1. Open [http://localhost:3000](http://localhost:3000) on your desktop browser or mobile device.
2. Tap the large green **"Tap to speak"** button at the bottom.
3. Click **"Allow"** on the browser's microphone permission prompt.
4. Observe the listening state:
   - Status changes to **"Sun raha hoon..."**.
   - Soundwave frequency bars animate.
   - Recording timer starts counting up.
5. Speak any sentence (e.g. *"Ramesh ko 500 rupaye ka udhaar likho"*).
6. Click the red **"Roko" (Stop)** button.
7. Observe the completion state:
   - **"Recording ready for Prisma STT integration."** is displayed.
   - Click **"Recording Suno"** to hear your recorded audio played back.
   - Click **"Dobara bolein"** to reset and record another sentence.
8. Test permission denial: Block microphone permissions in browser site settings to verify the error alert banner and guidance.

---

## ⚠️ Current Scope & Known Limitations

- **API Integration Pending:** Per milestone requirements, no external AI APIs (Gnani Prisma STT / Timbre TTS) have been hooked up yet.
- **Sample Dialogue:** The conversation area displays static sample messages illustrating how Gnani AI's natural language interaction will look and feel.
- **Audio Codecs:** Codec support depends on the client browser (`webm/opus` on Chrome/Firefox/Edge, `mp4/aac` on Safari).
