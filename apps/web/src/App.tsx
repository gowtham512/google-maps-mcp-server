import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, MessageSquarePlus, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OpenUIMessage } from "@/components/OpenUIMessage"
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  sendMessage,
  type Message,
  type Thread,
} from "@/lib/api"

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !activeThreadId || loading) return

    const userMessage = input.trim()
    setInput("")
    setLoading(true)
    setError(null)

    // Optimistically add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, created_at: new Date().toISOString() },
    ])

    try {
      await sendMessage(activeThreadId, userMessage)
      await loadThread(activeThreadId)
    } catch (err) {
      setError("Failed to send message")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/40 flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={handleNewThread} className="w-full">
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => setActiveThreadId(thread.id)}
              className={`group flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-muted ${
                activeThreadId === thread.id ? "bg-muted" : ""
              }`}
            >
              <span className="truncate text-sm font-medium">{thread.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => handleDeleteThread(e, thread.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col">
        {activeThreadId ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <MapPin className="mb-2 h-8 w-8" />
                  Start a conversation...
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <Card
                    className={`max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card"
                    }`}
                  >
                    <CardContent className="p-4">
                      {msg.role === "assistant" && msg.openui_code ? (
                        <OpenUIMessage code={msg.openui_code} />
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content || ""}</div>
                      )}
                      {msg.tool_name && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Tool: {msg.tool_name}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <Card className="bg-card">
                    <CardContent className="p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </CardContent>
                  </Card>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="border-t p-4 flex gap-2">
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
          <div className="flex h-full items-center justify-center">
            <Card className="w-96">
              <CardHeader>
                <CardTitle>Travel Planner Chat</CardTitle>
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
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}