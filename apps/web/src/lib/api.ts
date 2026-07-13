const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api"

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

const TOKEN_KEY = "travel_planner_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** Returns Authorization header if a token is stored, otherwise empty object. */
function authHeader(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export interface AuthResponse {
  access_token: string
  token_type: string
  user_id: number
  email: string
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const resp = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || "Registration failed")
  }
  const data: AuthResponse = await resp.json()
  setToken(data.access_token)
  return data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || "Login failed")
  }
  const data: AuthResponse = await resp.json()
  setToken(data.access_token)
  return data
}

export function logout(): void {
  clearToken()
}

// ---------------------------------------------------------------------------
// Threads & Messages
// ---------------------------------------------------------------------------
export interface Thread {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id?: number
  role: string
  content: string | null
  tool_name?: string | null
  tool_call_id?: string | null
  tool_calls?: any[] | null
  openui_code?: string | null
  artifact_type?: string | null
  artifact_data?: string | null
  tools?: ToolCall[]
  thinking?: boolean
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
  artifact_type?: string | null
  artifact_data?: string | null
  tool_calls_used: string[]
}

export async function listThreads(): Promise<Thread[]> {
  const resp = await fetch(`${API_BASE}/threads`, {
    headers: { ...authHeader() },
  })
  if (!resp.ok) throw new Error("Failed to list threads")
  return resp.json()
}

export async function createThread(title = "New Chat"): Promise<Thread> {
  const resp = await fetch(`${API_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ title }),
  })
  if (!resp.ok) throw new Error("Failed to create thread")
  return resp.json()
}

export async function getThread(threadId: string): Promise<ThreadDetail> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}`, {
    headers: { ...authHeader() },
  })
  if (!resp.ok) throw new Error("Failed to get thread")
  return resp.json()
}

export async function deleteThread(threadId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}`, {
    method: "DELETE",
    headers: { ...authHeader() },
  })
  if (!resp.ok) throw new Error("Failed to delete thread")
}

export async function sendMessage(threadId: string, message: string): Promise<ChatResponse> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ message }),
  })
  if (!resp.ok) throw new Error("Failed to send message")
  return resp.json()
}

export interface ToolCall {
  id?: string
  name: string
  result?: string
  status: "running" | "done"
}

export interface StreamEvent {
  type: "content" | "thinking" | "tool_call" | "tool_result" | "done"
  id?: string
  delta?: string
  name?: string
  result?: string
  reply?: string
  openui_code?: string | null
  artifact_type?: string | null
  artifact_data?: string | null
  tool_calls_used?: string[]
}

export async function sendMessageStream(
  threadId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Accel-Buffering": "no",
      ...authHeader(),
    },
    body: JSON.stringify({ message }),
    signal,
  })
  if (!resp.ok) throw new Error("Failed to send message")
  if (!resp.body) throw new Error("No response body")

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventType = ""
  let eventData = ""

  function flushEvent() {
    if (eventType && eventData) {
      try {
        const payload = JSON.parse(eventData) as StreamEvent
        onEvent({ ...payload, type: eventType as StreamEvent["type"] })
      } catch {
        // ignore malformed events
      }
    }
    eventType = ""
    eventData = ""
  }

  function processChunk(chunk: string) {
    buffer += chunk
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("event:")) {
        if (eventType || eventData) flushEvent()
        eventType = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        // Accumulate multi-line data fields per SSE spec
        eventData = eventData ? eventData + "\n" + line.slice(5).trim() : line.slice(5).trim()
      } else if (line === "") {
        flushEvent()
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      processChunk(decoder.decode(value, { stream: true }))
    }
  } finally {
    // Flush any remaining bytes in the decoder and buffer.
    processChunk(decoder.decode())
    if (eventType && eventData) {
      flushEvent()
    }
    reader.releaseLock()
  }
}

export type ArtifactFormat = "json" | "pptx" | "pdf" | "auto"

export async function downloadArtifact(
  threadId: string,
  messageId: number,
  format: ArtifactFormat = "auto",
): Promise<void> {
  const resp = await fetch(
    `${API_BASE}/threads/${threadId}/messages/${messageId}/artifact?format=${format}`,
    { headers: { ...authHeader() } },
  )
  if (!resp.ok) {
    const body = await resp.text().catch(() => "")
    throw new Error(body || `Failed to download ${format}`)
  }

  const blob = await resp.blob()
  const contentDisposition = resp.headers.get("content-disposition")
  const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/)
  const filename = filenameMatch?.[1] || `artifact.${format === "auto" ? "download" : format}`

  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export async function downloadLatestArtifact(
  threadId: string,
  format: ArtifactFormat = "auto",
): Promise<void> {
  const resp = await fetch(
    `${API_BASE}/threads/${threadId}/artifact/latest?format=${format}`,
    { headers: { ...authHeader() } },
  )
  if (!resp.ok) {
    const body = await resp.text().catch(() => "")
    throw new Error(body || `Failed to download ${format}`)
  }

  const blob = await resp.blob()
  const contentDisposition = resp.headers.get("content-disposition")
  const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/)
  const filename = filenameMatch?.[1] || `artifact.${format === "auto" ? "download" : format}`

  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}