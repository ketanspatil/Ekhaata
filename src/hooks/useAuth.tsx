"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { getSupabaseBrowserClient } from "@/services/supabaseBrowserClient";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string | undefined;
  shopId: string | null;
  shopName: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    shopName: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * AuthProvider: wraps the app and provides auth state to all components.
 * Uses the browser Supabase client to listen for session changes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();
  const isMounted = useRef(true);

  /**
   * Fetches shop info for the given user using the /api/auth/me endpoint.
   */
  const fetchShopInfo = useCallback(
    async (supabaseUser: User, accessToken: string): Promise<AuthUser> => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          return {
            id: supabaseUser.id,
            email: supabaseUser.email,
            shopId: data.shopId || null,
            shopName: data.shopName || null,
          };
        }
      } catch {
        // Network error — return user without shop info
      }
      return {
        id: supabaseUser.id,
        email: supabaseUser.email,
        shopId: null,
        shopName: null,
      };
    },
    []
  );

  useEffect(() => {
    isMounted.current = true;

    // Initialise session from local storage
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!isMounted.current) return;
      if (error) {
        console.warn("Error fetching Supabase session:", error);
      }
      const sess = data?.session;
      setSession(sess || null);
      if (sess?.user) {
        // Set basic user immediately to unlock authenticated state
        setUser({
          id: sess.user.id,
          email: sess.user.email,
          shopId: null,
          shopName: null,
        });
        setIsLoading(false);
        // Then populate shop info asynchronously in background
        fetchShopInfo(sess.user, sess.access_token).then((fullUser) => {
          if (isMounted.current) setUser(fullUser);
        });
      } else {
        setUser(null);
        setIsLoading(false);
      }
    }).catch(() => {
      if (isMounted.current) setIsLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        if (!isMounted.current) return;
        setSession(sess);
        if (sess?.user) {
          setUser({
            id: sess.user.id,
            email: sess.user.email,
            shopId: null,
            shopName: null,
          });
          setIsLoading(false);
          fetchShopInfo(sess.user, sess.access_token).then((fullUser) => {
            if (isMounted.current) setUser(fullUser);
          });
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted.current = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, fetchShopInfo]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) {
          setIsLoading(false);
          return { error: error.message };
        }
        if (data.session) {
          setSession(data.session);
          if (data.session.user) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email,
              shopId: null,
              shopName: null,
            });
            setIsLoading(false);
            fetchShopInfo(data.session.user, data.session.access_token).then((fullUser) => {
              if (isMounted.current) setUser(fullUser);
            });
          }
        }
        return { error: null };
      } catch (err) {
        setIsLoading(false);
        return {
          error: err instanceof Error ? err.message : "Login failed.",
        };
      }
    },
    [supabase, fetchShopInfo]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      shopName: string
    ): Promise<{ error: string | null }> => {
      setIsLoading(true);
      try {
        // Call our server-side signup route which handles user + shop creation atomically
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, shopName }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setIsLoading(false);
          return { error: data.error || "Signup failed." };
        }

        // Now sign in with the newly created credentials
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (signInError) {
          setIsLoading(false);
          return {
            error: `Account created but login failed: ${signInError.message}`,
          };
        }

        if (signInData.session) {
          setSession(signInData.session);
          if (signInData.session.user) {
            setUser({
              id: signInData.session.user.id,
              email: signInData.session.user.email,
              shopId: data.shopId || null,
              shopName: shopName.trim(),
            });
            setIsLoading(false);
          }
        }

        return { error: null };
      } catch (err) {
        setIsLoading(false);
        return {
          error: err instanceof Error ? err.message : "Signup failed.",
        };
      }
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsLoading(false);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!session?.user,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

