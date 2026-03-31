import { describe, it, expect } from 'vitest'
import { STATE_TAX_TABLE, STATE_NAMES } from '../../constants/stateTaxTable.js'

const VALID_MODELS = new Set(['NONE', 'FLAT', 'PROGRESSIVE'])

// All 50 states + DC
const EXPECTED_STATE_CODES = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
  'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
  'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE',
  'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
]

describe('STATE_TAX_TABLE — structural integrity', () => {
  it('contains at least 51 entries (50 states + DC)', () => {
    expect(Object.keys(STATE_TAX_TABLE).length).toBeGreaterThanOrEqual(51)
  })

  it('every entry has a valid model field', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      expect(VALID_MODELS.has(entry.model),
        `${code} has invalid model "${entry.model}"`).toBe(true)
    }
  })

  it('every entry has a name field', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      expect(entry.name, `${code} missing name`).toBeTruthy()
      expect(typeof entry.name).toBe('string')
    }
  })

  it('FLAT entries have a flatRate in valid range (0 < rate < 0.15)', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'FLAT') continue
      expect(entry.flatRate, `${code} missing flatRate`).toBeDefined()
      expect(typeof entry.flatRate).toBe('number')
      expect(entry.flatRate, `${code} flatRate not in (0, 0.15)`).toBeGreaterThan(0)
      expect(entry.flatRate, `${code} flatRate not in (0, 0.15)`).toBeLessThan(0.15)
    }
  })

  it('PROGRESSIVE entries have a non-empty brackets array', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'PROGRESSIVE') continue
      expect(Array.isArray(entry.brackets), `${code} brackets must be an array`).toBe(true)
      expect(entry.brackets.length, `${code} brackets must not be empty`).toBeGreaterThan(0)
    }
  })

  it('PROGRESSIVE brackets have max and rate fields', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'PROGRESSIVE') continue
      for (const bracket of entry.brackets) {
        expect(bracket, `${code} bracket missing max`).toHaveProperty('max')
        expect(bracket, `${code} bracket missing rate`).toHaveProperty('rate')
        expect(typeof bracket.rate).toBe('number')
      }
    }
  })

  it('PROGRESSIVE bracket rates are all non-negative', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'PROGRESSIVE') continue
      for (const bracket of entry.brackets) {
        expect(bracket.rate, `${code} has negative bracket rate`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('PROGRESSIVE bracket rates are in ascending order', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'PROGRESSIVE') continue
      const rates = entry.brackets.map(b => b.rate)
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i], `${code} brackets not ascending at index ${i}`).toBeGreaterThanOrEqual(rates[i - 1])
      }
    }
  })

  it('PROGRESSIVE last bracket has Infinity max (catches all remaining income)', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'PROGRESSIVE') continue
      const last = entry.brackets[entry.brackets.length - 1]
      expect(last.max, `${code} last bracket max must be Infinity`).toBe(Infinity)
    }
  })

  it('NONE entries have no flatRate or brackets', () => {
    for (const [code, entry] of Object.entries(STATE_TAX_TABLE)) {
      if (entry.model !== 'NONE') continue
      expect(entry.flatRate, `${code} NONE state should not have flatRate`).toBeUndefined()
      expect(entry.brackets, `${code} NONE state should not have brackets`).toBeUndefined()
    }
  })

  it('MO is a PROGRESSIVE state with a 4.7% top marginal rate', () => {
    expect(STATE_TAX_TABLE['MO'].model).toBe('PROGRESSIVE')
    const moBrackets = STATE_TAX_TABLE['MO'].brackets
    const last = moBrackets[moBrackets.length - 1]
    expect(last.max).toBe(Infinity)
    expect(last.rate).toBe(0.047)
  })

  it('TX is a NONE state', () => {
    expect(STATE_TAX_TABLE['TX'].model).toBe('NONE')
  })

  it('CA is a PROGRESSIVE state', () => {
    expect(STATE_TAX_TABLE['CA'].model).toBe('PROGRESSIVE')
  })

  it('state tax models match audited classifications', () => {
    const expectedByModel = {
      NONE: ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'],
      FLAT: ['AZ', 'CO', 'GA', 'IA', 'ID', 'IL', 'IN', 'KY', 'LA', 'MI', 'MS', 'NC', 'PA', 'UT'],
      PROGRESSIVE: [
        'AL', 'AR', 'CA', 'CT', 'DC', 'DE', 'HI', 'KS', 'MA', 'MD', 'ME', 'MN', 'MO', 'MT', 'ND', 'NE',
        'NJ', 'NM', 'NY', 'OH', 'OK', 'OR', 'RI', 'SC', 'VA', 'VT', 'WI', 'WV',
      ],
    }

    for (const [model, codes] of Object.entries(expectedByModel)) {
      for (const code of codes) {
        expect(STATE_TAX_TABLE[code]?.model, `${code} should be ${model}`).toBe(model)
      }
    }
  })
})

describe('STATE_NAMES', () => {
  it('is an array', () => {
    expect(Array.isArray(STATE_NAMES)).toBe(true)
  })

  it('has the same count as STATE_TAX_TABLE', () => {
    expect(STATE_NAMES.length).toBe(Object.keys(STATE_TAX_TABLE).length)
  })

  it('each entry has code and name properties', () => {
    for (const entry of STATE_NAMES) {
      expect(entry).toHaveProperty('code')
      expect(entry).toHaveProperty('name')
      expect(typeof entry.code).toBe('string')
      expect(typeof entry.name).toBe('string')
    }
  })

  it('code values match STATE_TAX_TABLE keys', () => {
    const tableCodes = new Set(Object.keys(STATE_TAX_TABLE))
    for (const entry of STATE_NAMES) {
      expect(tableCodes.has(entry.code), `${entry.code} not in STATE_TAX_TABLE`).toBe(true)
    }
  })

  it('is sorted alphabetically by state name', () => {
    for (let i = 1; i < STATE_NAMES.length; i++) {
      expect(STATE_NAMES[i - 1].name.localeCompare(STATE_NAMES[i].name)).toBeLessThanOrEqual(0)
    }
  })
})
