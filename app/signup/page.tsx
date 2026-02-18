"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signup, type SignupPayload } from "../../lib/api";

/**
 * Signup Page
 * - Allows selecting a single role (landlord or tenant).
 * - Stores token+user on success (handled in api.signup), then navigates home.
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"landlord" | "tenant">("tenant");
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
    if (password.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    const payload: SignupPayload = {
      email: emailTrimmed,
      password,
      role,
    };

    setSubmitting(true);
    try {
      await signup(payload);
      router.push("/");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to sign up";
      setErr(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold">Sign up</h1>

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

        <fieldset className="grid gap-2">
          <legend className="text-sm text-gray-700">Role</legend>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="role"
              value="tenant"
              checked={role === "tenant"}
              onChange={() => setRole("tenant")}
              className="h-4 w-4"
            />
            I'm a tenant
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="role"
              value="landlord"
              checked={role === "landlord"}
              onChange={() => setRole("landlord")}
              className="h-4 w-4"
            />
            I'm a landlord
          </label>
          <p className="text-xs text-gray-500">Select one role. Role defaults to tenant if not specified.</p>
        </fieldset>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Signing up..." : "Sign up"}
          </button>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </main>
  );
}
