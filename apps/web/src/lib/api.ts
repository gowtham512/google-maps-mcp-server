const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api"

export interface Thread {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  role: string
  content: string | null
  tool_name?: string | null
  tool_calls?: any[] | null
  openui_code?: string | null
  created_at: string
}

export interface ThreadDetail {
  thread: Thread
  messages: Message[]
}

export interface ChatResponse {
  thread_id: string
  reply: string
  openui_code?: string | null
  tool_calls_used: string[]
}

export async function listThreads(): Promise<Thread[]> {
  const resp = await fetch(`${API_BASE}/threads`)
  if (!resp.ok) throw new Error("Failed to list threads")
  return resp.json()
}

export async function createThread(title = "New Chat"): Promise<Thread> {
  const resp = await fetch(`${API_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  if (!resp.ok) throw new Error("Failed to create thread")
  return resp.json()
}

export async function getThread(threadId: string): Promise<ThreadDetail> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}`)
  if (!resp.ok) throw new Error("Failed to get thread")
  return resp.json()
}

export async function deleteThread(threadId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}`, { method: "DELETE" })
  if (!resp.ok) throw new Error("Failed to delete thread")
}

export async function sendMessage(threadId: string, message: string): Promise<ChatResponse> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
  if (!resp.ok) throw new Error("Failed to send message")
  return resp.json()
}