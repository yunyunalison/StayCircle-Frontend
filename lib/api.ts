/**
 * Thin API client used by the Next.js frontend to talk to the FastAPI backend.
 * - Reads the JWT from local storage (via ./auth) and attaches it as a Bearer token when present
 * - Throws on non-2xx responses with a helpful error message
 * - Avoids caching for GETs that should reflect fresh server state
 */
import { getToken, saveAuth } from "./auth";
import type { User, Role } from "./auth";
/**
 * Server-side property shape exposed by the API.
 * Keep in sync with backend/app/schemas.py: PropertyRead
 */
export interface Property {
  id: number;
  title: string;
  price_cents: number;
  requires_approval?: boolean;
}

/**
 * Payload for creating a property listing.
 * Keep in sync with backend/app/schemas.py: PropertyCreate
 */
export interface PropertyCreate {
  title: string;
  price_cents: number;
  requires_approval?: boolean;
}

/**
 * Base URL of the API gateway. Configurable via NEXT_PUBLIC_API_BASE_URL at build/runtime.
 * Defaults to http://localhost:8000 for local development.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * List properties.
 * - If the caller is a landlord (token present), the backend returns only their listings.
 * - Otherwise returns all listings.
 */
export async function listProperties(): Promise<Property[]> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/properties`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`Failed to list properties: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Create a property listing as the authenticated landlord.
 */
export async function createProperty(data: PropertyCreate): Promise<Property> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/properties`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create property: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Signup request payload.
 * role defaults to "tenant" if omitted.
 */
export interface SignupPayload {
  email: string;
  password: string;
  role?: Role; // "landlord" | "tenant" (defaults to "tenant" if omitted)
}

/**
 * Login request payload.
 */
export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Token response envelope from the auth endpoints.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/**
 * Register a new user account and persist auth to local storage on success.
 */
export async function signup(payload: SignupPayload): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to signup: ${res.status} ${res.statusText} ${text}`);
  }
  const data: TokenResponse = await res.json();
  saveAuth({ token: data.access_token, user: data.user });
  return data;
}

/**
 * Authenticate a user and persist auth to local storage on success.
 */
export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to login: ${res.status} ${res.statusText} ${text}`);
  }
  const data: TokenResponse = await res.json();
  saveAuth({ token: data.access_token, user: data.user });
  return data;
}

/* =========================
   Bookings API
   ========================= */

export interface Booking {
  id: number;
  property_id: number;
  guest_id: number;
  start_date: string; // "YYYY-MM-DD"
  end_date: string;   // "YYYY-MM-DD"
  status: "requested" | "pending_payment" | "confirmed" | "cancelled" | "cancelled_expired" | "declined";
  total_cents: number;
  currency: string; // e.g. "USD"
  expires_at?: string | null; // RFC3339
  cancel_reason?: string | null;
}

export interface BookingCreate {
  property_id: number;
  start_date: string; // "YYYY-MM-DD"
  end_date: string;   // "YYYY-MM-DD"
}

export type NextAction =
  | { type: "await_approval" }
  | { type: "pay"; expires_at: string; client_secret: string };

export interface BookingCreateResponse {
  booking: Booking;
  next_action: NextAction;
}

/* =========================
   Payments
   ========================= */

/**
 * Payment intent details used by Stripe's PaymentElement on the client.
 * Keep in sync with backend/app/schemas.py: PaymentInfoResponse
 */
export interface PaymentInfoResponse {
  booking_id: number;
  client_secret: string;
  expires_at: string; // RFC3339
}

/**
 * Ensure a PaymentIntent exists for a pending-payment booking and fetch its client_secret.
 */
export async function getPaymentInfo(bookingId: number): Promise<PaymentInfoResponse> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}/payment_info`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get payment info: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Create a booking.
 * Next action returned by the backend is either:
 * - { type: "await_approval" } when the listing requires landlord approval
 * - { type: "pay", expires_at, client_secret } when the user should proceed to payment
 */
export async function createBooking(data: BookingCreate): Promise<BookingCreateResponse> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create booking: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * List bookings that involve the current user.
 * - Tenants see their own bookings
 * - Landlords see bookings for their listings
 */
export async function listMyBookings(params?: { limit?: number; offset?: number }): Promise<Booking[]> {
  const token = getToken();
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE}/api/v1/bookings/me${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to list bookings: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Cancel a booking the user owns (tenant) or that belongs to their listing (landlord).
 * Idempotent on the server side.
 */
export async function cancelBooking(bookingId: number): Promise<Booking> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to cancel booking: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Approve a requested booking (landlord only), moving it to pending_payment.
 */
export async function approveBooking(bookingId: number): Promise<Booking> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to approve booking: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Decline a requested booking (landlord only).
 */
export async function declineBooking(bookingId: number): Promise<Booking> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}/decline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to decline booking: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Finalize a booking after client-side payment confirmation when webhooks are unavailable.
 * The server may respond with the updated Booking or a { status: "processing" | "ok" } object.
 */
export async function finalizePayment(bookingId: number): Promise<Booking | { status: string }> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}/finalize_payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to finalize payment: ${res.status} ${res.statusText} ${text}`);
  }
  // Server may return the updated booking or a status object.
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return { status: "ok" };
}

/* =========================
   Chat
   ========================= */

/**
 * Chat message shape returned by the history endpoint and WS messages.
 */
export interface ChatMessage {
  id: number;
  property_id: number;
  sender_id: number;
  text: string;
  created_at: string; // RFC3339
}

/**
 * Fetch chat history for a property.
 * - since_id enables forward-only pagination with stable ordering
 */
export async function listMessagesHistory(propertyId: number, opts?: { limit?: number; since_id?: number }): Promise<ChatMessage[]> {
  const token = getToken();
  const qs = new URLSearchParams();
  qs.set("property_id", String(propertyId));
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.since_id != null) qs.set("since_id", String(opts.since_id));
  const res = await fetch(`${API_BASE}/api/v1/messages?${qs.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load messages: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

/**
 * Build the WebSocket URL for the chat endpoint given API_BASE and a JWT.
 * Mapping:
 * - http:// -> ws://
 * - https:// -> wss://
 */
export function buildChatWsUrl(propertyId: number, token: string): string {
  let base = API_BASE;
  if (base.startsWith("https://")) {
    base = "wss://" + base.slice("https://".length);
  } else if (base.startsWith("http://")) {
    base = "ws://" + base.slice("http://".length);
  } else if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
    // Assume http-like and map to ws
    base = "ws://" + base;
  }
  const url = `${base}/ws/chat/property/${propertyId}?token=${encodeURIComponent(token)}`;
  return url;
}
