import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONFIG,
  FED_BRACKETS,
  QUARTER_BOUNDARIES,
  PHASES,
  EVENT_TYPES,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  PTO_RATE,
  FISCAL_YEAR_START,
} from '../../constants/config.js'

// ─────────────────────────────────────────────────────────────
// FED_BRACKETS
// ─────────────────────────────────────────────────────────────

describe('FED_BRACKETS', () => {
  it('has exactly 4 brackets', () => {
    expect(FED_BRACKETS).toHaveLength(4)
  })

  it('final bracket has Infinity as its ceiling (catches all remaining income)', () => {
    expect(FED_BRACKETS[FED_BRACKETS.length - 1][0]).toBe(Infinity)
  })

  it('bracket ceilings are in strictly ascending order', () => {
    for (let i = 0; i < FED_BRACKETS.length - 1; i++) {
      expect(FED_BRACKETS[i][0]).toBeLessThan(FED_BRACKETS[i + 1][0])
    }
  })

  it('all rates are positive and less than 1', () => {
    for (const [, rate] of FED_BRACKETS) {
      expect(rate).toBeGreaterThan(0)
      expect(rate).toBeLessThan(1)
    }
  })

  it('rates increase with each bracket (progressive taxation)', () => {
    for (let i = 0; i < FED_BRACKETS.length - 1; i++) {
      expect(FED_BRACKETS[i][1]).toBeLessThan(FED_BRACKETS[i + 1][1])
    }
  })

  it('matches snapshot (catches accidental bracket edits)', () => {
    expect(FED_BRACKETS).toMatchSnapshot()
  })
})

// ─────────────────────────────────────────────────────────────
// DEFAULT_CONFIG
// ─────────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('matches snapshot (guards against accidental mutations)', () => {
    expect(DEFAULT_CONFIG).toMatchSnapshot()
  })

  it('contains all required income fields', () => {
    const required = ['baseRate', 'shiftHours', 'diffRate', 'otThreshold', 'otMultiplier',
      'ltd', 'k401Rate', 'k401MatchRate', 'k401StartDate',
      'ficaRate', 'taxedWeeks', 'firstActiveIdx']
    for (const field of required) {
      expect(DEFAULT_CONFIG).toHaveProperty(field)
    }
  })

  it('contains all required bucket model fields', () => {
    const required = ['bucketStartBalance', 'bucketCap', 'bucketPayoutRate']
    for (const field of required) {
      expect(DEFAULT_CONFIG).toHaveProperty(field)
    }
  })

  it('ficaRate is approximately 7.65%', () => {
    expect(DEFAULT_CONFIG.ficaRate).toBeCloseTo(0.0765)
  })

  it('otMultiplier is 1.5 (standard overtime)', () => {
    expect(DEFAULT_CONFIG.otMultiplier).toBe(1.5)
  })

  it('otThreshold is 40 hours', () => {
    expect(DEFAULT_CONFIG.otThreshold).toBe(40)
  })

  it('bucketCap is 128 hours', () => {
    expect(DEFAULT_CONFIG.bucketCap).toBe(128)
  })

  it('taxedWeeks is an array of numbers', () => {
    expect(Array.isArray(DEFAULT_CONFIG.taxedWeeks)).toBe(true)
    DEFAULT_CONFIG.taxedWeeks.forEach(w => expect(typeof w).toBe('number'))
  })

  it('k401Rate + k401MatchRate combined is at most 100%', () => {
    expect(DEFAULT_CONFIG.k401Rate + DEFAULT_CONFIG.k401MatchRate).toBeLessThanOrEqual(1)
  })

  it('all tax withholding rates are between 0 and 1', () => {
    const rates = ['w1FedRate', 'w1StateRate', 'w2FedRate', 'w2StateRate']
    for (const rate of rates) {
      expect(DEFAULT_CONFIG[rate]).toBeGreaterThan(0)
      expect(DEFAULT_CONFIG[rate]).toBeLessThan(1)
    }
  })

  it('k401StartDate is a valid ISO date string', () => {
    expect(new Date(DEFAULT_CONFIG.k401StartDate).toString()).not.toBe('Invalid Date')
  })
})

// ─────────────────────────────────────────────────────────────
// QUARTER_BOUNDARIES
// ─────────────────────────────────────────────────────────────

describe('QUARTER_BOUNDARIES', () => {
  it('has exactly 3 boundaries (Q1→Q2, Q2→Q3, Q3→Q4)', () => {
    expect(QUARTER_BOUNDARIES).toHaveLength(3)
  })

  it('boundaries are in strictly ascending date order', () => {
    expect(QUARTER_BOUNDARIES[0] < QUARTER_BOUNDARIES[1]).toBe(true)
    expect(QUARTER_BOUNDARIES[1] < QUARTER_BOUNDARIES[2]).toBe(true)
  })

  it('all boundaries are valid ISO date strings in 2026', () => {
    for (const b of QUARTER_BOUNDARIES) {
      const d = new Date(b)
      expect(d.toString()).not.toBe('Invalid Date')
      expect(b.startsWith('2026-')).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// PHASES
// ─────────────────────────────────────────────────────────────

describe('PHASES', () => {
  it('has exactly 4 quarters', () => {
    expect(PHASES).toHaveLength(4)
  })

  it('phase ids are q1 through q4 in order', () => {
    expect(PHASES.map(p => p.id)).toEqual(['q1', 'q2', 'q3', 'q4'])
  })

  it('each phase has id, label, description, and color fields', () => {
    for (const phase of PHASES) {
      expect(phase).toHaveProperty('id')
      expect(phase).toHaveProperty('label')
      expect(phase).toHaveProperty('description')
      expect(phase).toHaveProperty('color')
    }
  })

  it('all color fields are valid hex or CSS variable strings', () => {
    for (const phase of PHASES) {
      expect(phase.color).toMatch(/^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// EVENT_TYPES
// ─────────────────────────────────────────────────────────────

describe('EVENT_TYPES', () => {
  const EXPECTED_TYPES = ['missed_unpaid', 'missed_unapproved', 'pto', 'partial', 'bonus', 'other_loss']

  it('contains all 6 expected event type keys', () => {
    for (const type of EXPECTED_TYPES) {
      expect(EVENT_TYPES).toHaveProperty(type)
    }
  })

  it('each event type has label, color, and icon fields', () => {
    for (const [, val] of Object.entries(EVENT_TYPES)) {
      expect(val).toHaveProperty('label')
      expect(val).toHaveProperty('color')
      expect(val).toHaveProperty('icon')
    }
  })

  it('all color fields are valid hex or CSS variable strings', () => {
    for (const [, val] of Object.entries(EVENT_TYPES)) {
      expect(val.color).toMatch(/^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// INITIAL_EXPENSES
// ─────────────────────────────────────────────────────────────

describe('INITIAL_EXPENSES', () => {
  it('matches snapshot', () => {
    expect(INITIAL_EXPENSES).toMatchSnapshot()
  })

  it('all expenses have required fields: id, category, label, history', () => {
    for (const exp of INITIAL_EXPENSES) {
      expect(exp).toHaveProperty('id')
      expect(exp).toHaveProperty('category')
      expect(exp).toHaveProperty('label')
      expect(exp).toHaveProperty('history')
    }
  })

  it('all history entries have a 4-element weekly array (one per quarter)', () => {
    for (const exp of INITIAL_EXPENSES) {
      for (const entry of exp.history) {
        expect(entry.weekly).toHaveLength(4)
        entry.weekly.forEach(amt => expect(typeof amt).toBe('number'))
      }
    }
  })

  it('all history entries have an effectiveFrom date string', () => {
    for (const exp of INITIAL_EXPENSES) {
      for (const entry of exp.history) {
        expect(typeof entry.effectiveFrom).toBe('string')
        expect(new Date(entry.effectiveFrom).toString()).not.toBe('Invalid Date')
      }
    }
  })

  it('all expense ids are unique', () => {
    const ids = INITIAL_EXPENSES.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─────────────────────────────────────────────────────────────
// INITIAL_GOALS
// ─────────────────────────────────────────────────────────────

describe('INITIAL_GOALS', () => {
  it('matches snapshot', () => {
    expect(INITIAL_GOALS).toMatchSnapshot()
  })

  it('all goals have required fields: id, label, target, color, completed', () => {
    for (const goal of INITIAL_GOALS) {
      expect(goal).toHaveProperty('id')
      expect(goal).toHaveProperty('label')
      expect(goal).toHaveProperty('target')
      expect(goal).toHaveProperty('color')
      expect(goal).toHaveProperty('completed')
    }
  })

  it('all goals have a target > 0', () => {
    for (const goal of INITIAL_GOALS) {
      expect(goal.target).toBeGreaterThan(0)
    }
  })

  it('all goals are initially not completed', () => {
    for (const goal of INITIAL_GOALS) {
      expect(goal.completed).toBe(false)
    }
  })

  it('all goal ids are unique', () => {
    const ids = INITIAL_GOALS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all color fields are valid hex or CSS variable strings', () => {
    for (const goal of INITIAL_GOALS) {
      expect(goal.color).toMatch(/^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// PTO_RATE / FISCAL_YEAR_START
// ─────────────────────────────────────────────────────────────

describe('PTO_RATE', () => {
  it('is a positive dollar amount per hour', () => {
    expect(PTO_RATE).toBeGreaterThan(0)
  })

  it('equals DEFAULT_CONFIG.baseRate (PTO pays at the base hourly rate)', () => {
    expect(PTO_RATE).toBe(DEFAULT_CONFIG.baseRate)
  })
})

describe('FISCAL_YEAR_START', () => {
  it('is a valid ISO date string', () => {
    expect(new Date(FISCAL_YEAR_START).toString()).not.toBe('Invalid Date')
  })

  it('is a Monday (first workday of fiscal year)', () => {
    // Parse via year/month/day to avoid UTC shifts in jsdom/node
    const [y, m, d] = FISCAL_YEAR_START.split('-').map(Number)
    expect(new Date(y, m - 1, d).getDay()).toBe(1)
  })
})
