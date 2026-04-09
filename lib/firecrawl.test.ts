import { describe, expect, it } from 'vitest'

import { validateHexColor, resolveLogoUrl } from './firecrawl'

describe('validateHexColor', () => {
  it('accepts valid lowercase 6-digit hex', () => {
    expect(validateHexColor('#3b82f6')).toBe('#3b82f6')
  })

  it('accepts valid uppercase 6-digit hex', () => {
    expect(validateHexColor('#3B82F6')).toBe('#3B82F6')
  })

  it('accepts black and white', () => {
    expect(validateHexColor('#000000')).toBe('#000000')
    expect(validateHexColor('#ffffff')).toBe('#ffffff')
  })

  it('rejects 3-digit hex', () => {
    expect(validateHexColor('#abc')).toBeNull()
  })

  it('rejects hex without leading #', () => {
    expect(validateHexColor('3b82f6')).toBeNull()
  })

  it('rejects 8-digit hex (with alpha)', () => {
    expect(validateHexColor('#3b82f6ff')).toBeNull()
  })

  it('rejects non-string values', () => {
    expect(validateHexColor(null)).toBeNull()
    expect(validateHexColor(undefined)).toBeNull()
    expect(validateHexColor(123456)).toBeNull()
    expect(validateHexColor({})).toBeNull()
  })

  it('rejects empty string', () => {
    expect(validateHexColor('')).toBeNull()
  })

  it('rejects invalid hex characters', () => {
    expect(validateHexColor('#xyz123')).toBeNull()
  })
})

describe('resolveLogoUrl', () => {
  const BASE = 'https://example.com'

  it('prefers metadata.ogImage string', () => {
    const metadata = { ogImage: 'https://example.com/og.png', 'og:image': 'https://other.com/og.png' }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/og.png')
  })

  it('falls back to og:image string when ogImage is missing', () => {
    const metadata = { 'og:image': 'https://example.com/og2.png' }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/og2.png')
  })

  it('handles ogImage as an array', () => {
    const metadata = { ogImage: ['https://example.com/array-og.png', 'https://example.com/second.png'] }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/array-og.png')
  })

  it('handles og:image as an array', () => {
    const metadata = { 'og:image': ['https://example.com/og-arr.png'] }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/og-arr.png')
  })

  it('falls back to /favicon.ico when no og images', () => {
    expect(resolveLogoUrl({}, BASE)).toBe('https://example.com/favicon.ico')
  })

  it('strips trailing slash from websiteUrl before appending favicon', () => {
    expect(resolveLogoUrl({}, 'https://example.com/')).toBe('https://example.com/favicon.ico')
  })

  it('falls back to favicon when ogImage is an empty string', () => {
    const metadata = { ogImage: '' }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/favicon.ico')
  })

  it('falls back to favicon when ogImage is an empty array', () => {
    const metadata = { ogImage: [] }
    expect(resolveLogoUrl(metadata, BASE)).toBe('https://example.com/favicon.ico')
  })
})
