import { createAdminClient } from './supabase/admin'
import { getOpenAI, EMBEDDING_MODEL } from './openai'
import type { Employee } from './types'

/**
 * Build the text representation of an employee that gets embedded for RAG.
 * The format is intentionally natural-language so the embedding captures
 * "what this person does" rather than just keywords.
 *
 * Includes custom_links labels too so a bio-style link list can surface
 * in chat queries (e.g. "Portfolio" link label with url would be
 * searchable).
 */
export function employeeSourceText(
  emp: Pick<
    Employee,
    'first_name' | 'last_name' | 'position' | 'context'
  > & {
    custom_links?: Array<{ label?: string; url?: string }> | null
  },
): string {
  const name = `${emp.first_name} ${emp.last_name}`.trim()
  const position = emp.position?.trim() || 'Unspecified role'
  const context = emp.context?.trim() || ''
  const linkLabels = Array.isArray(emp.custom_links)
    ? emp.custom_links
        .map((l) => l?.label?.trim())
        .filter((l): l is string => Boolean(l))
        .join(', ')
    : ''

  const parts: string[] = [`${name}, ${position}.`]
  if (context) parts.push(context)
  if (linkLabels) parts.push(`Links: ${linkLabels}.`)
  return parts.join(' ')
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

/** Embed a single text. Convenience wrapper. Throws if OpenAI returns no data. */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text])
  const embedding = results[0]
  if (!embedding) {
    throw new Error('embedText: OpenAI returned no embedding data')
  }
  return embedding
}

/**
 * Refresh the employee_embeddings row for a single employee. Called after
 * profile edits so the chatbot reflects the new position/context/links
 * without waiting for a full re-upload.
 *
 * Uses the service-role admin client because:
 *   1. We want to write to employee_embeddings without requiring the
 *      caller to have admin RLS access (a self-editor can refresh their
 *      own embedding).
 *   2. Errors here must NOT fail the parent operation. Logged and
 *      swallowed.
 *
 * Returns true on success, false on any failure.
 */
export async function refreshEmployeeEmbedding(
  employeeId: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: emp, error: fetchError } = await admin
      .from('employees')
      .select(
        'id, organization_id, first_name, last_name, position, context, custom_links',
      )
      .eq('id', employeeId)
      .maybeSingle()

    if (fetchError || !emp) {
      console.error('refreshEmployeeEmbedding: failed to load employee', {
        employeeId,
        error: fetchError?.message,
      })
      return false
    }

    const sourceText = employeeSourceText(emp)
    const [embedding] = await embedTexts([sourceText])
    if (!embedding) return false

    const { error: upsertError } = await admin
      .from('employee_embeddings')
      .upsert(
        {
          employee_id: emp.id,
          organization_id: emp.organization_id,
          embedding,
          source_text: sourceText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'employee_id' },
      )

    if (upsertError) {
      console.error('refreshEmployeeEmbedding: failed to upsert', {
        employeeId,
        error: upsertError.message,
      })
      return false
    }

    return true
  } catch (err) {
    console.error('refreshEmployeeEmbedding: unexpected error', {
      employeeId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
