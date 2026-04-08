import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import type { Organization } from '@/lib/types'
import './globals.css'

export const metadata: Metadata = {
  title: 'OrgChart',
  description:
    'Upload a CSV of your team. Get a hosted, searchable org chart in minutes.',
}

const DEFAULT_PRIMARY = '#0f172a'
const DEFAULT_SECONDARY = '#64748b'
const DEFAULT_ACCENT = '#3b82f6'

interface BrandColors {
  primary: string
  secondary: string
  accent: string
}

async function loadBrandColors(): Promise<BrandColors> {
  try {
    const auth = await getCurrentUserAndMembership()
    if (!auth?.membership) {
      return {
        primary: DEFAULT_PRIMARY,
        secondary: DEFAULT_SECONDARY,
        accent: DEFAULT_ACCENT,
      }
    }

    const supabase = await createClient()
    const { data } = await supabase
      .from('organizations')
      .select('primary_color, secondary_color, accent_color')
      .eq('id', auth.membership.organization_id)
      .maybeSingle()

    const organization = data as Pick<
      Organization,
      'primary_color' | 'secondary_color' | 'accent_color'
    > | null

    return {
      primary: organization?.primary_color ?? DEFAULT_PRIMARY,
      secondary: organization?.secondary_color ?? DEFAULT_SECONDARY,
      accent: organization?.accent_color ?? DEFAULT_ACCENT,
    }
  } catch {
    return {
      primary: DEFAULT_PRIMARY,
      secondary: DEFAULT_SECONDARY,
      accent: DEFAULT_ACCENT,
    }
  }
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const brand = await loadBrandColors()

  const htmlStyle = {
    '--color-brand-primary': brand.primary,
    '--color-brand-secondary': brand.secondary,
    '--color-brand-accent': brand.accent,
  } as CSSProperties

  return (
    <html lang="en" style={htmlStyle}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
