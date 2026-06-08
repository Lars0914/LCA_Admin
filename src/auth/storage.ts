import type { AuthUser } from "../api/client";

const TOKEN_KEY = "lca_admin_token";
const USER_KEY = "lca_admin_user";

export interface StoredSession {
  token: string;
  user: AuthUser;
}

export function loadSession(): StoredSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as AuthUser;
    if (!user?.mail) return null;
    return { token, user };
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
