"use client";

import { useEffect, useRef, useState } from "react";
import AssistantMessage from "./assistant-message";

type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
};

type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
};

const api = (path: string) => `/api${path}`;

export default function Chat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadThreads() {
    const res = await fetch(api("/threads"));
    const data = await res.json();
    setThreads(data.threads ?? []);
  }

  async function createThread() {
    const res = await fetch(api("/threads"), { method: "POST" });
    const data = await res.json();
    await loadThreads();
    selectThread(data.thread.id);
  }

  async function selectThread(id: string) {
    setActiveThread(id);
    const res = await fetch(api(`/threads/${id}`));
    const data = await res.json();
    setMessages(data.thread?.messages ?? []);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeThread || loading) return;

    const text = input.trim();
    setInput("");
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: "temp-user",
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);

    const res = await fetch(api("/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: activeThread, message: text }),
    });

    const reply = await res.text();

    setMessages((prev) => [
      ...prev,
      {
        id: "temp-assistant",
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      },
    ]);

    await selectThread(activeThread);
    setLoading(false);
  }

  async function deleteThread(id: string) {
    await fetch(api(`/threads/${id}`), { method: "DELETE" });
    if (activeThread === id) {
      setActiveThread(null);
      setMessages([]);
    }
    await loadThreads();
  }

  return (
    <>
      <aside
        style={{
          width: 260,
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          background: "#f9fafb",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={createThread}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#111827",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            + New chat
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => selectThread(t.id)}
              style={{
                padding: 12,
                borderRadius: 6,
                cursor: "pointer",
                background: activeThread === t.id ? "#e5e7eb" : "transparent",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteThread(t.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {!activeThread && (
            <div style={{ color: "#6b7280", textAlign: "center", marginTop: 100 }}>
              Select or create a chat to start planning your trip.
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 16,
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: m.role === "user" ? "#111827" : "#f3f4f6",
                  color: m.role === "user" ? "white" : "#111827",
                }}
              >
                <AssistantMessage content={m.content} />
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {activeThread && (
          <form
            onSubmit={sendMessage}
            style={{
              padding: 16,
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              gap: 12,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Plan a trip to Paris..."
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 18px",
                background: "#111827",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "..." : "Send"}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
