import { NextResponse } from 'next/server'

import { getCurrentUserAndMembership, isAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const BUCKET = 'logos'

/**
 * POST /api/org/logo
 *
 * Accepts a multipart form with a single `file` field.
 * Uploads to the `logos` storage bucket at `{org_id}/{filename}`,
 * then updates organizations.logo_url with the public URL.
 *
 * Returns { success: true, data: { logo_url: string } }
 */
export async function POST(request: Request) {
  try {
    const auth = await getCurrentUserAndMembership()

    if (!auth || !auth.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    if (!isAdmin(auth.membership.role)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden: admin role required' },
        { status: 403 },
      )
    }

    const organizationId = auth.membership.organization_id

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invalid multipart form data' },
        { status: 400 },
      )
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'file field is required' },
        { status: 400 },
      )
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'file must be jpeg, png, webp, svg, or gif' },
        { status: 400 },
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'file must be 2 MB or smaller' },
        { status: 400 },
      )
    }

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/gif': 'gif',
    }
    const ext = extMap[file.type] ?? 'jpg'
    const storagePath = `${organizationId}/logo.${ext}`

    const adminClient = createAdminClient()

    // Upload (upsert) to storage — overwrite existing logo for this org
    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[logo-upload] storage upload failed:', uploadError)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to upload logo' },
        { status: 500 },
      )
    }

    // Get the public URL
    const { data: publicUrlData } = adminClient.storage.from(BUCKET).getPublicUrl(storagePath)
    const logoUrl = publicUrlData.publicUrl

    // Update the organization row
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: logoUrl })
      .eq('id', organizationId)

    if (updateError) {
      console.error('[logo-upload] org update failed:', updateError)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to save logo URL' },
        { status: 500 },
      )
    }

    return NextResponse.json<ApiResponse<{ logo_url: string }>>({
      success: true,
      data: { logo_url: logoUrl },
    })
  } catch (err) {
    console.error('[logo-upload] unexpected error:', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
