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

    let i = 0
    while (i < messages.length) {
      const msg = messages[i]

      // User messages pass straight through
      if (msg.role === "user") {
        result.push(msg)
        i++
        continue
      }

      // Tool messages without a preceding assistant — skip (orphaned)
      if (msg.role === "tool") {
        i++
        continue
      }

      // Assistant message — collect ALL consecutive assistant+tool rounds
      // that belong to this single "turn" (until the next user message)
      if (msg.role === "assistant") {
        // The merged message will be built on the first assistant message
        const merged: Message = { ...msg, tools: [] }
        const allTools: ToolCall[] = []
        const pendingTools = new Map<string, ToolCall>()

        // Walk forward consuming assistant+tool rounds until next user msg
        let j = i
        while (j < messages.length && messages[j].role !== "user") {
          const cur = messages[j]

          if (cur.role === "assistant") {
            // If this is a later assistant message in the same turn (re-entry
            // after tools), absorb its content into the merged message
            if (j > i && cur.content) {
              merged.content = cur.content
            }
            // Absorb openui_code / artifacts from the final assistant message
            if (cur.openui_code)   merged.openui_code   = cur.openui_code
            if (cur.artifact_type) merged.artifact_type = cur.artifact_type
            if (cur.artifact_data) merged.artifact_data = cur.artifact_data

            // Hydrate tool_calls on this assistant msg
            if (cur.tool_calls?.length) {
              for (const tc of cur.tool_calls) {
                const fn  = tc?.function || {}
                const id  = tc?.id || fn?.id || fn?.name || `tool_${allTools.length}`
                const rawArgs = fn?.arguments
                const inputStr = rawArgs
                  ? typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs)
                  : undefined
                const tool: ToolCall = {
                  id,
                  name: fn.name || tc?.name || "tool",
                  input: inputStr,
                  status: "running",
                }
                allTools.push(tool)
                pendingTools.set(id, tool)
              }
            }
          } else if (cur.role === "tool" && cur.tool_call_id) {
            const tool = pendingTools.get(cur.tool_call_id)
            if (tool) {
              tool.status = "done"
              tool.result = cur.content || undefined
              if (!tool.input && (cur as any).tool_input) tool.input = (cur as any).tool_input
            }
          }

          j++
        }

        merged.tools = allTools
        result.push(merged)
        i = j  // skip all consumed messages
        continue
      }

      // Anything else — skip
      i++
    }

    return result
  }

  async function loadThread(threadId: string, preserveCurrentTools = false) {
    try {
      setError(null)
      const data     = await getThread(threadId)
      const hydrated = hydrateTools(data.messages)

      if (preserveCurrentTools) {
        // During streaming: keep live tool status for tools still running,
        // but use the DB status for tools that are already done in the DB.
        setMessages((prev) => {
          const liveMap = new Map<string, ToolCall>()
          for (const m of prev)
            for (const t of m.tools || [])
              if (t.id) liveMap.set(t.id, t)
          return hydrated.map((m) => {
            if (m.role !== "assistant" || !m.tools?.length) return m
            return {
              ...m,
              tools: m.tools.map((t) => {
                const live = t.id ? liveMap.get(t.id) : undefined
                // DB says done → use DB version (authoritative)
                // DB says running but live has it as done → use live
                // Otherwise use DB version
                if (t.status === "done") return t
                if (live?.status === "done") return { ...t, status: "done" as const, result: live.result }
                return live ?? t
              }),
            }
          })
        })
      } else {
        setMessages(hydrated)
      }
    } catch (err) {
      setError("Failed to load thread")
      console.error(err)
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

    // Auto-title the thread from the first user message
    const currentThread = threads.find((t) => t.id === activeThreadId)
    const isFirstMessage = !currentThread || currentThread.title === "New Chat"
    if (isFirstMessage && activeThreadId) {
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
              updateLastAssistant(prev, (m) => ({ ...m, content: (m.content || "") + event.delta, thinking: false })),
            )
          } else if (event.type === "thinking") {
            setMessages((prev) =>
              updateLastAssistant(prev, (m) => ({ ...m, thinking: true })),
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
                artifact_type: event.artifact_type ?? null,
                artifact_data: event.artifact_data ?? null,
                content: event.openui_code ? event.reply || m.content : m.content,
                // Mark every tool as done — stream is complete
                tools: (m.tools || []).map((t) => t.status === "running" ? { ...t, status: "done" as const } : t),
              })),
            )
          }
        },
        controller.signal,
      )

      await loadThread(activeThreadId, true)
      await loadThreads()
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Failed to send message")
        console.error(err)
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
  const currentThreadId  = activeThreadId

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
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
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

                  return (
                    <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

                      {/* Assistant avatar */}
                      {msg.role === "assistant" && (
                        <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-1 shadow-md shadow-primary/20">
                          <MapPin className="h-4 w-4 text-white" />
                        </div>
                      )}

                      <div className={`flex flex-col gap-2 min-w-0 ${msg.role === "user" ? "items-end max-w-[80%]" : "items-start max-w-[85%] w-full"}`}>

                        {/* Tool call panel — ABOVE the content */}
                        {msg.role === "assistant" && msg.tools && msg.tools.length > 0 && (
                          <ToolCallPanel tools={msg.tools} isStreaming={isStreaming} />
                        )}

                        {/* Message bubble — only if there's actual content */}
                        {(msg.content || msg.openui_code || isStreaming) && (
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm w-full ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card border border-border/60 rounded-bl-sm"
                          }`}>
                            {msg.role === "assistant" && msg.openui_code ? (
                              <OpenUIMessage
                                threadId={currentThreadId!}
                                messageId={msg.id}
                                code={msg.openui_code}
                                artifactType={msg.artifact_type}
                                artifactData={msg.artifact_data}
                              />
                            ) : (
                              <div className="whitespace-pre-wrap">
                                {msg.content || (
                                  isStreaming && !msg.tools?.some(t => t.status === "running") ? (
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
                                {msg.tools?.some(t => t.status === "running")
                                  ? `Using ${msg.tools.find(t => t.status === "running")?.name}…`
                                  : msg.thinking ? "Thinking…" : "Generating…"}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Standalone tool_name fallback */}
                        {msg.tool_name && !msg.tools?.length && (
                          <p className="text-xs text-muted-foreground px-1">Tool: {msg.tool_name}</p>
                        )}
                      </div>

                      {/* User avatar */}
                      {msg.role === "user" && (
                        <div className="h-8 w-8 rounded-xl bg-muted border border-border/60 flex items-center justify-center shrink-0 mt-1 text-xs font-bold text-muted-foreground">
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
            <div className="border-t border-border/60 bg-background px-4 py-3 shrink-0">
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
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-5 py-3 rounded-2xl text-sm max-w-[90%] text-center shadow-xl">
            ⚠ {error}
          </div>
        )}
      </main>
    </div>
  )
}
