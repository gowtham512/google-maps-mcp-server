import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, Menu, MessageSquarePlus, Send, Trash2, Wrench, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OpenUIMessage } from "@/components/OpenUIMessage"
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  sendMessageStream,
  type Message,
  type StreamEvent,
  type Thread,
  type ToolCall,
} from "@/lib/api"

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

  async function loadThread(threadId: string) {
    try {
      setError(null)
      const data = await getThread(threadId)
      setMessages(data.messages)
    } catch (err) {
      setError("Failed to load thread")
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
              })),
            )
          } else if (event.type === "tool_call" && event.name) {
            const toolName = event.name
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const tools = msg.tools ? [...msg.tools] : []
                const existing = tools.find((t) => t.name === toolName && t.status === "running")
                if (!existing) {
                  tools.push({ name: toolName, status: "running" })
                }
                return { ...msg, tools }
              }),
            )
          } else if (event.type === "tool_result" && event.name) {
            const toolName = event.name
            const toolResult = event.result
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const tools = msg.tools ? [...msg.tools] : []
                const tool = tools.find((t) => t.name === toolName) || {
                  name: toolName,
                  status: "running" as const,
                }
                const filtered = tools.filter((t) => t.name !== toolName)
                filtered.push({ ...tool, result: toolResult, status: "done" })
                return { ...msg, tools: filtered }
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

      await loadThread(activeThreadId)
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
                        <div className="mt-3 space-y-1">
                          {msg.tools.map((tool, tidx) => (
                            <ToolBadge key={tidx} tool={tool} />
                          ))}
                        </div>
                      )}

                      {msg.tool_name && !msg.tools?.length && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Tool: {msg.tool_name}
                        </div>
                      )}

                      {msg.role === "assistant" &&
                        loading &&
                        !msg.content &&
                        !msg.openui_code &&
                        idx === messages.length - 1 && (
                          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Thinking...</span>
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

function ToolBadge({ tool }: { tool: ToolCall }) {
  return (
    <div className="flex items-center gap-2 text-xs md:text-sm rounded-md border px-2 py-1.5 bg-muted/50">
      <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium">{tool.name}</span>
      {tool.status === "running" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span className="text-muted-foreground">{tool.result}</span>
      )}
    </div>
  )
}
