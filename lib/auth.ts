/**
 * Lightweight auth state utilities for the frontend.
 * - Persists { token, user } in localStorage
 * - Emits a CustomEvent so components can react to auth changes
 * - Safe in SSR environments (no window access on the server)
 */
export type Role = "landlord" | "tenant";

export type User = {
  id: number;
  email: string;
  role: Role;
};

export type AuthState = {
  token: string;
  user: User;
};

/**
 * Storage key for persisted auth and the custom event name emitted on changes.
 * Components can listen for `window.addEventListener(AUTH_EVENT, ...)`.
 */
const STORAGE_KEY = "sc_auth";
export const AUTH_EVENT = "sc-auth-change";

/**
 * Persist the auth state and broadcast a CustomEvent to the window.
 * No-ops safely during SSR.
 */
export function saveAuth(state: AuthState): void {
  if (typeof window === "undefined") return; // SSR guard
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { state } }));
  } catch {
    // ignore if CustomEvent not available
  }
}

/**
 * Read the auth state from localStorage.
 * Returns null if absent or if parsing fails; SSR-safe.
 */
export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

/**
 * Clear persisted auth state and notify listeners.
 * No-ops during SSR.
 */
export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { state: null } }));
  } catch {
    // ignore if CustomEvent not available
  }
}

/**
 * Convenience accessor for the current JWT (or null if unauthenticated).
 */
export function getToken(): string | null {
  const a = getAuth();
  return a?.token ?? null;
}

/**
 * True if the current user is a landlord.
 */
export function isLandlord(): boolean {
  const a = getAuth();
  return a?.user?.role === "landlord";
}
