import { describe, expect, it } from 'vitest'

import {
  cleanCell,
  emailLocalTokens,
  firstToken,
  lastToken,
  levenshtein,
  looksLikeEmail,
  normalize,
  splitFullName,
  stripHonorifics,
} from './normalize'

describe('cleanCell', () => {
  it('trims whitespace', () => {
    expect(cleanCell('  john  ')).toBe('john')
  })

  it('strips leading BOM', () => {
    expect(cleanCell('\uFEFFjohn')).toBe('john')
  })

  it('collapses zero-width and non-breaking spaces to regular spaces', () => {
    expect(cleanCell('john\u200Bdoe\u00A0smith').trim()).toBe('john doe smith')
  })

  it('returns empty string for empty input', () => {
    expect(cleanCell('')).toBe('')
  })
})

describe('stripHonorifics', () => {
  it('removes leading titles', () => {
    expect(stripHonorifics('Dr. John Smith')).toBe('John Smith')
    expect(stripHonorifics('Mrs. Jane Doe')).toBe('Jane Doe')
    expect(stripHonorifics('Prof Alice Anderson')).toBe('Alice Anderson')
  })

  it('removes trailing suffixes', () => {
    expect(stripHonorifics('John Smith Jr.')).toBe('John Smith')
    expect(stripHonorifics('John Smith III')).toBe('John Smith')
    expect(stripHonorifics('Jane Doe PhD')).toBe('Jane Doe')
  })

  it('handles both prefix and suffix', () => {
    expect(stripHonorifics('Dr. John Smith Jr.')).toBe('John Smith')
  })

  it('is a no-op for names without honorifics', () => {
    expect(stripHonorifics('John Smith')).toBe('John Smith')
  })
})

describe('normalize', () => {
  it('lowercases and strips non-alphanumeric', () => {
    expect(normalize('John Smith')).toBe('johnsmith')
    expect(normalize('First-Name')).toBe('firstname')
  })

  it('strips diacritics via NFD', () => {
    expect(normalize('José')).toBe('jose')
    expect(normalize('Zoë')).toBe('zoe')
    expect(normalize('Renée')).toBe('renee')
    expect(normalize('Müller')).toBe('muller')
  })

  it('applies honorific stripping before normalization', () => {
    expect(normalize('Dr. John Smith Jr.')).toBe('johnsmith')
  })

  it('returns empty string for empty input', () => {
    expect(normalize('')).toBe('')
  })
})

describe('splitFullName', () => {
  it('splits a simple First Last', () => {
    expect(splitFullName('John Smith')).toEqual({ first: 'John', last: 'Smith' })
  })

  it('handles "Last, First" format', () => {
    expect(splitFullName('Smith, John')).toEqual({ first: 'John', last: 'Smith' })
  })

  it('handles single-name employees', () => {
    expect(splitFullName('Madonna')).toEqual({ first: 'Madonna', last: '' })
  })

  it('treats extra tokens as part of the last name', () => {
    expect(splitFullName('John van der Berg')).toEqual({
      first: 'John',
      last: 'van der Berg',
    })
  })

  it('strips honorifics before splitting', () => {
    expect(splitFullName('Dr. John Smith Jr.')).toEqual({
      first: 'John',
      last: 'Smith',
    })
  })

  it('returns empty for empty input', () => {
    expect(splitFullName('')).toEqual({ first: '', last: '' })
    expect(splitFullName('   ')).toEqual({ first: '', last: '' })
  })
})

describe('firstToken and lastToken', () => {
  it('extract first and last whitespace-separated tokens', () => {
    expect(firstToken('Mike Hoffman')).toBe('Mike')
    expect(lastToken('Mike Hoffman')).toBe('Hoffman')
  })

  it('handle single-name strings', () => {
    expect(firstToken('Madonna')).toBe('Madonna')
    expect(lastToken('Madonna')).toBe('Madonna')
  })

  it('handle empty strings', () => {
    expect(firstToken('')).toBe('')
    expect(lastToken('')).toBe('')
  })
})

describe('looksLikeEmail', () => {
  it('accepts simple addresses', () => {
    expect(looksLikeEmail('john@example.com')).toBe(true)
    expect(looksLikeEmail('first.last+tag@sub.example.co.uk')).toBe(true)
  })

  it('rejects non-emails', () => {
    expect(looksLikeEmail('john')).toBe(false)
    expect(looksLikeEmail('john@')).toBe(false)
    expect(looksLikeEmail('@example.com')).toBe(false)
    expect(looksLikeEmail('john@example')).toBe(false)
    expect(looksLikeEmail('john @example.com')).toBe(false)
  })
})

describe('emailLocalTokens', () => {
  it('splits on common separators', () => {
    expect(emailLocalTokens('mike.hoffman@example.com')).toEqual(['mike', 'hoffman'])
    expect(emailLocalTokens('john_doe@example.com')).toEqual(['john', 'doe'])
    expect(emailLocalTokens('jane-smith@example.com')).toEqual(['jane', 'smith'])
    expect(emailLocalTokens('mike+tag@example.com')).toEqual(['mike', 'tag'])
  })

  it('returns a single token for atomic local parts', () => {
    expect(emailLocalTokens('mhoffman@example.com')).toEqual(['mhoffman'])
  })

  it('returns empty array for non-emails', () => {
    expect(emailLocalTokens('mike')).toEqual([])
    expect(emailLocalTokens('')).toEqual([])
  })

  it('lowercases the tokens', () => {
    expect(emailLocalTokens('John.Smith@Example.com')).toEqual(['john', 'smith'])
  })
})

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('counts single edits correctly', () => {
    expect(levenshtein('hoffman', 'hoffmann')).toBe(1) // insertion
    expect(levenshtein('kitten', 'sitten')).toBe(1) // substitution
    expect(levenshtein('cat', 'ca')).toBe(1) // deletion
  })

  it('counts multi-edit distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })

  it('handles empty inputs', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
    expect(levenshtein('', '')).toBe(0)
  })
})
