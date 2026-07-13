import { useEffect, useRef, useState } from "react"
import { Loader2, LogOut, MapPin, Menu, MessageSquarePlus, Send, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  type Message,
  type StreamEvent,
  type Thread,
  type ToolCall,
} from "@/lib/api"

type AuthView = "login" | "signup"

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ---------------------------------------------------------------------------
  // Auth state
  // ---------------------------------------------------------------------------
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getToken())
  const [authView, setAuthView] = useState<AuthView>("login")

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

  // Show auth screens when not logged in
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

  useEffect(() => {
    loadThreads()
  }, [])

  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId)
    } else {
      setMessages([])
    }
  }, [activeThreadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

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

  function updateLastAssistant(
    messages: Message[],
    updater: (msg: Message) => Message,
  ): Message[] {
    const idx = messages.findLastIndex((m) => m.role === "assistant")
    if (idx === -1) return messages
    return messages.map((m, i) => (i === idx ? updater({ ...m }) : m))
  }

  function hydrateTools(loaded: Message[]): Message[] {
    const result: Message[] = []
    const pendingTools = new Map<string, ToolCall>()

    for (const msg of loaded) {
      if (msg.role === "assistant" && msg.tool_calls?.length) {
        const tools: ToolCall[] = []
        for (const tc of msg.tool_calls) {
          const fn = tc?.function || {}
          const id = tc?.id || fn?.id || fn?.name || `tool_${tools.length}`
          // Extract input arguments from the tool_call's function.arguments
          const rawArgs = fn?.arguments
          const input = rawArgs
            ? typeof rawArgs === "string"
              ? rawArgs
              : JSON.stringify(rawArgs)
            : undefined
          tools.push({ id, name: fn.name || tc?.name || "tool", input, status: "running" })
          pendingTools.set(id, tools[tools.length - 1])
        }
        result.push({ ...msg, tools })
        continue
      }

      if (msg.role === "tool" && msg.tool_call_id) {
        const tool = pendingTools.get(msg.tool_call_id)
        if (tool) {
          tool.status = "done"
          tool.result = msg.content || undefined
          // Backfill input from the tool message if the assistant message didn't have it
          if (!tool.input && (msg as any).tool_input) {
            tool.input = (msg as any).tool_input
          }
        } else {
          result.push({
            ...msg,
            tools: [{
              id: msg.tool_call_id,
              name: msg.tool_name || "tool",
              input: (msg as any).tool_input || undefined,
              status: "done",
              result: msg.content || undefined,
            }],
          })
          continue
        }
      }

      result.push(msg)
    }

    return result
  }

  async function loadThread(threadId: string, preserveCurrentTools = false) {
    try {
      setError(null)
      const data = await getThread(threadId)
      const hydrated = hydrateTools(data.messages)

      if (preserveCurrentTools) {
        setMessages((prev) => {
          const currentToolsById = new Map<string, ToolCall>()
          for (const m of prev) {
            for (const t of m.tools || []) {
              if (t.id) currentToolsById.set(t.id, t)
            }
          }
          return hydrated.map((m) => {
            if (m.role !== "assistant" || !m.tools?.length) return m
            return {
              ...m,
              tools: m.tools.map((t) => {
                const live = t.id ? currentToolsById.get(t.id) : undefined
                return live ? { ...live } : t
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !activeThreadId || loading) return

    const userMessage = input.trim()
    setInput("")
    setLoading(true)
    setError(null)

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, created_at: new Date().toISOString() },
      { role: "assistant", content: "", tools: [], created_at: new Date().toISOString() },
    ])

    try {
      await sendMessageStream(
        activeThreadId,
        userMessage,
        (event: StreamEvent) => {
          if (event.type === "content" && event.delta != null) {
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                content: (msg.content || "") + event.delta,
                thinking: false,
              })),
            )
          } else if (event.type === "thinking") {
            // Model is in thinking phase — show indicator but don't append to content
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                thinking: true,
              })),
            )
          } else if (event.type === "tool_call" && event.name) {
            const toolName = event.name
            const toolId = event.id || toolName
            const toolInput = event.input
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const tools = msg.tools ? [...msg.tools] : []
                const existing = tools.find((t) => (t.id || t.name) === toolId && t.status === "running")
                if (!existing) {
                  tools.push({ id: toolId, name: toolName, input: toolInput, status: "running" })
                }
                return { ...msg, tools }
              }),
            )
          } else if (event.type === "tool_result" && event.name) {
            const toolName = event.name
            const toolId = event.id || toolName
            const toolResult = event.result
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const tools = msg.tools ? [...msg.tools] : []
                const idx = tools.findIndex((t) => (t.id || t.name) === toolId)
                if (idx !== -1) {
                  tools[idx] = { ...tools[idx], id: toolId, name: toolName, result: toolResult, status: "done" }
                } else {
                  tools.push({ id: toolId, name: toolName, result: toolResult, status: "done" })
                }
                return { ...msg, tools }
              }),
            )
          } else if (event.type === "done") {
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                openui_code: event.openui_code ?? null,
                artifact_type: event.artifact_type ?? null,
                artifact_data: event.artifact_data ?? null,
                content: event.openui_code ? event.reply || msg.content : msg.content,
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

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const currentThreadId = activeThreadId

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r bg-muted/40 flex flex-col transition-transform duration-200 ease-in-out md:static md:w-64 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="font-semibold truncate md:hidden">Travel Planner</h1>
          <Button onClick={handleNewThread} className="w-full md:w-auto flex-1 md:flex-none md:ml-0">
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">New Chat</span>
            <span className="sm:hidden">New</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-2 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No chats yet. Start a new trip plan!
            </div>
          )}
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => selectThread(thread.id)}
              className={`group flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-muted ${
                activeThreadId === thread.id ? "bg-muted" : ""
              }`}
            >
              <span className="truncate text-sm font-medium">{thread.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => handleDeleteThread(e, thread.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
        {/* Logout */}
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center justify-between bg-muted/20 md:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-medium truncate">{activeThread?.title || "Travel Planner"}</span>
          </div>
        </header>

        {activeThreadId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-4 text-center">
                  <MapPin className="mb-3 h-10 w-10" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-1">Ask me to plan a trip, find places, or build a route.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <Card
                    className={`max-w-[92%] sm:max-w-[85%] md:max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card"
                    }`}
                  >
                    <CardContent className="p-3 md:p-4">
                      {msg.role === "assistant" && msg.openui_code ? (
                        <OpenUIMessage
                          threadId={currentThreadId!}
                          messageId={msg.id}
                          code={msg.openui_code}
                          artifactType={msg.artifact_type}
                          artifactData={msg.artifact_data}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm md:text-base">
                          {msg.content || ""}
                        </div>
                      )}

                      {msg.tools && msg.tools.length > 0 && (
                        <ToolCallPanel
                          tools={msg.tools}
                          isStreaming={loading && idx === messages.length - 1}
                        />
                      )}

                      {msg.tool_name && !msg.tools?.length && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Tool: {msg.tool_name}
                        </div>
                      )}

                      {msg.role === "assistant" &&
                        loading &&
                        idx === messages.length - 1 && (
                          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">
                              {msg.tools?.some((t) => t.status === "running")
                                ? `Using ${msg.tools.find((t) => t.status === "running")?.name ?? "tools"}...`
                                : msg.thinking
                                ? "Thinking..."
                                : "Generating..."}
                            </span>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="border-t p-3 md:p-4 flex gap-2 bg-background">
              <Input
                value={input}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                placeholder="Plan a trip to Paris..."
                disabled={loading}
                className="flex-1"
              />
              <Button type="submit" disabled={loading || !input.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="text-xl md:text-2xl">Travel Planner Chat</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Select a chat or create a new one to start planning your trip.
                </p>
                <Button onClick={handleNewThread} className="w-full">
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  New Chat
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {error && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm max-w-[90%] text-center">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}


