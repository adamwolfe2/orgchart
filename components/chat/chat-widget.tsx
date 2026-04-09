'use client'

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChatMessage, ChatSource } from '@/lib/types'
import { ChatIcon } from './chat-icon'

interface ChatWidgetProps {
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

function MessageBubble({
  role,
  content,
  sources,
  onEmployeeClick,
}: {
  role: 'user' | 'assistant'
  content: string
  sources: ChatSource[]
  onEmployeeClick: (id: string) => void
}) {
  const isUser = role === 'user'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-slate-900 text-white'
            : 'bg-slate-100 text-slate-800'
        }`}
      >
        {content}
      </div>

      {!isUser && sources.length > 0 ? (
        <div className="flex max-w-[80%] flex-wrap gap-1">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onEmployeeClick(s.id)}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              {s.first_name} {s.last_name}
              {s.position ? ` · ${s.position}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start">
      <div className="rounded-xl bg-slate-100 px-3 py-2">
        <span className="flex gap-1" aria-label="Typing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-slate-400"
              style={{
                animation: 'bounce 1.2s infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

export function ChatWidget({
  initialMessages,
  organizationName,
  onEmployeeClick,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<OptimisticMessage[]>(
    initialMessages.map(toOptimistic),
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change or widget opens
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, loading])

  // Focus input when widget opens
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setError(null)

    const optimisticUserId = `opt-user-${Date.now()}`
    const optimisticAssistantId = `opt-assistant-${Date.now()}`

    // Optimistically append user message
    setMessages((prev) => [
      ...prev,
      {
        kind: 'optimistic',
        id: optimisticUserId,
        role: 'user',
        content: question,
        sources: [],
      },
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
        const msg = json.error ?? 'Something went wrong. Please try again.'
        setError(msg)
        // Remove the optimistic user message on hard error
        setMessages((prev) => prev.filter((m) => {
          if (m.kind === 'optimistic' && m.id === optimisticUserId) return false
          return true
        }))
        return
      }

      const { answer, sources } = json.data as { answer: string; sources: ChatSource[] }

      setMessages((prev) => [
        ...prev,
        {
          kind: 'optimistic',
          id: optimisticAssistantId,
          role: 'assistant',
          content: answer,
          sources,
        },
      ])
    } catch {
      setError('Network error. Please try again.')
      setMessages((prev) =>
        prev.filter((m) => !(m.kind === 'optimistic' && m.id === optimisticUserId)),
      )
    } finally {
      setLoading(false)
    }
  }

  function getMessageProps(m: OptimisticMessage): {
    id: string
    role: 'user' | 'assistant'
    content: string
    sources: ChatSource[]
  } {
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

  return (
    <>
      {/* Bounce animation keyframes injected once */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>

      {/* Floating toggle button */}
      <button
        type="button"
        aria-label={open ? 'Close chat' : 'Open org chart assistant'}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <ChatIcon className="h-5 w-5" />
        )}
      </button>

      {/* Chat panel */}
      {open ? (
        <div
          role="dialog"
          aria-label="Org chart assistant"
          className="fixed bottom-22 right-6 z-40 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ height: '500px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Org assistant</p>
              <p className="text-xs text-slate-500">{organizationName}</p>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Message list */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="mt-auto text-center text-xs text-slate-400">
                Ask anything about your organization — who owns what, who to talk to, team structure.
              </p>
            ) : null}

            {messages.map((m) => {
              const props = getMessageProps(m)
              return (
                <MessageBubble
                  key={props.id}
                  role={props.role}
                  content={props.content}
                  sources={props.sources}
                  onEmployeeClick={onEmployeeClick}
                />
              )
            })}

            {loading ? <TypingIndicator /> : null}

            {error ? (
              <p className="text-center text-xs text-red-500">{error}</p>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-slate-100 px-3 py-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your org..."
              disabled={loading}
              maxLength={500}
              className="h-9 flex-1 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={loading || !input.trim()}
              className="h-9 shrink-0 px-3"
            >
              Send
            </Button>
          </form>
        </div>
      ) : null}
    </>
  )
}
