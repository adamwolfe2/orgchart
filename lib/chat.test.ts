import { describe, expect, it } from 'vitest'
import { buildChatPrompt } from './chat'

describe('buildChatPrompt', () => {
  const baseEmployee = {
    id: 'abc123',
    first_name: 'Jane',
    last_name: 'Smith',
    position: 'Engineering Manager',
    context: 'Owns backend infrastructure.',
  }

  it('returns the question as the user message', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who handles DevOps?',
      retrievedEmployees: [],
    })

    const userMsg = messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toBe('Who handles DevOps?')
  })

  it('includes org name in the system prompt', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who leads product?',
      retrievedEmployees: [],
    })

    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('Acme Corp')
  })

  it('formats employees as a numbered list in the system prompt', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who handles backend?',
      retrievedEmployees: [baseEmployee],
    })

    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('1. Jane Smith (Engineering Manager)')
    expect(system?.content).toContain('Owns backend infrastructure.')
  })

  it('returns all employee IDs as citedEmployeeIds', () => {
    const emp2 = { ...baseEmployee, id: 'def456', first_name: 'Bob', last_name: 'Jones' }
    const { citedEmployeeIds } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who leads engineering?',
      retrievedEmployees: [baseEmployee, emp2],
    })

    expect(citedEmployeeIds).toEqual(['abc123', 'def456'])
  })

  it('falls back gracefully when no employees are retrieved', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who is in charge?',
      retrievedEmployees: [],
    })

    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('No relevant employees found')
  })

  it('uses "Unspecified role" when position is null', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who is the leader?',
      retrievedEmployees: [{ ...baseEmployee, position: null }],
    })

    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('Unspecified role')
  })

  it('uses fallback context text when employee context is null', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Who runs design?',
      retrievedEmployees: [{ ...baseEmployee, context: null }],
    })

    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain('No additional context.')
  })

  it('produces exactly two messages: system and user', () => {
    const { messages } = buildChatPrompt({
      orgName: 'Acme Corp',
      question: 'Hello?',
      retrievedEmployees: [],
    })

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })
})
