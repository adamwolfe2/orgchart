import { describe, expect, it } from 'vitest'

import { matchHeader, parseEmployeeCsv } from './csv'

describe('matchHeader', () => {
  it('matches exact canonical names', () => {
    expect(matchHeader('first_name')).toBe('first_name')
    expect(matchHeader('email')).toBe('email')
    expect(matchHeader('supervisor_email')).toBe('supervisor_email')
  })

  it('matches common display variants', () => {
    expect(matchHeader('First Name')).toBe('first_name')
    expect(matchHeader('LAST NAME')).toBe('last_name')
    expect(matchHeader('E-Mail')).toBe('email')
    expect(matchHeader('Job Title')).toBe('position')
    expect(matchHeader('Manager')).toBe('supervisor_email')
    expect(matchHeader('Reports To')).toBe('supervisor_email')
  })

  it('matches fuzzy variants via substring containment', () => {
    expect(matchHeader('Work Email Address')).toBe('email')
    expect(matchHeader('Company Email')).toBe('email')
    expect(matchHeader('Reporting Manager')).toBe('supervisor_email')
  })

  it('returns null for unknown headers', () => {
    expect(matchHeader('Cost Center Code')).toBeNull()
    expect(matchHeader('Department')).toBeNull()
  })

  it('handles empty input gracefully', () => {
    expect(matchHeader('')).toBeNull()
    expect(matchHeader('   ')).toBeNull()
  })
})

// --------------------------------------------------------------------------
// parseEmployeeCsv — fixture-driven tests based on the architecture plan
// --------------------------------------------------------------------------

describe('parseEmployeeCsv — Fixture 1: MA Employees with pre-header title row', () => {
  const csv = [
    'MA Employees,,,,,,',
    'First Name,Last Name,Supervisor,Department,Job Title,MA Email Address,Personal Email Address',
    'Mike,Hoffman,,U&A,CEO,mhoffman@modern-amenities.com,',
    'Kelsey,Holshouser,Mike Hoffmann,U&A,COO,kelsey@modern-amenities.com,',
    'Jeff,Goldstein,Michael Hoffmann,U&A,VP Ops,jeff@modern-amenities.com,',
    'Jessica,Mayo,,AMS,Head of Automation,jess@modern-amenities.com,',
    'Adam,Wolfe,Jess Mayo,AMS,Tech PM,adam@modern-amenities.com,',
  ].join('\n')

  it('skips the pre-header title row and finds the real header', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(5)
  })

  it('first-seen-wins on duplicate email mappings', () => {
    const result = parseEmployeeCsv(csv)
    // MA Email Address should win, Personal Email Address is ignored
    const mapped = result.headerMappings.filter((m) => m.canonical === 'email')
    expect(mapped).toHaveLength(1)
    expect(mapped[0].raw).toBe('MA Email Address')
  })

  it('resolves supervisor "Mike Hoffmann" (typo) to Mike Hoffman via Levenshtein', () => {
    const result = parseEmployeeCsv(csv)
    const kelsey = result.rows.find((r) => r.first_name === 'Kelsey')
    expect(kelsey?.supervisor_email).toBe('mhoffman@modern-amenities.com')
  })

  it('resolves supervisor "Michael Hoffmann" (formal name + typo) via nickname + last-name match', () => {
    const result = parseEmployeeCsv(csv)
    const jeff = result.rows.find((r) => r.first_name === 'Jeff')
    expect(jeff?.supervisor_email).toBe('mhoffman@modern-amenities.com')
  })

  it('resolves supervisor "Jess Mayo" (nickname) to Jessica Mayo', () => {
    const result = parseEmployeeCsv(csv)
    const adam = result.rows.find((r) => r.first_name === 'Adam')
    expect(adam?.supervisor_email).toBe('jess@modern-amenities.com')
  })

  it('Department column is ignored as unmapped (no warning)', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.unmappedHeaders).toContain('Department')
  })
})

describe('parseEmployeeCsv — Fixture 2: "Last, First" name format', () => {
  // Real-world CSV with cells containing commas must be quoted. A
  // "Last, First" cell is therefore a SINGLE quoted column, and our
  // per-cell split kicks in when last_name is blank.
  const csv = [
    'First Name,Last Name,Email',
    '"Smith, John",,john@example.com',
    '"Doe, Jane",,jane@example.com',
  ].join('\n')

  it('splits the comma-embedded name when last_name is blank', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      first_name: 'John',
      last_name: 'Smith',
      email: 'john@example.com',
    })
    expect(result.rows[1]).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
    })
  })
})

describe('parseEmployeeCsv — Fixture 3: single "Full Name" column', () => {
  const csv = [
    'Name,Email,Manager',
    'John Smith,john@example.com,',
    'Jane Doe,jane@example.com,John Smith',
  ].join('\n')

  it('splits the single name column into first_name + last_name', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      first_name: 'John',
      last_name: 'Smith',
    })
    expect(result.rows[1]).toMatchObject({
      first_name: 'Jane',
      last_name: 'Doe',
      supervisor_email: 'john@example.com',
    })
  })
})

describe('parseEmployeeCsv — Fixture 4: diacritic names', () => {
  const csv = [
    'First Name,Last Name,Email,Supervisor',
    'José,García,jose@example.com,',
    'Zoë,Brown,zoe@example.com,Jose Garcia',
  ].join('\n')

  it('resolves supervisor names across diacritic boundaries', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    const zoe = result.rows.find((r) => r.email === 'zoe@example.com')
    expect(zoe?.supervisor_email).toBe('jose@example.com')
  })
})

describe('parseEmployeeCsv — Fixture 5: cycle in supervisor graph', () => {
  const csv = [
    'First Name,Last Name,Email,Manager',
    'Alice,Adams,alice@example.com,bob@example.com',
    'Bob,Brown,bob@example.com,alice@example.com',
  ].join('\n')

  it('breaks the cycle, still uploads both rows, emits a warning', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.rows).toHaveLength(2)
    // Exactly one row should end up with an empty supervisor_email
    const orphans = result.rows.filter((r) => !r.supervisor_email)
    expect(orphans.length).toBe(1)
    // Cycle warning should be present
    const cycleWarning = result.warnings.find((w) =>
      w.message.toLowerCase().includes('cycle'),
    )
    expect(cycleWarning).toBeDefined()
  })
})

describe('parseEmployeeCsv — Fixture 6: single-name employee', () => {
  const csv = [
    'First Name,Last Name,Email',
    'Madonna,,madonna@example.com',
    'John,Smith,john@example.com',
  ].join('\n')

  it('accepts a row with empty last_name when first_name is present', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows.find((r) => r.email === 'madonna@example.com')).toBeDefined()
  })
})

describe('parseEmployeeCsv — Fixture 7: honorifics', () => {
  const csv = [
    'First Name,Last Name,Email',
    'Dr. John,Smith Jr.,john@example.com',
    'Jane,Doe PhD,jane@example.com',
  ].join('\n')

  it('strips honorifics from display name while keeping the email intact', () => {
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows[0].first_name).toBe('John')
    expect(result.rows[0].last_name).toBe('Smith')
    expect(result.rows[1].last_name).toBe('Doe')
  })
})

// --------------------------------------------------------------------------
// Non-blocking failure modes — the parser should degrade gracefully
// --------------------------------------------------------------------------

describe('parseEmployeeCsv — graceful degradation', () => {
  it('blocks only on missing required headers', () => {
    const csv = 'Col1,Col2,Col3\nfoo,bar,baz'
    const result = parseEmployeeCsv(csv)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.rows).toHaveLength(0)
    expect(result.missingRequired).toContain('first_name')
    expect(result.missingRequired).toContain('email')
  })

  it('surfaces rawHeaders and sampleRows for LLM fallback', () => {
    const csv = 'Col1,Col2,Col3\nfoo,bar,baz\na,b,c'
    const result = parseEmployeeCsv(csv)
    expect(result.rawHeaders).toEqual(['Col1', 'Col2', 'Col3'])
    expect(result.sampleRows.length).toBeGreaterThan(0)
  })

  it('skips rows with invalid email as warnings, not errors', () => {
    const csv = [
      'First Name,Last Name,Email',
      'John,Smith,john@example.com',
      'Broken,Row,not-an-email',
      'Jane,Doe,jane@example.com',
    ].join('\n')
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.warnings.some((w) => w.message.includes('row skipped'))).toBe(true)
  })

  it('skips duplicate emails as warnings, keeps the first instance', () => {
    const csv = [
      'First Name,Last Name,Email',
      'John,Smith,john@example.com',
      'Johnny,Smitty,john@example.com',
    ].join('\n')
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].first_name).toBe('John')
    expect(result.warnings.some((w) => w.message.includes('duplicate'))).toBe(true)
  })

  it('treats unresolvable supervisors as top-level with a warning', () => {
    const csv = [
      'First Name,Last Name,Email,Manager',
      'John,Smith,john@example.com,',
      'Jane,Doe,jane@example.com,Nonexistent Person',
    ].join('\n')
    const result = parseEmployeeCsv(csv)
    expect(result.errors).toEqual([])
    const jane = result.rows.find((r) => r.first_name === 'Jane')
    expect(jane?.supervisor_email).toBe('')
    expect(
      result.warnings.some((w) =>
        w.message.includes('couldn\'t be matched'),
      ),
    ).toBe(true)
  })

  it('exposes unresolvedSupervisors for LLM fallback', () => {
    const csv = [
      'First Name,Last Name,Email,Manager',
      'John,Smith,john@example.com,',
      'Jane,Doe,jane@example.com,Ghost Person',
    ].join('\n')
    const result = parseEmployeeCsv(csv)
    expect(result.unresolvedSupervisors).toHaveLength(1)
    expect(result.unresolvedSupervisors[0].raw_value).toBe('Ghost Person')
    expect(result.unresolvedSupervisors[0].candidates.length).toBeGreaterThan(0)
  })
})

// --------------------------------------------------------------------------
// Header overrides (LLM fallback mechanism)
// --------------------------------------------------------------------------

describe('parseEmployeeCsv — headerOverrides', () => {
  it('pins a canonical field via the options argument', () => {
    const csv = 'weirdcol1,weirdcol2,weirdcol3\nJohn,Smith,john@example.com'
    // Without overrides, these headers are unmapped
    const local = parseEmployeeCsv(csv)
    expect(local.errors.length).toBeGreaterThan(0)

    // With overrides, it should parse cleanly
    const overridden = parseEmployeeCsv(csv, {
      headerOverrides: {
        weirdcol1: 'first_name',
        weirdcol2: 'last_name',
        weirdcol3: 'email',
      },
    })
    expect(overridden.errors).toEqual([])
    expect(overridden.rows).toHaveLength(1)
    expect(overridden.rows[0]).toMatchObject({
      first_name: 'John',
      last_name: 'Smith',
      email: 'john@example.com',
    })
  })

  it('silently ignores invalid override values', () => {
    const csv = 'First Name,Last Name,Email\nJohn,Smith,john@example.com'
    const result = parseEmployeeCsv(csv, {
      headerOverrides: {
        firstname: 'not_a_real_field',
      },
    })
    // Should still parse cleanly — override was ignored, local matcher won
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })
})
