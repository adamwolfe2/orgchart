import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { buildChatPrompt } from '@/lib/chat'
import { embedText } from '@/lib/embeddings'
import { getOpenAI, CHAT_MODEL } from '@/lib/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, ChatSource } from '@/lib/types'

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
})

const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX_MESSAGES = 15

export async function POST(request: Request) {
  try {
    // 1. Auth
    const auth = await getCurrentUserAndMembership()
    if (!auth) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }
    if (!auth.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'no organization' },
        { status: 403 },
      )
    }

    const { user, membership } = auth

    // 2. Parse + validate body
    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invalid request: question must be 1–500 characters' },
        { status: 400 },
      )
    }
    const { question } = parsed.data

    // 3. Rate limit: count user 'user'-role messages in the last 60 seconds
    const admin = createAdminClient()
    const windowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000,
    ).toISOString()

    const { count, error: countError } = await admin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', windowStart)

    if (countError) {
      console.error('chat: rate-limit count failed', { error: countError.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'chat unavailable' },
        { status: 500 },
      )
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX_MESSAGES) {
      return NextResponse.json(
        {
          success: false,
          error: 'rate limit exceeded',
          retry_after: RATE_LIMIT_WINDOW_SECONDS,
        },
        { status: 429 },
      )
    }

    // 4. Insert user message
    const { error: userInsertError } = await admin.from('chat_messages').insert({
      organization_id: membership.organization_id,
      user_id: user.id,
      role: 'user',
      content: question,
      sources: [],
    })

    if (userInsertError) {
      console.error('chat: user message insert failed', { error: userInsertError.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'chat unavailable' },
        { status: 500 },
      )
    }

    // 5. Embed the question
    const queryEmbedding = await embedText(question)

    // 6. Vector search — use the regular server client so RLS double-checks org
    const supabase = await createClient()
    const { data: matchRows, error: matchError } = await supabase.rpc(
      'match_employees',
      {
        query_embedding: queryEmbedding,
        org_id: membership.organization_id,
        match_count: 8,
      },
    )

    if (matchError) {
      console.error('chat: match_employees failed', { error: matchError.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'chat unavailable' },
        { status: 500 },
      )
    }

    const employeeIds: string[] =
      (matchRows ?? []).map((r: { employee_id: string }) => r.employee_id)

    // 7. Hydrate employees
    type HydratedEmployee = {
      id: string
      first_name: string
      last_name: string
      position: string | null
      email: string
      context: string | null
      headshot_url: string | null
    }

    let hydratedEmployees: HydratedEmployee[] = []
    if (employeeIds.length > 0) {
      const { data: empRows, error: empError } = await supabase
        .from('employees')
        .select('id, first_name, last_name, position, email, context, headshot_url')
        .in('id', employeeIds)

      if (empError) {
        console.error('chat: employee hydration failed', { error: empError.message })
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: 'chat unavailable' },
          { status: 500 },
        )
      }
      hydratedEmployees = (empRows ?? []) as HydratedEmployee[]
    }

    // 8. Fetch org name for the system prompt (non-fatal — falls back below)
    let orgName = 'your organization'
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', membership.organization_id)
      .single()
    if (orgRow?.name) orgName = orgRow.name

    // 9. Build prompt + call OpenAI
    const { messages } = buildChatPrompt({
      orgName,
      question,
      retrievedEmployees: hydratedEmployees,
    })

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
    })

    const answer = completion.choices[0]?.message?.content ?? ''

    // 9. Build sources for storage + response
    const sources: ChatSource[] = hydratedEmployees.map((e) => ({
      id: e.id,
      first_name: e.first_name,
      last_name: e.last_name,
      position: e.position,
      email: e.email,
      headshot_url: e.headshot_url,
    }))

    // Insert assistant message via admin (bypasses RLS per migration comment)
    const { error: assistantInsertError } = await admin
      .from('chat_messages')
      .insert({
        organization_id: membership.organization_id,
        user_id: user.id,
        role: 'assistant',
        content: answer,
        sources,
      })

    if (assistantInsertError) {
      console.error('chat: assistant message insert failed', {
        error: assistantInsertError.message,
      })
      // Non-fatal — still return the answer to the user
    }

    return NextResponse.json<ApiResponse<{ answer: string; sources: ChatSource[] }>>({
      success: true,
      data: { answer, sources },
    })
  } catch (err) {
    console.error('chat: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'chat unavailable' },
      { status: 500 },
    )
  }
}
