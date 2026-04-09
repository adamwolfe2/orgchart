/**
 * Pure helper for building the OpenAI prompt used in the RAG chat flow.
 * No I/O — all side-effects live in the route handler.
 */

interface RetrievedEmployee {
  id: string
  first_name: string
  last_name: string
  position: string | null
  context: string | null
}

interface BuildPromptInput {
  orgName: string
  question: string
  retrievedEmployees: RetrievedEmployee[]
}

interface OpenAIMessage {
  role: 'system' | 'user'
  content: string
}

export interface BuildPromptResult {
  messages: OpenAIMessage[]
  citedEmployeeIds: string[]
}

/**
 * Build the system + user messages for the chat completion call, and return
 * the IDs of all employees that were passed as context (they are the citation
 * candidates; the model decides which are actually relevant in its answer).
 */
export function buildChatPrompt({
  orgName,
  question,
  retrievedEmployees,
}: BuildPromptInput): BuildPromptResult {
  const citedEmployeeIds = retrievedEmployees.map((e) => e.id)

  const employeeList =
    retrievedEmployees.length === 0
      ? 'No relevant employees found in the directory.'
      : retrievedEmployees
          .map((e, i) => {
            const name = `${e.first_name} ${e.last_name}`.trim()
            const position = e.position ?? 'Unspecified role'
            const context = e.context?.trim() || 'No additional context.'
            return `${i + 1}. ${name} (${position}) — ${context}`
          })
          .join('\n')

  const systemContent = [
    `You are an org-chart assistant for ${orgName}.`,
    'You help employees discover who owns what area, who to talk to, and how the team is structured.',
    'Answer based only on the employee directory excerpts below.',
    'When you reference a specific person, cite their name and role.',
    'If none of the employees listed clearly owns what the user is asking about, say so honestly — do not guess.',
    '',
    'Employee directory:',
    employeeList,
  ].join('\n')

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: question },
  ]

  return { messages, citedEmployeeIds }
}
