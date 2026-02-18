/**
 * ChatPanel
 * Client-side chat UI for a single property.
 *
 * Responsibilities:
 * - Load initial history via HTTP (listMessagesHistory)
 * - Maintain a resilient WebSocket connection with exponential backoff
 * - Render live messages and a simple input with optimistic append
 * - De-duplicate incoming messages by id to avoid double-renders
 *
 * Business rules (authz, rate limiting, persistence) live on the server.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuth, getToken } from "../lib/auth";
import {
  ChatMessage,
  buildChatWsUrl,
  listMessagesHistory,
} from "../lib/api";

/**
 * Component props.
 */
type Props = {
  propertyId: number;
};

/**
 * Connection state indicator for the WS session.
 */
type ConnState = "disconnected" | "connecting" | "connected" | "error";

/**
 * Renders the chat transcript and input for a given property.
 */
export default function ChatPanel({ propertyId }: Props) {
  const auth = getAuth();
  const token = getToken();
  const [connState, setConnState] = useState<ConnState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectingRef = useRef(false);

  const canSend = useMemo(() => {
    const t = input.trim();
    return t.length > 0 && t.length <= 1000 && connState === "connected";
  }, [input, connState]);

  // Auto-scroll to bottom whenever new messages arrive
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  // Fetch recent chat history on mount (or when property changes)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const hist = await listMessagesHistory(propertyId, { limit: 50 });
        if (!mounted) return;
        setMessages(hist);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : "Failed to load messages";
        setError(msg);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [propertyId]);

  /**
   * Establish a WebSocket connection and wire event handlers.
   * Uses exponential backoff reconnect (capped) on disconnects.
   */
  const connect = useCallback(() => {
    if (!token || connectingRef.current) return;
    connectingRef.current = true;
    setConnState("connecting");
    setError(null);

    const url = buildChatWsUrl(propertyId, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      connectingRef.current = false;
      setConnState("connected");
      setError(null);
    };

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(String(evt.data));
        if (data && typeof data === "object" && data.type === "error") {
            // Server-provided error frame (e.g., auth/ratelimit). Do not close the socket automatically.
          setError(`${data.code}: ${data.message}`);
          return;
        }
        // Expect a ChatMessage payload (from WS or Redis fan-out)
        const msg = data as ChatMessage;
        if (
          typeof msg.id === "number" &&
          typeof msg.property_id === "number" &&
          typeof msg.sender_id === "number" &&
          typeof msg.text === "string"
        ) {
          setMessages((prev) => {
            // De-dup by id
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      connectingRef.current = false;
      setConnState("disconnected");
      // Exponential backoff reconnect (capped at 5s)
      const attempt = (reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1);
      const timeout = Math.min(5000, 300 * attempt);
      setTimeout(() => {
        if (token) connect();
      }, timeout);
    };

    ws.onerror = () => {
      connectingRef.current = false;
      setConnState("error");
      setError("WebSocket error");
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [propertyId, token]);

  // Connect on mount or when token changes
  useEffect(() => {
    if (!token) return;
    connect();
    return () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, [connect, token]);

  /**
   * Send a message over the active WS connection.
   * Performs light client-side validation and optimistic append with a temp id.
   */
  const send = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!wsRef.current || connState !== "connected") return;
      const text = input.trim();
      if (text.length < 1 || text.length > 1000) {
        setError("Message must be 1..1000 characters");
        return;
      }
      // Optimistic append (temporary negative id ensures it won't clash with server-issued ids)
      const tmpId = -Date.now();
      const optimistic: ChatMessage = {
        id: tmpId,
        property_id: propertyId,
        sender_id: auth?.user?.id ?? 0,
        text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput("");

      try {
        wsRef.current.send(JSON.stringify({ text }));
      } catch {
        setError("Failed to send message");
      }
    },
    [connState, input, propertyId, auth]
  );

  // Guard: require a logged-in user with a JWT before exposing the chat UI
  if (!auth || !token) {
    return (
      <div className="rounded-md border border-gray-300 bg-white p-3 text-sm">
        <p className="text-gray-700">Please log in to chat with the host.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-300 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-block h-2 w-2 rounded-full " +
              (connState === "connected"
                ? "bg-emerald-500"
                : connState === "connecting"
                ? "bg-amber-500"
                : "bg-gray-400")
            }
            title={connState}
          />
          <span className="text-sm font-medium text-gray-800">Chat</span>
        </div>
        <div className="text-xs text-gray-500">Property #{propertyId}</div>
      </div>

      {error && <div className="px-3 py-2 text-xs text-red-600">{error}</div>}

      <div ref={scrollerRef} className="h-64 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500">No messages yet.</div>
        ) : (
          <ul className="space-y-1">
            {messages.map((m) => {
              const isSelf = m.sender_id === (auth?.user?.id ?? 0);
              const temp = m.id < 0;
              return (
                <li key={`${m.id}-${m.created_at}`} className={"flex " + (isSelf ? "justify-end" : "justify-start")}>
                  <div
                    className={
                      "max-w-[75%] rounded px-2 py-1 text-sm " +
                      (isSelf ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900")
                    }
                    title={new Date(m.created_at).toLocaleString()}
                  >
                    <span>{m.text}</span>
                    {temp && <span className="ml-2 opacity-70">(sending...)</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-gray-200 px-3 py-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Type a message"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
