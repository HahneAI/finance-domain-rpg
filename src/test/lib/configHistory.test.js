import { describe, it, expect } from 'vitest'
import { HISTORY_SENSITIVE_FIELDS, diffSensitiveFields } from '../../lib/configHistory.js'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// ─────────────────────────────────────────────────────────────
// TODO §3 phase 1 — whitelist diff that gates account_history capture
// ─────────────────────────────────────────────────────────────

describe('HISTORY_SENSITIVE_FIELDS', () => {
  it('every whitelisted field exists in DEFAULT_CONFIG (no typos, no drift)', () => {
    const missing = HISTORY_SENSITIVE_FIELDS.filter(f => !(f in DEFAULT_CONFIG))
    expect(missing).toEqual([])
  })

  it('has no duplicate entries', () => {
    expect(new Set(HISTORY_SENSITIVE_FIELDS).size).toBe(HISTORY_SENSITIVE_FIELDS.length)
  })

  it('deliberately excludes noise fields and jobApplications', () => {
    for (const f of ['setupComplete', 'goalTimelineEpochIdx', 'isInvestor', 'jobApplications', 'freedomAllowanceOverrideAck']) {
      expect(HISTORY_SENSITIVE_FIELDS).not.toContain(f)
    }
  })
})

describe('diffSensitiveFields', () => {
  it('returns [] for identical configs', () => {
    expect(diffSensitiveFields(DEFAULT_CONFIG, { ...DEFAULT_CONFIG })).toEqual([])
  })

  it('returns [] when only non-whitelisted fields change', () => {
    const next = { ...DEFAULT_CONFIG, setupComplete: true, goalTimelineEpochIdx: 12 }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual([])
  })

  it('detects a scalar pay-structure change', () => {
    const next = { ...DEFAULT_CONFIG, baseRate: 21.15 }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual(['baseRate'])
  })

  it('detects multiple changes across groups', () => {
    const next = { ...DEFAULT_CONFIG, baseRate: 21.15, userState: 'IL', newJobSeasonMode: true }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next))
      .toEqual(expect.arrayContaining(['baseRate', 'userState', 'newJobSeasonMode']))
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toHaveLength(3)
  })

  it('detects array field changes structurally (taxedWeeks)', () => {
    const next = { ...DEFAULT_CONFIG, taxedWeeks: [...DEFAULT_CONFIG.taxedWeeks, 6] }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual(['taxedWeeks'])
  })

  it('detects object-array changes (otherDeductions)', () => {
    const next = { ...DEFAULT_CONFIG, otherDeductions: [{ id: 'x', label: 'Union dues', perCheckAmount: 12 }] }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual(['otherDeductions'])
  })

  it('treats equal arrays as unchanged even across references', () => {
    const next = { ...DEFAULT_CONFIG, taxedWeeks: [...DEFAULT_CONFIG.taxedWeeks] }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual([])
  })

  it('treats undefined and null as equal (DEFAULT_CONFIG spreading on old rows)', () => {
    const old = { ...DEFAULT_CONFIG }
    delete old.maxWeeklyHours // simulates a pre-migration row missing the field
    const next = { ...DEFAULT_CONFIG, maxWeeklyHours: null }
    expect(diffSensitiveFields(old, next)).toEqual([])
  })

  it('detects null → value transitions', () => {
    const next = { ...DEFAULT_CONFIG, employerPreset: 'DHL' }
    expect(diffSensitiveFields(DEFAULT_CONFIG, next)).toEqual(['employerPreset'])
  })

  it('returns [] when either side is missing', () => {
    expect(diffSensitiveFields(null, DEFAULT_CONFIG)).toEqual([])
    expect(diffSensitiveFields(DEFAULT_CONFIG, undefined)).toEqual([])
  })
})
