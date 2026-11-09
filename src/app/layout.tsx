import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Ekhaata - Awaz se Khata aur Udhaar Prabandhan",
  description:
    "Mobile-first, voice-first udhaar assistant for Indian shopkeepers powered by Gnani AI Prisma STT & Timbre TTS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#134E39",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F9F7F2] text-slate-900 selection:bg-emerald-200 selection:text-emerald-950 font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
