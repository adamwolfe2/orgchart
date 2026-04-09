'use client'

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatSource } from '@/lib/types'

interface BottomChatBarProps {
  initialMessages: ChatMessage[]
  organizationName: string
  onEmployeeClick: (employeeId: string) => void
}

type OptimisticMessage =
  | { kind: 'persisted'; message: ChatMessage }
  | { kind: 'optimistic'; id: string; role: 'user' | 'assistant'; content: string; sources: ChatSource[] }

function toOptimistic(m: ChatMessage): OptimisticMessage {
  return { kind: 'persisted', message: m }
}

function getMessageProps(m: OptimisticMessage) {
  if (m.kind === 'persisted') {
    return {
      id: m.message.id,
      role: m.message.role,
      content: m.message.content,
      sources: m.message.sources,
    }
  }
  return { id: m.id, role: m.role, content: m.content, sources: m.sources }
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5">
        <span className="flex gap-1" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-slate-400"
              style={{ animation: 'chat-bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

export function BottomChatBar({ initialMessages, organizationName, onEmployeeClick }: BottomChatBarProps) {
  const [messages, setMessages] = useState<OptimisticMessage[]>(initialMessages.map(toOptimistic))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(initialMessages.length > 0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, expanded])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setError(null)
    setExpanded(true)

    const optimisticUserId = `opt-user-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { kind: 'optimistic', id: optimisticUserId, role: 'user', content: question, sources: [] },
    ])

    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      const json = await response.json()

      if (!response.ok || !json.success) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        setMessages((prev) => prev.filter((m) => !(m.kind === 'optimistic' && m.id === optimisticUserId)))
        return
      }

      const { answer, sources } = json.data as { answer: string; sources: ChatSource[] }

      setMessages((prev) => [
        ...prev,
        {
          kind: 'optimistic',
          id: `opt-assistant-${Date.now()}`,
          role: 'assistant',
          content: answer,
          sources,
        },
      ])
    } catch {
      setError('Network error. Please try again.')
      setMessages((prev) => prev.filter((m) => !(m.kind === 'optimistic' && m.id === optimisticUserId)))
    } finally {
      setLoading(false)
    }
  }

  const hasMessages = messages.length > 0

  return (
    <>
      <style>{`
        @keyframes chat-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>

      {/* Fixed bottom container */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center px-4 pb-5">
        <div
          className="w-full"
          style={{ maxWidth: 680 }}
        >
          {/* Message panel — slides up when expanded */}
          {expanded && hasMessages ? (
            <div className="mb-2 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {organizationName} assistant
                </p>
                <button
                  type="button"
                  aria-label="Collapse chat"
                  onClick={() => setExpanded(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex max-h-72 flex-col gap-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => {
                  const { id, role, content, sources } = getMessageProps(m)
                  const isUser = role === 'user'

                  return (
                    <div key={id} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? 'rounded-br-sm bg-slate-900 text-white'
                            : 'rounded-bl-sm bg-slate-100 text-slate-800'
                        }`}
                      >
                        {content}
                      </div>

                      {!isUser && sources.length > 0 ? (
                        <div className="flex max-w-[85%] flex-wrap gap-1.5">
                          {sources.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => onEmployeeClick(s.id)}
                              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                              {s.first_name} {s.last_name}
                              {s.position ? ` · ${s.position}` : ''}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}

                {loading ? <TypingIndicator /> : null}

                {error ? (
                  <p className="text-center text-xs text-red-500">{error}</p>
                ) : null}

                <div ref={bottomRef} />
              </div>
            </div>
          ) : null}

          {/* Input bar */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg transition-shadow hover:shadow-xl focus-within:shadow-xl"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => hasMessages && setExpanded(true)}
              placeholder="Ask anything..."
              disabled={loading}
              maxLength={500}
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
