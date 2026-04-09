import type { Metadata, Viewport } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import type { Organization } from '@/lib/types'
import './globals.css'

function toAbsoluteUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

const APP_URL = toAbsoluteUrl(
  process.env.NEXT_PUBLIC_APP_URL ?? 'orgchart.aimanagingservices.com',
)

const TITLE = 'OrgChart — your team, from a single CSV'
const DESCRIPTION =
  'Upload a CSV of your team and get a hosted, searchable org chart in minutes. Built by AIMS.'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: '%s · OrgChart',
  },
  description: DESCRIPTION,
  applicationName: 'OrgChart',
  authors: [{ name: 'AI Managing Services', url: 'https://aimanagingservices.com' }],
  keywords: [
    'org chart',
    'organizational chart',
    'employee directory',
    'CSV upload',
    'company structure',
    'team hierarchy',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: APP_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'OrgChart',
    locale: 'en_US',
    images: [
      {
        url: '/logo-mark.png',
        width: 512,
        height: 512,
        alt: 'OrgChart',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/logo-mark.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
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
