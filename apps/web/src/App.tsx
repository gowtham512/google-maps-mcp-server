import { useEffect, useRef, useState } from "react"
import { Loader2, LogOut, MapPin, Menu, MessageSquarePlus, Send, Trash2, X } from "lucide-react"

import { LoginPage } from "@/components/LoginPage"
import { SignupPage } from "@/components/SignupPage"
import { OpenUIMessage } from "@/components/OpenUIMessage"
import { ToolCallPanel } from "@/components/ToolCallPanel"
import {
  createThread,
  deleteThread,
  getThread,
  getToken,
  listThreads,
  logout,
  sendMessageStream,
  updateThread,
  type Message,
  type StreamEvent,
  type Thread,
  type ToolCall,
} from "@/lib/api"

type AuthView = "login" | "signup"

export default function App() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getToken())
  const [authView, setAuthView] = useState<AuthView>("login")

  // ── Chat state ───────────────────────────────────────────────────────────
  const [threads, setThreads]           = useState<Thread[]>([])
  // Initialise activeThreadId from URL: /chat/<thread_id>
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/\/chat\/([^/]+)/)
    return match ? match[1] : null
  })
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState("")
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef       = useRef<AbortController | null>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  // ── Effects — ALL hooks must come before any conditional return ──────────
  useEffect(() => {
    if (isAuthenticated) loadThreads()
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    if (activeThreadId) {
      loadThread(activeThreadId)
    } else {
      setMessages([])
    }
  }, [activeThreadId, isAuthenticated])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // Auto-dismiss error toast after 5s
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  // Sync activeThreadId → URL
  useEffect(() => {
    const current = window.location.pathname
    const target  = activeThreadId ? `/chat/${activeThreadId}` : "/"
    if (current !== target) {
      window.history.pushState(null, "", target)
    }
  }, [activeThreadId])

  // Handle browser back/forward
  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/\/chat\/([^/]+)/)
      setActiveThreadId(match ? match[1] : null)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  // ── Auth handlers ────────────────────────────────────────────────────────
  function handleAuthSuccess() {
    setIsAuthenticated(true)
  }

  function handleLogout() {
    logout()
    setIsAuthenticated(false)
    setThreads([])
    setActiveThreadId(null)
    setMessages([])
  }

  // ── Thread / message loaders ─────────────────────────────────────────────
  async function loadThreads() {
    try {
      setError(null)
      const data = await listThreads()
      setThreads(data)
    } catch (err) {
      setError("Failed to load threads")
      console.error(err)
    }
  }

  async function handleNewThread() {
    try {
      setError(null)
      const thread = await createThread()
      setThreads((prev) => [thread, ...prev])
      setActiveThreadId(thread.id)
      setSidebarOpen(false)
    } catch (err) {
      setError("Failed to create thread")
      console.error(err)
    }
  }

  /** Rename a thread from its first user message (first 40 chars, trimmed). */
  async function autoTitleThread(threadId: string, firstMessage: string) {
    try {
      const title = firstMessage.trim().slice(0, 40) || "New Chat"
      const updated = await updateThread(threadId, title)
      setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, title: updated.title } : t))
    } catch {
      // Non-critical — silently ignore
    }
  }

  async function handleDeleteThread(e: React.MouseEvent<HTMLButtonElement>, threadId: string) {
    e.stopPropagation()
    try {
      await deleteThread(threadId)
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (activeThreadId === threadId) {
        setActiveThreadId(null)
        setMessages([])
      }
    } catch (err) {
      setError("Failed to delete thread")
      console.error(err)
    }
  }

  function selectThread(threadId: string) {
    setActiveThreadId(threadId)
    setSidebarOpen(false)
  }

  function updateLastAssistant(msgs: Message[], updater: (m: Message) => Message): Message[] {
    const idx = msgs.findLastIndex((m) => m.role === "assistant")
    if (idx === -1) return msgs
    return msgs.map((m, i) => (i === idx ? updater({ ...m }) : m))
  }

  function hydrateTools(loaded: Message[]): Message[] {
    const result: Message[] = []

    // Filter out system messages — they should never render
    const messages = loaded.filter((m) => m.role !== "system")

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push(msg)
        continue
      }

      if (msg.role === "assistant") {
        // tool_calls already contains enriched {id, name, input, result, status} objects
        const tools: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
          id:     tc.id     || tc.name || `tool_${result.length}`,
          name:   tc.name   || "tool",
          input:  tc.input  ? (typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)) : undefined,
          result: tc.result ?? undefined,
          status: (tc.status === "done" ? "done" : "running") as "done" | "running",
        }))
        result.push({ ...msg, tools })
        continue
      }

      // Skip any legacy tool/system rows that may exist from old data
    }

    return result
  }

  async function loadThread(threadId: string) {
    try {
      setError(null)
      const data = await getThread(threadId)
      setMessages(hydrateTools(data.messages))
    } catch (err) {
      setError("Failed to load thread")
      console.error(err)
    }
  }

  /** Fetch the DB id of the latest assistant message and merge it into the
   *  currently rendered assistant bubble — so downloads work without a full
   *  reload that would remount the OpenUI renderer and cause a flicker. */
  async function mergeLatestAssistantId(threadId: string) {
    try {
      const data = await getThread(threadId)
      const hydrated = hydrateTools(data.messages)
      const lastDbAssistant = [...hydrated].reverse().find((m) => m.role === "assistant")
      if (!lastDbAssistant?.id) return
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant")
        if (idx === -1) return prev
        return prev.map((m, i) =>
          i === idx
            ? {
                ...m,
                id: lastDbAssistant.id,
                // Prefer DB-authoritative field but keep the already-rendered UI
                openui_code:   m.openui_code   ?? lastDbAssistant.openui_code,
              }
            : m,
        )
      })
    } catch (err) {
      console.error("Failed to merge assistant id:", err)
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !activeThreadId || loading) return

    const userMessage = input.trim()
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    setLoading(true)
    setError(null)

    // Auto-title the thread from the first user message (optimistic + persisted)
    const currentThread = threads.find((t) => t.id === activeThreadId)
    const isFirstMessage = !currentThread || currentThread.title === "New Chat"
    if (isFirstMessage && activeThreadId) {
      const optimisticTitle = userMessage.trim().slice(0, 40) || "New Chat"
      // Update local state immediately so the sidebar doesn't flash "New Chat"
      setThreads((prev) => prev.map((t) => (t.id === activeThreadId ? { ...t, title: optimisticTitle } : t)))
      autoTitleThread(activeThreadId, userMessage)
    }

    abortRef.current?.abort()
    const controller   = new AbortController()
    abortRef.current   = controller

    setMessages((prev) => [
      ...prev,
      { role: "user",      content: userMessage, created_at: new Date().toISOString() },
      { role: "assistant", content: "",  tools: [], created_at: new Date().toISOString() },
    ])

    try {
      await sendMessageStream(
        activeThreadId,
        userMessage,
        (event: StreamEvent) => {
          if (event.type === "content" && event.delta != null) {
            setMessages((prev) =>
              updateLastAssistant(prev, (m) => ({ ...m, content: (m.content || "") + event.delta })),
            )
          } else if (event.type === "tool_call" && event.name) {
            const { name: toolName, id, input: toolInput } = event
            const toolId = id || toolName!
            setMessages((prev) =>
              updateLastAssistant(prev, (m) => {
                const tools = m.tools ? [...m.tools] : []
                if (!tools.find((t) => (t.id || t.name) === toolId && t.status === "running"))
                  tools.push({ id: toolId, name: toolName!, input: toolInput, status: "running" })
                return { ...m, tools }
              }),
            )
          } else if (event.type === "tool_result" && event.name) {
            const { name: toolName, id, result: toolResult } = event
            const toolId = id || toolName!
            setMessages((prev) =>
              updateLastAssistant(prev, (m) => {
                const tools = [...(m.tools || [])]
                const idx   = tools.findIndex((t) => (t.id || t.name) === toolId)
                if (idx !== -1) tools[idx] = { ...tools[idx], id: toolId, name: toolName!, result: toolResult, status: "done" }
                else            tools.push({ id: toolId, name: toolName!, result: toolResult, status: "done" })
                return { ...m, tools }
              }),
            )
          } else if (event.type === "done") {
            setMessages((prev) =>
              updateLastAssistant(prev, (m) => ({
                ...m,
                openui_code:   event.openui_code   ?? null,
                content: event.openui_code ? event.reply || m.content : m.content,
                // Mark every tool as done — stream is complete
                tools: (m.tools || []).map((t) => t.status === "running" ? { ...t, status: "done" as const } : t),
              })),
            )
          }
        },
        controller.signal,
      )

      // Merge the DB id into the rendered bubble (enables downloads) without a
      // full reload/remount, and refresh the sidebar thread list.
      await mergeLatestAssistantId(activeThreadId)
      await loadThreads()
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Failed to send message")
        console.error(err)
        // Remove the dangling empty assistant placeholder so the user isn't
        // left staring at an empty bubble.
        setMessages((prev) => {
          const idx = prev.findLastIndex((m) => m.role === "assistant")
          if (idx === -1) return prev
          const last = prev[idx]
          const isEmpty = !last.content && !last.openui_code && !(last.tools && last.tools.length)
          return isEmpty ? prev.filter((_, i) => i !== idx) : prev
        })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  // ── Conditional auth render — AFTER all hooks ────────────────────────────
  if (!isAuthenticated) {
    if (authView === "signup") {
      return (
        <SignupPage
          onSuccess={handleAuthSuccess}
          onSwitchToLogin={() => setAuthView("login")}
        />
      )
    }
    return (
      <LoginPage
        onSuccess={handleAuthSuccess}
        onSwitchToSignup={() => setAuthView("signup")}
      />
    )
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeThread     = threads.find((t) => t.id === activeThreadId)

  const SUGGESTIONS = [
    { icon: "🗼", text: "Plan a 3-day trip to Paris" },
    { icon: "🏯", text: "Best places to visit in Tokyo" },
    { icon: "🌊", text: "Beach resorts near Bali" },
    { icon: "🗺️", text: "Route from Rome to Amalfi Coast" },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col sidebar-glass transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>

        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight">TripGenius</span>
          </div>
          <button className="md:hidden h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New chat */}
        <div className="p-3 shrink-0">
          <button onClick={handleNewThread} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md shadow-primary/20">
            <MessageSquarePlus className="h-4 w-4" />
            New Trip Chat
          </button>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <MapPin className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No trips yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Start planning your first adventure</p>
            </div>
          ) : (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Recent</p>
              {threads.map((thread) => (
                <div key={thread.id} onClick={() => selectThread(thread.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${activeThreadId === thread.id ? "bg-primary/10 text-primary" : "hover:bg-muted/70 text-foreground"}`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${activeThreadId === thread.id ? "bg-primary" : "bg-muted-foreground/30"}`} />
                  <span className="flex-1 truncate text-sm font-medium">{thread.title}</span>
                  <button
                    className="h-6 w-6 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0 transition-all"
                    onClick={(e) => handleDeleteThread(e, thread.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-border/60 shrink-0">
          <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all text-sm font-medium">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-background/95 shrink-0">
          <button className="md:hidden h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {activeThread ? (
              <>
                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <h1 className="font-semibold text-sm truncate">{activeThread.title}</h1>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <h1 className="font-semibold text-sm">TripGenius</h1>
              </>
            )}
          </div>
        </header>

        {activeThreadId ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <MapPin className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Where to next?</h2>
                    <p className="text-muted-foreground text-sm max-w-xs">Ask me to plan a trip, find places, check weather, or build a route.</p>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1
                  const isStreaming     = loading && isLastAssistant

                  // Skip bare tool/system messages — merged into assistant bubble
                  if (msg.role === "tool" || msg.role === "system") return null

                  // While streaming, the model emits raw openui-lang DSL as
                  // plain text. Hide that from the user until the final
                  // rendered component is ready.
                  const raw = msg.content || ""
                  const looksLikeCode =
                    /(^|\n)\s*\w+\s*=\s*(Stack|Card|CardHeader|TextContent|Table|Tabs|Steps|List|MarkDownRenderer)\(/.test(raw)
                  const hideStreamingCode = isStreaming && !msg.openui_code && looksLikeCode
                  const anyToolRunning = msg.tools?.some((t) => t.status === "running")

                  return (
                    <div key={msg.id ?? idx} className={`flex gap-2 sm:gap-3 msg-enter ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

                      {/* Assistant avatar */}
                      {msg.role === "assistant" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-1 shadow-md shadow-primary/20">
                          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
                        </div>
                      )}

                      <div className={`flex flex-col gap-2 min-w-0 ${msg.role === "user" ? "items-end max-w-[85%] sm:max-w-[80%]" : "items-start max-w-full sm:max-w-[85%] w-full"}`}>

                        {/* Tool call panel — ABOVE the content */}
                        {msg.role === "assistant" && msg.tools && msg.tools.length > 0 && (
                          <ToolCallPanel tools={msg.tools} isStreaming={isStreaming} />
                        )}

                        {/* Message bubble — only if there's something to show */}
                        {(msg.content || msg.openui_code || isStreaming) && (
                          <div className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm leading-relaxed shadow-sm w-full break-words ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card border border-border/60 rounded-bl-sm"
                          }`}>
                            {msg.role === "assistant" && msg.openui_code ? (
                              <OpenUIMessage code={msg.openui_code} />
                            ) : hideStreamingCode ? (
                              // Building the response — DSL is streaming but not ready
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                                <span className="typing-dot" />
                              </span>
                            ) : (
                              <div className="whitespace-pre-wrap break-words">
                                {raw || (
                                  isStreaming && !anyToolRunning ? (
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="typing-dot" />
                                      <span className="typing-dot" />
                                      <span className="typing-dot" />
                                    </span>
                                  ) : ""
                                )}
                              </div>
                            )}

                            {/* Generating status */}
                            {isStreaming && (
                              <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-xs">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {anyToolRunning
                                  ? `Using ${msg.tools!.find((t) => t.status === "running")?.name}…`
                                  : hideStreamingCode
                                    ? "Building your itinerary…"
                                    : "Generating…"}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* User avatar */}
                      {msg.role === "user" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-muted border border-border/60 flex items-center justify-center shrink-0 mt-1 text-xs font-bold text-muted-foreground">
                          U
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border/60 bg-background px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
              <form onSubmit={handleSend} className="max-w-3xl mx-auto">
                <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card shadow-sm px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
                    placeholder="Plan a trip, find restaurants, calculate routes… (Enter to send)"
                    disabled={loading}
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 py-1.5 leading-relaxed max-h-40 overflow-y-auto"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-primary/20 mb-0.5"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          /* Welcome */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
            <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
              <MapPin className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">TripGenius</h2>
            <p className="text-muted-foreground text-center max-w-sm mb-10">
              Plan trips, explore destinations, and get real-time insights — all in one place.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mb-8">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={async () => {
                    const thread = await createThread()
                    setThreads((prev) => [thread, ...prev])
                    setActiveThreadId(thread.id)
                    setInput(s.text)
                  }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-border/70 bg-card hover:bg-muted/50 hover:border-primary/30 active:scale-[0.98] transition-all text-left text-sm font-medium shadow-sm"
                >
                  <span className="text-xl shrink-0">{s.icon}</span>
                  <span className="text-muted-foreground">{s.text}</span>
                </button>
              ))}
            </div>

            <button onClick={handleNewThread} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/25">
              <MessageSquarePlus className="h-4 w-4" />
              Start a new chat
            </button>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="fixed sm:absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-destructive text-destructive-foreground px-4 py-3 rounded-2xl text-sm max-w-[92%] shadow-xl animate-fade-up">
            <span className="flex-1">⚠ {error}</span>
            <button
              onClick={() => setError(null)}
              className="h-6 w-6 rounded-lg hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
