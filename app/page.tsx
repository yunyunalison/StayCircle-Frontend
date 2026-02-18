/**
 * Home (properties) page
 * - Lists properties for both anonymous users and authenticated users
 * - Landlords can create new listings
 * - Tenants can request bookings and open chat with hosts
 * Notes:
 * - Keep UI logic here; network/contracts live in frontend/lib/*
 */
"use client";

import { useEffect, useState } from "react";
import type { Property, PropertyCreate, BookingCreateResponse, NextAction } from "../lib/api";
import { listProperties, createProperty, createBooking } from "../lib/api";
import { isLandlord, getAuth } from "../lib/auth";
import ChatPanel from "../components/ChatPanel";

/**
 * Type guard for the "pay" next_action variant.
 */
function isPayAction(a: NextAction): a is { type: "pay"; expires_at: string; client_secret: string } {
  return a.type === "pay";
}

/**
 * HomePage
 * - Orchestrates fetching property listings and composes child components
 * - Shows a creation form for landlords
 * - Delegates chat and booking flows to dedicated components/helpers
 */
export default function HomePage() {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [canBook, setCanBook] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listProperties();
      setItems(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load properties";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load properties on initial mount
    refresh();
  }, []);

  function handleCreated(p: Property) {
    // Optimistically prepend new item
    setItems((prev) => [p, ...prev]);
  }

  useEffect(() => {
    setCanCreate(isLandlord());
    const a = getAuth();
    setCanBook(!!a && a.user?.role === "tenant");
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold">StayCircle — Properties</h1>

      {canCreate && (
        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-medium">Create a Property</h2>
          <CreatePropertyForm onCreated={handleCreated} />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Properties</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-600">
            {canCreate ? "No properties yet. Create one above." : "No properties yet."}
          </p>
        ) : (
          <PropertiesList items={items} canBook={canBook} />
        )}
      </section>
    </main>
  );
}

/**
 * CreatePropertyForm
 * - Minimal local validation and client-only state
 * - Converts USD input to price_cents for the API
 */
function CreatePropertyForm({ onCreated }: { onCreated: (p: Property) => void }) {
  const [title, setTitle] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);

    const titleTrimmed = title.trim();
    if (!titleTrimmed) {
      setErr("Title is required");
      return;
    }

    const priceNumber = Number(priceUsd);
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      setErr("Price must be a non-negative number");
      return;
    }

    const payload: PropertyCreate = {
      title: titleTrimmed,
      price_cents: Math.round(priceNumber * 100),
      requires_approval: requiresApproval,
    };

    setSubmitting(true);
    try {
      const created = await createProperty(payload);
      onCreated(created);
      setTitle("");
      setPriceUsd("");
      setRequiresApproval(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create property";
      setErr(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <label htmlFor="title" className="grid gap-1.5">
        <span className="text-sm text-gray-700">Title</span>
        <input
          id="title"
          type="text"
          placeholder="Cozy studio in SF"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        />
      </label>

      <label htmlFor="priceUsd" className="grid gap-1.5">
        <span className="text-sm text-gray-700">Price (USD)</span>
        <input
          id="priceUsd"
          type="number"
          min="0"
          step="0.01"
          placeholder="99.00"
          value={priceUsd}
          onChange={(e) => setPriceUsd(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        />
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>Requires host approval</span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}

/**
 * PropertiesList
 * - Renders properties and a simple booking request form
 * - Displays status banners for "await approval" and "pending payment" (with countdown)
 */
function PropertiesList({ items, canBook }: { items: Property[]; canBook: boolean }) {
  // Track per-property next_action state
  const [awaitApprovalIds, setAwaitApprovalIds] = useState<Set<number>>(() => new Set());
  const [paymentHolds, setPaymentHolds] = useState<Record<number, string>>({}); // property_id -> expires_at (RFC3339)
  const [tick, setTick] = useState(0); // force rerender each second for countdown
  const [openChatFor, setOpenChatFor] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function timeLeft(expiresAt?: string | null): string | null {
    if (!expiresAt) return null;
    const end = new Date(expiresAt).getTime();
    const now = Date.now();
    const ms = Math.max(0, end - now);
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <ul className="grid gap-2">
      {items.map((p) => {
        const holdExpiresAt = paymentHolds[p.id];
        const holdLeft = timeLeft(holdExpiresAt);
        const awaiting = awaitApprovalIds.has(p.id);

        return (
          <li key={p.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-baseline justify-between">
              <strong className="text-sm">{p.title}</strong>
              <span className="text-sm text-gray-700">${(p.price_cents / 100).toFixed(2)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              ID: {p.id} {p.requires_approval ? "• requires approval" : ""}
            </div>

            {awaiting && (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Awaiting host approval
              </div>
            )}
            {!!holdExpiresAt && (
              <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                Payment hold active — expires in {holdLeft}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenChatFor(openChatFor === p.id ? null : p.id)}
                className="rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {openChatFor === p.id ? "Close chat" : "Message host"}
              </button>
            </div>

            {openChatFor === p.id && (
              <div className="mt-3">
                <ChatPanel propertyId={p.id} />
              </div>
            )}

            {canBook && (
              <form
                className="mt-3 grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const fd = new FormData(form);
                  const start = String(fd.get("start_date") || "");
                  const end = String(fd.get("end_date") || "");
                  if (!start || !end) {
                    window.alert("Please select start and end dates");
                    return;
                  }
                  try {
                    const res: BookingCreateResponse = await createBooking({
                      property_id: p.id,
                      start_date: start,
                      end_date: end,
                    });
                    if (res.next_action.type === "await_approval") {
                      setAwaitApprovalIds((prev) => new Set([...prev, p.id]));
                      window.alert("Request submitted. Awaiting host approval.");
                    } else if (isPayAction(res.next_action)) {
                      const pay = res.next_action;
                      setPaymentHolds((prev) => ({ ...prev, [p.id]: pay.expires_at }));
                      setAwaitApprovalIds((prev) => {
                        const n = new Set(prev);
                        n.delete(p.id);
                        return n;
                      });
                      window.alert("Booking pending payment. Hold created.");
                    }
                    form?.reset();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Failed to create booking";
                    window.alert(msg);
                  }
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="start_date"
                    type="date"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                  <input
                    name="end_date"
                    type="date"
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Request to book
                  </button>
                </div>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
