/* ─── AuthContext ─────────────────────────────────────────────
   Wrap the app with <AuthProvider> to:
   1. Listen to Firebase onAuthStateChanged
   2. Show LoginScreen when not authenticated
   3. Provide { user, signOut } to child components
   4. Auto-handle LINE Login callback (?code=xxx)            */

import type { User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  completeLineLogin,
  signOut as fbSignOut,
  onAuthChange,
} from "../firebase/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  error: null,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handlingCallback, setHandlingCallback] = useState(false);
  const lineCallbackHandledRef = useRef(false);

  /* ─── Listen to auth state ────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthChange((firebaseUser: User | null) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsub;
  }, []);

  /* ─── Auto-handle LINE Login callback ─────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    // If URL has ?code=, this is a LINE Login callback
    if (code && state && !handlingCallback && !lineCallbackHandledRef.current) {
      lineCallbackHandledRef.current = true;
      setHandlingCallback(true);
      setLoading(true);
      setError(null);

      completeLineLogin()
        .then((firebaseUser) => {
          setUser(firebaseUser);
          // Clean up URL (remove ?code=&state= params)
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch((err) => {
          console.error("[Auth] LINE callback failed:", err);
          setError(err.message || "LINE Login ไม่สำเร็จ");
          // Clean up URL
          window.history.replaceState({}, "", window.location.pathname);
        })
        .finally(() => {
          setLoading(false);
          setHandlingCallback(false);
        });
    }
  }, [handlingCallback]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Sign out ────────────────────────────────────────────── */
  const handleSignOut = useCallback(async () => {
    await fbSignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: loading || handlingCallback,
        error,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
