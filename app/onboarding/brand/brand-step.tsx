'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BrandExtractionResult, Organization } from '@/lib/types'
import { saveBrand, skipBrand } from './actions'

const DEFAULT_PRIMARY = '#0f172a'
const DEFAULT_SECONDARY = '#64748b'
const DEFAULT_ACCENT = '#3b82f6'

interface ColorFieldProps {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ label, name, value, onChange }: ColorFieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <button
        type="button"
        aria-label={`Pick ${label}`}
        onClick={() => pickerRef.current?.click()}
        className="h-12 w-12 rounded-lg border border-slate-200 shadow-sm transition-shadow hover:shadow-md"
        style={{ backgroundColor: value }}
      />
      {/* Hidden native color picker triggered by the swatch button */}
      <input
        ref={pickerRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
      <Input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
        className="w-24 text-center font-mono text-xs"
        aria-label={`${label} hex value`}
      />
    </div>
  )
}

interface BrandStepProps {
  organization: Organization
}

export function BrandStep({ organization }: BrandStepProps) {
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState(organization.logo_url ?? '')
  const [primary, setPrimary] = useState(organization.primary_color || DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState(
    organization.secondary_color || DEFAULT_SECONDARY,
  )
  const [accent, setAccent] = useState(organization.accent_color || DEFAULT_ACCENT)

  useEffect(() => {
    if (!organization.website_url) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function scrape() {
      try {
        const res = await fetch('/api/onboarding/scrape-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ website_url: organization.website_url }),
        })

        if (!res.ok || cancelled) return

        const json = (await res.json()) as {
          success: boolean
          data?: BrandExtractionResult
        }

        if (!json.success || !json.data || cancelled) return

        const { logoUrl: scraped, primaryColor, secondaryColor, accentColor } = json.data

        if (scraped) setLogoUrl(scraped)
        if (primaryColor) setPrimary(primaryColor)
        if (secondaryColor) setSecondary(secondaryColor)
        if (accentColor) setAccent(accentColor)
      } catch {
        // Scrape failure is non-fatal; user keeps defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void scrape()
    return () => {
      cancelled = true
    }
  }, [organization.website_url])

  return (
    <div className="space-y-6">
      {loading && (
        <p className="text-sm text-slate-500" role="status" aria-live="polite">
          Extracting your brand...
        </p>
      )}

      {!loading && (
        <form
          action={async (formData) => {
            // Pass the current state values into the form before submitting
            formData.set('logo_url', logoUrl)
            formData.set('primary_color', primary)
            formData.set('secondary_color', secondary)
            formData.set('accent_color', accent)
            await saveBrand(formData)
          }}
          className="space-y-6"
        >
          {/* Logo preview + URL input */}
          <div className="space-y-2">
            <Label htmlFor="logo_url">Logo URL</Label>
            {logoUrl && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Organization logo preview"
                  className="h-10 w-10 rounded object-contain"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
            <Input
              id="logo_url"
              name="logo_url"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* Color swatches */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Brand colors</p>
            <div className="flex gap-6">
              <ColorField
                label="Primary"
                name="primary_color"
                value={primary}
                onChange={setPrimary}
              />
              <ColorField
                label="Secondary"
                name="secondary_color"
                value={secondary}
                onChange={setSecondary}
              />
              <ColorField
                label="Accent"
                name="accent_color"
                value={accent}
                onChange={setAccent}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" size="lg">
              Save &amp; continue
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={async () => {
                await skipBrand()
              }}
            >
              Skip
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
