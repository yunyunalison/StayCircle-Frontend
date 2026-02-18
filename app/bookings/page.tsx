/**
 * My Bookings page
 * - Lists bookings for the current user
 * - Tenants can pay or cancel
 * - Landlords can approve/decline requests
 * - Integrates Stripe via a lightweight modal when payment is required
 */
"use client";

import { useEffect, useState } from "react";
import { listMyBookings, cancelBooking, approveBooking, declineBooking, getPaymentInfo, type Booking } from "../../lib/api";
import { getAuth } from "../../lib/auth";
import BookingPaymentModal from "../../components/BookingPaymentModal";

type Chip = { text: string; className: string };

/**
 * Map a booking status to a small visual chip.
 */
function chipForStatus(status: Booking["status"]): Chip {
  switch (status) {
    case "requested":
      return { text: "pending approval", className: "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800" };
    case "pending_payment":
      return { text: "pending payment", className: "rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800" };
    case "confirmed":
      return { text: "confirmed", className: "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700" };
    case "cancelled":
      return { text: "cancelled", className: "rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700" };
    case "cancelled_expired":
      return { text: "expired", className: "rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700" };
    case "declined":
      return { text: "declined", className: "rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700" };
    default:
      return { text: status, className: "rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700" };
  }
}

/**
 * True if the booking can still be cancelled by the actor.
 * Non-terminal states only.
 */
function isCancellable(status: Booking["status"]): boolean {
  // Allow cancel while non-terminal
  return status === "requested" || status === "pending_payment" || status === "confirmed";
}

/**
 * Ticks once per second; useful for countdown UI updates.
 */
function useSecondTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

/**
 * Format an RFC3339 expiry into a mm:ss countdown.
 */
function countdown(expires_at?: string | null): string | null {
  if (!expires_at) return null;
  const end = new Date(expires_at).getTime();
  const now = Date.now();
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  const ms = Math.max(0, end - now - EIGHT_HOURS);
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Render bookings for the current session and surface context-appropriate actions.
 */
export default function MyBookingsPage() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean>(false);
  const [isLandlord, setIsLandlord] = useState<boolean>(false);
  const tick = useSecondTicker();
  const [paymentModal, setPaymentModal] = useState<{ bookingId: number; clientSecret: string; expiresAt: string } | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listMyBookings({ limit: 50, offset: 0 });
      setItems(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load bookings";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const a = getAuth();
    setAuthed(!!a);
    setIsLandlord(!!a && a.user?.role === "landlord");
    refresh();
  }, []);

  async function onApprove(id: number) {
    try {
      const updated = await approveBooking(id);
      setItems((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to approve booking";
      alert(message);
    }
  }

  async function onDecline(id: number) {
    try {
      const updated = await declineBooking(id);
      setItems((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to decline booking";
      alert(message);
    }
  }

  async function onCancel(id: number) {
    try {
      const updated = await cancelBooking(id);
      setItems((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel booking";
      alert(message);
    }
  }

  async function onPay(booking: Booking) {
    try {
      const info = await getPaymentInfo(booking.id);
      setPaymentModal({ bookingId: booking.id, clientSecret: info.client_secret, expiresAt: info.expires_at });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to initialize payment";
      alert(message);
    }
  }

  // Guard: require authentication to see personal bookings
  if (!authed) {
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-6">
      {paymentModal && (
        <BookingPaymentModal
          bookingId={paymentModal.bookingId}
          clientSecret={paymentModal.clientSecret}
          expiresAt={paymentModal.expiresAt}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => {
            setPaymentModal(null);
            refresh();
          }}
        />
      )}
        <h1 className="mb-4 text-2xl font-semibold">My bookings</h1>
        <p className="text-sm text-gray-600">Please sign in to view your bookings.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      {paymentModal && (
        <BookingPaymentModal
          bookingId={paymentModal.bookingId}
          clientSecret={paymentModal.clientSecret}
          expiresAt={paymentModal.expiresAt}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => {
            setPaymentModal(null);
            refresh();
          }}
        />
      )}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My bookings</h1>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

      {loading ? (
        <p className="text-sm text-gray-600">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-600">No bookings found.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((b) => {
            const chip = chipForStatus(b.status);
            const showCountdown = b.status === "pending_payment" && b.expires_at;
            const left = countdown(b.expires_at);
            return (
              <li key={b.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div>
                      Property ID: <span className="font-medium">{b.property_id}</span>
                    </div>
                    <div className="text-gray-700">
                      {b.start_date} → {b.end_date}
                    </div>
                    <div className="text-xs text-gray-500">Booking ID: {b.id}</div>
                    {showCountdown && (
                      <div className="mt-1 text-xs text-indigo-700">
                        Hold expires in {left}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={chip.className}>{chip.text}</span>
                    {isLandlord && b.status === "requested" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onApprove(b.id)}
                          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecline(b.id)}
                          className="rounded-md border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {!isLandlord && b.status === "pending_payment" && (
                      <button
                        type="button"
                        onClick={() => onPay(b)}
                        className="rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Pay
                      </button>
                    )}
                    {isCancellable(b.status) && (
                      <button
                        type="button"
                        onClick={() => onCancel(b.id)}
                        className="rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
