/**
 * BookingPaymentModal renders Stripe's PaymentElement inside a modal dialog.
 * - Shows a countdown for the booking hold window
 * - Confirms payment client-side, then triggers server-side finalize
 * This component only handles UI/flow; business rules live on the server.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { finalizePayment } from "../lib/api";

/**
 * Props supplied by the booking page when invoking the modal.
 */
type Props = {
  bookingId: number;
  clientSecret: string;
  expiresAt: string; // RFC3339
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Derive a mm:ss countdown string and an 'expired' boolean from an RFC3339 timestamp.
 */
function useCountdown(expiresAt: string) {
  const [left, setLeft] = useState<string>(() => {
    const end = new Date(expiresAt).getTime();
    const now = Date.now();
    const ms = Math.max(0, end - now);
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  });
  const [expired, setExpired] = useState<boolean>(() => Date.now() >= new Date(expiresAt).getTime());

  useEffect(() => {
    // Tick once per second to update the remaining hold time and whether it has expired
    const id = setInterval(() => {
      const end = new Date(expiresAt).getTime();
      const now = Date.now();
      const ms = Math.max(0, end - now);
      const sec = Math.floor(ms / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setLeft(`${m}:${s.toString().padStart(2, "0")}`);
      setExpired(now >= end);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { left, expired };
}

/**
 * Renders the PaymentElement and handles client-side confirmation.
 * Expects Stripe Elements context to be provided by <Elements>.
 */
function InnerPayment({ bookingId, expiresAt, onClose, onSuccess }: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const { left, expired } = useCountdown(expiresAt);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementReady, setElementReady] = useState(false);

  /**
   * Submit PaymentElement fields, confirm the PaymentIntent, and ask the API to finalize.
   * Any non-fatal API errors after confirmation simply cause the UI to refresh state.
   */
  async function onConfirm() {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Payment failed.");
        setProcessing(false);
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "Payment failed.");
        setProcessing(false);
        return;
      }
      // If no error returned, treat as success (succeeded or requires_action handled without redirect)
      try {
        await finalizePayment(bookingId);
      } catch {
        // Non-fatal; booking may still be processing. Refresh reflects latest.
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed.";
      setError(msg);
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-medium text-gray-900">Complete payment</h3>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
      <div className="mb-2 text-xs text-indigo-700">Hold expires in {left}</div>
      <div className="mb-3">
        <PaymentElement onReady={() => setElementReady(true)} />
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!stripe || !elements || !elementReady || processing || expired}
        className="inline-flex items-center rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {processing ? "Processing..." : expired ? "Expired" : "Pay"}
      </button>
    </div>
  );
}

/**
 * Wrap the inner payment form with Stripe's <Elements> using the provided clientSecret.
 */
export default function BookingPaymentModal({ bookingId, clientSecret, expiresAt, onClose, onSuccess }: Props) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  // Lazily initialize Stripe.js once a publishable key is available
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);

  // Developer ergonomics: surface a clear message when the publishable key is not configured
  if (!publishableKey) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-md">
          <p className="text-sm text-red-600">Stripe publishable key is missing.</p>
          <button onClick={onClose} className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md">
        {stripePromise && (
          <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
            <InnerPayment bookingId={bookingId} expiresAt={expiresAt} onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
