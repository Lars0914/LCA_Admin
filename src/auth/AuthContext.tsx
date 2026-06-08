import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
  getAdminMe,
  signIn as apiSignIn,
  signUp as apiSignUp,
  type AuthUser,
} from "../api/client";
import { clearSession, loadSession, saveSession } from "./storage";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  signIn: (mail: string, password: string) => Promise<void>;
  signUp: (mail: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureAdminAccess(token: string): Promise<void> {
  try {
    await getAdminMe(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      throw new Error("This account does not have admin access.");
    }
    throw err;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setReady(true);
      return;
    }

    getAdminMe(session.token)
      .then(() => {
        setToken(session.token);
        setUser(session.user);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setReady(true));
  }, []);

  const applySession = useCallback(async (nextToken: string, nextUser: AuthUser) => {
    await ensureAdminAccess(nextToken);
    saveSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const signIn = useCallback(
    async (mail: string, password: string) => {
      const { token: nextToken, user: nextUser } = await apiSignIn(mail, password);
      await applySession(nextToken, nextUser);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (mail: string, password: string) => {
      const { token: nextToken, user: nextUser } = await apiSignUp(mail, password);
      await applySession(nextToken, nextUser);
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, signIn, signUp, signOut }),
    [user, token, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
