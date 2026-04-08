import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'

interface LogoProps {
  href?: string
  showWordmark?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { px: 28, text: 'text-base' },
  md: { px: 36, text: 'text-lg' },
  lg: { px: 44, text: 'text-xl' },
} as const

/**
 * OrgChart brand mark. Uses the taskspace-family logo SVG with an
 * optional "OrgChart" wordmark.
 */
export function Logo({
  href = '/',
  showWordmark = true,
  size = 'md',
  className,
}: LogoProps) {
  const { px, text } = sizeMap[size]

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 font-semibold text-slate-900',
        text,
        className,
      )}
    >
      <Image
        src="/logo-mark.svg"
        alt="OrgChart"
        width={px}
        height={px}
        priority
        className="rounded-lg"
      />
      {showWordmark ? (
        <span className="tracking-tight">OrgChart</span>
      ) : null}
    </span>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
