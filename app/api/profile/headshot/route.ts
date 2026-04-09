import { NextResponse } from 'next/server'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MiB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/profile/headshot
 *
 * Accepts multipart/form-data with a single `file` field.
 * Validates mime type and size, then uploads to the headshots bucket
 * via the admin client (bypassing storage RLS after verifying ownership
 * in app code). Updates the employee row's headshot_url.
 *
 * Returns ApiResponse<{ headshot_url: string }>
 */
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

    // 2. Look up the claimed employee for this user (ownership verification)
    const supabase = await createClient()
    const { data: employee, error: lookupError } = await supabase
      .from('employees')
      .select('id, organization_id')
      .eq('claimed_by_user_id', auth.user.id)
      .maybeSingle()

    if (lookupError || !employee) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'no claimed employee found' },
        { status: 404 },
      )
    }

    // 3. Parse multipart body
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'expected multipart/form-data' },
        { status: 400 },
      )
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'missing file field' },
        { status: 400 },
      )
    }

    // 4. Server-side validation
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: 'File must be jpeg, png, or webp',
        },
        { status: 400 },
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'File must be 2 MB or smaller' },
        { status: 400 },
      )
    }

    // 5. Build storage key: {organization_id}/{employee_id}.{ext}
    const ext = MIME_TO_EXT[file.type] ?? 'jpg'
    const storageKey = `${employee.organization_id}/${employee.id}.${ext}`

    // 6. Upload via admin client (bypasses storage RLS after ownership check above)
    const admin = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await admin.storage
      .from('headshots')
      .upload(storageKey, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('headshot upload: storage error', { error: uploadError.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to upload headshot' },
        { status: 500 },
      )
    }

    // 7. Get public URL with cache-buster
    const { data: urlData } = admin.storage.from('headshots').getPublicUrl(storageKey)
    const headshotUrl = `${urlData.publicUrl}?v=${Date.now()}`

    // 8. Update employee row
    const { error: updateError } = await supabase
      .from('employees')
      .update({ headshot_url: headshotUrl })
      .eq('id', employee.id)

    if (updateError) {
      console.error('headshot upload: employee update error', { error: updateError.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'uploaded headshot but failed to save URL' },
        { status: 500 },
      )
    }

    return NextResponse.json<ApiResponse<{ headshot_url: string }>>({
      success: true,
      data: { headshot_url: headshotUrl },
    })
  } catch (err) {
    console.error('headshot upload: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
