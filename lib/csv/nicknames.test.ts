import { describe, expect, it } from 'vitest'

import { expandNickname, NICKNAMES } from './nicknames'

describe('NICKNAMES dictionary shape', () => {
  it('is non-empty and covers the anchor pairs', () => {
    expect(Object.keys(NICKNAMES).length).toBeGreaterThan(100)
    expect(NICKNAMES.mike).toContain('michael')
    expect(NICKNAMES.michael).toContain('mike')
    expect(NICKNAMES.jess).toContain('jessica')
    expect(NICKNAMES.jessica).toContain('jess')
    expect(NICKNAMES.bob).toContain('robert')
    expect(NICKNAMES.robert).toContain('bob')
  })

  it('uses normalized keys and values (lowercase, no punctuation or spaces)', () => {
    for (const [key, values] of Object.entries(NICKNAMES)) {
      expect(key).toMatch(/^[a-z0-9]+$/)
      for (const v of values) {
        expect(v).toMatch(/^[a-z0-9]+$/)
      }
    }
  })
})

describe('expandNickname', () => {
  it('always includes the input itself', () => {
    expect(expandNickname('mike')).toContain('mike')
    expect(expandNickname('xander')).toContain('xander')
  })

  it('includes known variants', () => {
    const mikeVariants = expandNickname('mike')
    expect(mikeVariants).toContain('michael')

    const jessicaVariants = expandNickname('jessica')
    expect(jessicaVariants).toContain('jess')
  })

  it('returns a singleton set for unknown names', () => {
    const unknown = expandNickname('zyzzyx')
    expect(unknown.size).toBe(1)
    expect(unknown).toContain('zyzzyx')
  })

  it('returns an empty set for empty input', () => {
    const empty = expandNickname('')
    expect(empty.size).toBe(0)
  })
})
