/**
 * NavBar
 * Client component that reflects auth state across the app.
 *
 * Behavior:
 * - Reads current auth from localStorage (via frontend/lib/auth)
 * - Subscribes to AUTH_EVENT to stay in sync after login/logout on other pages
 * - Renders role badge and session-aware actions
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuth, getAuth, AUTH_EVENT } from "../lib/auth";
import { useEffect, useState } from "react";

/**
 * NavBar (client component)
 * - Shows Sign in / Sign up when logged out.
 * - Shows user email + role badge and Logout when logged in.
 * - Listens to auth change events to stay in sync after login/logout.
 */
export default function NavBar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"landlord" | "tenant" | null>(null);

  useEffect(() => {
    // Keep component state in sync with persisted auth
    const updateFromAuth = () => {
      const a = getAuth();
      if (a) {
        setEmail(a.user.email);
        setRole(a.user.role);
      } else {
        setEmail(null);
        setRole(null);
      }
    };

    // Initial read
    updateFromAuth();

    // Subscribe to auth changes (e.g., when another tab/page logs in or out)
    if (typeof window !== "undefined") {
      window.addEventListener(AUTH_EVENT, updateFromAuth as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(AUTH_EVENT, updateFromAuth as EventListener);
      }
    };
  }, []);

  /**
   * Clear local auth and navigate home.
   * Server-side tokens are stateless JWTs, so no server call is necessary.
   */
  function onLogout() {
    clearAuth();
    // Reset local UI state
    setEmail(null);
    setRole(null);
    router.push("/");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold">
          StayCircle
        </Link>

        {email ? (
          // Authenticated state: show user identity, role badge, and actions
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="truncate">{email}</span>
              {role && (
                <span
                  className={
                    role === "landlord"
                      ? "rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      : "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                  }
                >
                  {role}
                </span>
              )}
            </div>
            <Link
              href="/bookings"
              className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              My bookings
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        ) : (
          // Anonymous state: show "guest" badge and auth entry points
          <nav className="flex items-center gap-2">
            <span
              className={
                "rounded-full bg-black px-3 py-1 text-xs font-semibold text-white shadow-md hover:bg-gray-900 transition-colors duration-200"
              }
            >
              {"guest"}
            </span>
            <Link
              href="/login"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign up
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
