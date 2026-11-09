"use client";

import React, { useState, useEffect } from "react";
import { Mic, Sparkles, AlertCircle, Loader2, Store, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const { signIn, signUp, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err);
        } else {
          router.push("/");
        }
      } else {
        if (!shopName.trim()) {
          setError("Please enter your shop name.");
          setIsSubmitting(false);
          return;
        }
        const { error: err } = await signUp(email, password, shopName);
        if (err) {
          setError(err);
        } else {
          router.push("/");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError(null);
    setEmail("");
    setPassword("");
    setShopName("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F3F0E9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#134E39] animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F3F0E9] flex flex-col justify-center items-center sm:py-6 sm:px-4">
      <div className="w-full sm:max-w-md bg-[#F9F7F2] min-h-screen sm:min-h-0 flex flex-col sm:rounded-[36px] sm:shadow-[0_20px_60px_-15px_rgba(19,78,57,0.15)] sm:border-[6px] sm:border-stone-800/10 overflow-hidden">
        {/* Phone notch decoration */}
        <div className="hidden sm:flex justify-center pt-2 pb-1 bg-white/80">
          <div className="w-20 h-1.5 bg-stone-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="w-full pt-8 pb-6 px-6 bg-white/80 backdrop-blur-md border-b border-[#EFECE6]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#134E39] flex items-center justify-center shadow-sm ring-2 ring-[#134E39]/10">
              <Mic className="w-6 h-6 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#134E39]">
                  Ekhaata
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-[#134E39] px-1.5 py-0.5 rounded-full">
                  Voice AI
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-800 mt-0.5">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Prisma STT &amp; Timbre TTS</span>
              </div>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-stone-900">
            {mode === "login" ? "Apne dukaan mein log in karein" : "Naya khata kholo"}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {mode === "login"
              ? "Apni email aur password daalo"
              : "Account banao aur apni dukaan shuru karo"}
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error banner */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Shop Name (signup only) */}
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="shopName"
                  className="block text-xs font-semibold text-stone-700 mb-1.5"
                >
                  Dukaan ka naam
                </label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    id="shopName"
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Jaise: Sharma Kirana Store"
                    required={mode === "signup"}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#134E39]/30 focus:border-[#134E39] transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-stone-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aapki@email.com"
                required
                autoComplete={mode === "login" ? "username" : "email"}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#134E39]/30 focus:border-[#134E39] transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-stone-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Kam se kam 6 characters" : "••••••••"}
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full px-4 pr-11 py-3 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#134E39]/30 focus:border-[#134E39] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting || authLoading}
              className="w-full py-3.5 rounded-xl bg-[#134E39] hover:bg-[#0f3e2e] active:scale-[0.98] text-white font-semibold text-sm shadow-md shadow-[#134E39]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isSubmitting || authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{mode === "login" ? "Log in ho raha hai..." : "Account ban raha hai..."}</span>
                </>
              ) : (
                <span>{mode === "login" ? "Log In" : "Account Banao"}</span>
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 text-center">
            <p className="text-xs text-stone-500">
              {mode === "login" ? "Pehli baar aa rahe ho?" : "Pehle se account hai?"}
            </p>
            <button
              type="button"
              onClick={toggleMode}
              className="mt-1 text-sm font-semibold text-[#134E39] hover:underline cursor-pointer"
            >
              {mode === "login" ? "Naya account banao" : "Log in karein"}
            </button>
          </div>

          {/* Info note */}
          <div className="mt-6 p-3 bg-emerald-50 border border-emerald-200/60 rounded-xl">
            <p className="text-[11px] text-emerald-800 text-center leading-relaxed">
              Aapka data sirf aapki dukaan ke liye hai.
              <br />
              Voice se udhaar-khata — Hindi, Marathi, Hinglish mein.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

