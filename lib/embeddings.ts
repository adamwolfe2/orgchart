import { getOpenAI, EMBEDDING_MODEL } from './openai'
import type { Employee } from './types'

/**
 * Build the text representation of an employee that gets embedded for RAG.
 * The format is intentionally natural-language so the embedding captures
 * "what this person does" rather than just keywords.
 */
export function employeeSourceText(emp: Pick<Employee, 'first_name' | 'last_name' | 'position' | 'context'>): string {
  const name = `${emp.first_name} ${emp.last_name}`.trim()
  const position = emp.position?.trim() || 'Unspecified role'
  const context = emp.context?.trim() || ''
  return context
    ? `${name}, ${position}. ${context}`
    : `${name}, ${position}.`
}

/**
 * Embed a batch of texts using OpenAI text-embedding-3-small.
 * Returns embeddings in the same order as the input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })

  return response.data.map((d) => d.embedding)
}

/** Embed a single text. Convenience wrapper. */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text])
  return embedding
}
