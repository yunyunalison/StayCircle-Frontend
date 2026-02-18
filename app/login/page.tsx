"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, type LoginPayload } from "../../lib/api";

/**
 * Login Page
 * - Email/password login; stores token+user (handled in api.login), redirects home.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);

    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) {
      setErr("Email is required");
      return;
    }
    if (!password) {
      setErr("Password is required");
      return;
    }

    const payload: LoginPayload = { email: emailTrimmed, password };

    setSubmitting(true);
    try {
      await login(payload);
      router.push("/");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to sign in";
      setErr(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold">Sign in</h1>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <label htmlFor="email" className="grid gap-1.5">
          <span className="text-sm text-gray-700">Email</span>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </label>

        <label htmlFor="password" className="grid gap-1.5">
          <span className="text-sm text-gray-700">Password</span>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </main>
  );
}
