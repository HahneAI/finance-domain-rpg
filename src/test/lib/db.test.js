import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_CONFIG,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  INITIAL_LOGS,
  FISCAL_YEAR_START,
} from '../../constants/config.js'

// ─────────────────────────────────────────────────────────────
// Mock Supabase — must be declared before any imports that trigger db.js
// ─────────────────────────────────────────────────────────────
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
  getCachedAuthSnapshot: vi.fn().mockReturnValue({ accessToken: 'tok-123', userId: 'test-user-id' }),
}))

import { getCachedAuthSnapshot, getCurrentUserId, supabase } from '../../lib/supabase.js'
import { loadUserData, saveUserData, syncUserProfile, saveConfigSnapshot, fetchConfigHistoryMeta, flushUserDataKeepalive } from '../../lib/db.js'

// ─────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────

/** Wire up loadUserData's three .single() calls with controlled responses. */
function setupLoadMock(mainRowData, wcRowData = { week_confirmations: {} }, subRowData = {}) {
  const single = vi.fn()
    .mockResolvedValueOnce({ data: mainRowData, error: null })
    .mockResolvedValueOnce({ data: wcRowData, error: null })
    .mockResolvedValueOnce({ data: subRowData, error: null })
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single }),
    }),
  })
}

/** Wire up loadUserData to simulate a genuinely missing row (PGRST116 — .single() matched 0 rows). */
function setupLoadNoRow() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows', code: 'PGRST116' } })
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single }),
    }),
  })
}

/** Wire up loadUserData to simulate a transient/non-missing-row query failure. */
function setupLoadTransientError() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection refused' } })
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single }),
    }),
  })
}

/** Minimal valid row for loadUserData — passes all guard clauses without triggering migrations. */
function makeRow(overrides = {}) {
  return {
    config:    { ...DEFAULT_CONFIG, setupComplete: true },
    expenses:  [],
    goals:     [],
    logs:      [],
    show_extra: true,
    is_employer_dhl:    false,
    is_admin:  false,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadUserData — no row / error fallback', () => {
  it('returns all defaults when Supabase genuinely finds no row (PGRST116)', async () => {
    setupLoadNoRow()
    const result = await loadUserData()
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.expenses).toEqual(INITIAL_EXPENSES)
    expect(result.goals).toEqual(INITIAL_GOALS)
    expect(result.logs).toEqual(INITIAL_LOGS)
    expect(result.showExtra).toBe(true)
    expect(result.weekConfirmations).toEqual({})
    expect(result.isEmployerDHL).toBe(false)
    expect(result.isAdmin).toBe(false)
    expect(result.isTester).toBe(false)
  })

  // Regression: a transient failure (network blip, timeout, RLS hiccup — anything
  // that isn't a confirmed zero-row result) must NOT be treated as "brand new
  // account." Doing so silently reset config to DEFAULT_CONFIG (setupComplete:false)
  // and re-opened the setup wizard for existing users — most visibly on a PWA
  // resuming from background, where a momentary fetch failure is common.
  it('throws instead of falling back to defaults on a non-missing-row error', async () => {
    setupLoadTransientError()
    await expect(loadUserData()).rejects.toThrow(/loadUserData query failed/)
  })
})

describe('loadUserData — config merge', () => {
  it('fills in missing DEFAULT_CONFIG fields for existing rows', async () => {
    // Row has an old config that lacks wizard fields
    const oldConfig = {
      baseRate: 22.00,
      shiftHours: 12,
      // Missing: setupComplete, taxExemptOptIn, paycheckBuffer, employerPreset, etc.
    }
    setupLoadMock(makeRow({ config: oldConfig, is_employer_dhl: false }))

    const result = await loadUserData()

    // Wizard fields should come from DEFAULT_CONFIG
    expect(result.config.setupComplete).toBeDefined()
    expect(result.config.paycheckBuffer).toBe(DEFAULT_CONFIG.paycheckBuffer)
    expect(result.config.ficaRate).toBe(DEFAULT_CONFIG.ficaRate)
    // User's own field preserved
    expect(result.config.baseRate).toBe(22.00)
  })

  it('preserves user config values over defaults', async () => {
    const userConfig = { ...DEFAULT_CONFIG, setupComplete: true, baseRate: 25.00, k401Rate: 0.10 }
    setupLoadMock(makeRow({ config: userConfig }))

    const result = await loadUserData()
    expect(result.config.baseRate).toBe(25.00)
    expect(result.config.k401Rate).toBe(0.10)
  })
})

describe('loadUserData — loan history regeneration', () => {
  it('regenerates history from loanMeta on every load', async () => {
    const loanMeta = {
      totalAmount: 3000,
      paymentAmount: 250,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-07-01',
    }
    const expense = {
      id: 'loan-1',
      type: 'loan',
      label: 'Car Loan',
      loanMeta,
      history: [],  // stale empty history
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migratedLoan = result.expenses.find(e => e.id === 'loan-1')
    // History should be freshly built from loanMeta (2-entry array)
    expect(migratedLoan.history).toHaveLength(2)
    expect(migratedLoan.history[0].weekly).toHaveLength(4)  // 4 quarters
    expect(migratedLoan.history[1].weekly).toEqual([0, 0, 0, 0]) // zeroes at payoff
  })

  it('loan history regeneration is idempotent (same result on second call)', async () => {
    const loanMeta = {
      totalAmount: 1200,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-08-01',
    }
    const expense = { id: 'loan-2', type: 'loan', label: 'Loan', loanMeta, history: [] }

    setupLoadMock(makeRow({ expenses: [expense] }))
    const first = await loadUserData()

    vi.clearAllMocks()
    setupLoadMock(makeRow({ expenses: [expense] }))
    const second = await loadUserData()

    const h1 = first.expenses.find(e => e.id === 'loan-2').history
    const h2 = second.expenses.find(e => e.id === 'loan-2').history
    expect(h1).toEqual(h2)
  })
})

describe('loadUserData — legacy weekly→history migration', () => {
  it('promotes weekly array to history entry with FISCAL_YEAR_START effectiveFrom', async () => {
    const expense = {
      id: 'exp-1',
      label: 'Rent',
      weekly: [500, 500, 550, 550],  // old format — no history
      // no history field
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-1')
    expect(migrated.history).toHaveLength(1)
    expect(migrated.history[0].effectiveFrom).toBe(FISCAL_YEAR_START)
    expect(migrated.history[0].weekly).toEqual([500, 500, 550, 550])
  })

  it('does not re-migrate an expense that already has history', async () => {
    const expense = {
      id: 'exp-2',
      label: 'Groceries',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [150, 150, 160, 160] }],
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-2')
    expect(migrated.history).toHaveLength(1)
    expect(migrated.history[0].weekly).toEqual([150, 150, 160, 160])
  })
})

describe('loadUserData — Q4 quarterly expansion', () => {
  it('extends history entry weekly from 3 to 4 values by copying Q3', async () => {
    const expense = {
      id: 'exp-3',
      label: 'Phone',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [40, 40, 45] }],
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-3')
    expect(migrated.history[0].weekly).toEqual([40, 40, 45, 45])
  })

  it('does not alter weekly arrays already at length 4', async () => {
    const expense = {
      id: 'exp-4',
      label: 'Gym',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [30, 30, 35, 35] }],
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-4')
    expect(migrated.history[0].weekly).toEqual([30, 30, 35, 35])
  })

  it('extends note array from 3 to 4 by copying Q3', async () => {
    const expense = {
      id: 'exp-5',
      label: 'Internet',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [25, 25, 25, 25] }],
      note: ['Jan note', 'Apr note', 'Jul note'],  // 3-element
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-5')
    expect(migrated.note).toEqual(['Jan note', 'Apr note', 'Jul note', 'Jul note'])
  })

  it('does not alter note arrays already at length 4', async () => {
    const expense = {
      id: 'exp-6',
      label: 'Gas',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [20, 20, 20, 20] }],
      note: ['Q1', 'Q2', 'Q3', 'Q4'],
    }
    setupLoadMock(makeRow({ expenses: [expense] }))

    const result = await loadUserData()
    const migrated = result.expenses.find(e => e.id === 'exp-6')
    expect(migrated.note).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })
})

describe('loadUserData — Food signal + setup default injection', () => {
  it('injects default Food expense during first-time setup when none exists', async () => {
    const preSetupConfig = { ...DEFAULT_CONFIG, setupComplete: false }
    setupLoadMock(makeRow({ config: preSetupConfig, expenses: [] }))

    const result = await loadUserData()
    const food = result.expenses.find(e => e.isFoodPrimary)
    expect(food).toBeTruthy()
    expect(food.category).toBe('Needs')
    expect(food.label).toBe('Food')
    expect(food.isFoodHighlighted).toBe(true)
    expect(food.billingMeta?.amount).toBe(400)
  })

  it('does not inject default Food expense for setup-complete users', async () => {
    setupLoadMock(makeRow({ config: { ...DEFAULT_CONFIG, setupComplete: true }, expenses: [] }))
    const result = await loadUserData()
    expect(result.expenses).toHaveLength(0)
  })

  it('normalizes legacy Food-labeled Needs expense into food signal flags', async () => {
    const expense = {
      id: 'exp-food-legacy',
      category: 'Needs',
      label: 'Food',
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [100, 100, 100, 100] }],
    }
    setupLoadMock(makeRow({ config: { ...DEFAULT_CONFIG, setupComplete: true }, expenses: [expense] }))
    const result = await loadUserData()
    const normalized = result.expenses[0]
    expect(normalized.isFoodPrimary).toBe(true)
    expect(normalized.isFoodHighlighted).toBe(true)
    expect(normalized.category).toBe('Needs')
  })
})

describe('loadUserData — pre-wizard DHL migration', () => {
  it('stamps DHL preset when is_employer_dhl=true and setupComplete is absent', async () => {
    const oldDhlConfig = {
      ...DEFAULT_CONFIG,
      setupComplete: false,  // not yet through wizard
      w1FedRate: 0.08,
      w2FedRate: 0.13,
      w1StateRate: 0.03,
      w2StateRate: 0.04,
    }
    setupLoadMock(makeRow({ config: oldDhlConfig, is_employer_dhl: true }))

    const result = await loadUserData()
    expect(result.config.employerPreset).toBe('DHL')
    expect(result.config.dhlTeam).toBe('B')
    expect(result.config.dhlCustomSchedule).toBe(false)   // Phase 4: migrated away from legacy flag
    expect(result.config.customWeeklyHours).toBe(60)       // Phase 4: auto-migrated to customWeeklyHours
    expect(result.config.startingWeekIsLong).toBe(false)
    expect(result.config.startingWeekIsHeavy).toBeUndefined()
    expect(result.config.setupComplete).toBe(true)
  })

  it('promotes w1/w2 rate fields to fedRateLow/High when rates are at default', async () => {
    const oldDhlConfig = {
      ...DEFAULT_CONFIG,
      setupComplete: false,
      // rates are at DEFAULT_CONFIG values (trigger promotion)
      fedRateLow: DEFAULT_CONFIG.fedRateLow,
      w1FedRate: 0.082,
      w2FedRate: 0.134,
      w1StateRate: 0.033,
      w2StateRate: 0.042,
    }
    setupLoadMock(makeRow({ config: oldDhlConfig, is_employer_dhl: true }))

    const result = await loadUserData()
    expect(result.config.fedRateLow).toBe(0.082)
    expect(result.config.fedRateHigh).toBe(0.134)
    expect(result.config.stateRateLow).toBe(0.033)
    expect(result.config.stateRateHigh).toBe(0.042)
  })

  it('does NOT fire migration when setupComplete is already true', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: true, employerPreset: 'DHL' }
    setupLoadMock(makeRow({ config, is_employer_dhl: true }))

    const result = await loadUserData()
    // Should not overwrite existing setup
    expect(result.config.setupComplete).toBe(true)
    expect(result.config.employerPreset).toBe('DHL')
  })

  it('does NOT fire migration when is_employer_dhl is false', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: false }
    setupLoadMock(makeRow({ config, is_employer_dhl: false }))

    const result = await loadUserData()
    // Standard user — no DHL fields stamped
    expect(result.config.employerPreset).toBeNull()
  })
})

describe('loadUserData — rotation correction', () => {
  it('corrects dhlTeam=null to B + custom schedule when is_employer_dhl=true', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      employerPreset: 'DHL',
      dhlTeam: null,            // never corrected pre-wizard
    startingWeekIsLong: true, // wrong initial value — gets corrected to false
    }
    setupLoadMock(makeRow({ config, is_employer_dhl: true }))

    const result = await loadUserData()
    expect(result.config.dhlTeam).toBe('B')
    expect(result.config.dhlCustomSchedule).toBe(false)   // Phase 4: migrated
    expect(result.config.customWeeklyHours).toBe(60)       // Phase 4: auto-migrated
    expect(result.config.startingWeekIsLong).toBe(false)
  })

  it('does NOT fire rotation correction when dhlTeam is already set', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: true, employerPreset: 'DHL', dhlTeam: 'A' }
    setupLoadMock(makeRow({ config, is_employer_dhl: true }))

    const result = await loadUserData()
    expect(result.config.dhlTeam).toBe('A')  // unchanged
  })
})

describe('loadUserData — taxExemptOptIn clears taxedWeeks', () => {
  it('clears taxedWeeks when taxExemptOptIn is true and array is non-empty', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      taxExemptOptIn: true,
      taxedWeeks: [5, 6, 7, 8, 9, 10],
    }
    setupLoadMock(makeRow({ config }))
    const result = await loadUserData()
    expect(result.config.taxedWeeks).toEqual([])
  })

  it('leaves taxedWeeks alone when taxExemptOptIn is false', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      taxExemptOptIn: false,
      taxedWeeks: [7, 8, 19, 20],
    }
    setupLoadMock(makeRow({ config }))
    const result = await loadUserData()
    expect(result.config.taxedWeeks).toEqual([7, 8, 19, 20])
  })

  it('is a no-op when taxExemptOptIn is true but taxedWeeks is already empty', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      taxExemptOptIn: true,
      taxedWeeks: [],
    }
    setupLoadMock(makeRow({ config }))
    const result = await loadUserData()
    expect(result.config.taxedWeeks).toEqual([])
  })
})

describe('loadUserData — goals and logs fallback', () => {
  it('returns empty array for goals when row has empty goals (new user isolation)', async () => {
    setupLoadMock(makeRow({ goals: [] }))
    const result = await loadUserData()
    expect(result.goals).toEqual([])
  })

  it('returns empty array for logs when row has empty logs (new user isolation)', async () => {
    setupLoadMock(makeRow({ logs: [] }))
    const result = await loadUserData()
    expect(result.logs).toEqual([])
  })

  it('preserves non-empty goals from the row', async () => {
    const goals = [{ id: 'g1', label: 'Car', target: 5000, color: '#fff', completed: false }]
    setupLoadMock(makeRow({ goals }))
    const result = await loadUserData()
    expect(result.goals).toEqual(goals)
  })
})

describe('loadUserData — misc fields', () => {
  it('surfaces is_admin flag from row', async () => {
    setupLoadMock(makeRow({ is_admin: true }))
    const result = await loadUserData()
    expect(result.isAdmin).toBe(true)
  })

  it('surfaces is_tester flag from row', async () => {
    setupLoadMock(makeRow({ is_tester: true }))
    const result = await loadUserData()
    expect(result.isTester).toBe(true)
  })

  it('defaults isTester to false when the column is absent from the row', async () => {
    setupLoadMock(makeRow())
    const result = await loadUserData()
    expect(result.isTester).toBe(false)
  })

  it('surfaces week_confirmations from second Supabase query', async () => {
    const wc = { '7': true, '8': false }
    setupLoadMock(makeRow(), { week_confirmations: wc })
    const result = await loadUserData()
    expect(result.weekConfirmations).toEqual(wc)
  })

  it('defaults weekConfirmations to {} when second query returns null', async () => {
    setupLoadMock(makeRow(), null)
    const result = await loadUserData()
    expect(result.weekConfirmations).toEqual({})
  })

  it('maps pto_goal column to the ptoGoal field', async () => {
    const ptoGoal = { targetHours: 96, accruedHours: 24 }
    setupLoadMock(makeRow({ pto_goal: ptoGoal }))

    const result = await loadUserData()
    expect(result.ptoGoal).toEqual(ptoGoal)
  })

  it('defaults ptoGoal to null when Supabase row omits the column', async () => {
    setupLoadMock(makeRow())
    const result = await loadUserData()
    expect(result.ptoGoal).toBeNull()
  })
})

describe('loadUserData — subscription mapping (migration 017)', () => {
  it('maps subscription columns from the third Supabase query', async () => {
    const subRow = {
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_456',
      subscription_status: 'active',
      trial_started_at: '2026-01-01T00:00:00.000Z',
      trial_ends_at: '2026-01-15T00:00:00.000Z',
      access_ends_at: '2026-01-22T00:00:00.000Z',
      card_on_file: true,
      last_dunning_email_at: null,
      dunning_email_count: 0,
      current_period_end: '2026-02-01T00:00:00.000Z',
      plan: 'monthly',
    }
    setupLoadMock(makeRow(), { week_confirmations: {} }, subRow)
    const result = await loadUserData()
    expect(result.subscription).toEqual({
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_456',
      status: 'active',
      trialStartedAt: '2026-01-01T00:00:00.000Z',
      trialEndsAt: '2026-01-15T00:00:00.000Z',
      accessEndsAt: '2026-01-22T00:00:00.000Z',
      cardOnFile: true,
      lastDunningEmailAt: null,
      dunningEmailCount: 0,
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      plan: 'monthly',
    })
  })

  it('falls back to DEFAULT_SUBSCRIPTION when the third query returns null (migration not yet run)', async () => {
    setupLoadMock(makeRow(), { week_confirmations: {} }, null)
    const result = await loadUserData()
    expect(result.subscription).toEqual({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: null,
      trialStartedAt: null,
      trialEndsAt: null,
      accessEndsAt: null,
      cardOnFile: false,
      lastDunningEmailAt: null,
      dunningEmailCount: 0,
      currentPeriodEnd: null,
      plan: null,
    })
  })
})

describe('saveUserData', () => {
  it('calls supabase.from upsert with correct shape', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    const payload = {
      config: { ...DEFAULT_CONFIG, employerPreset: 'DHL' },
      expenses: [],
      goals: [],
      logs: [],
      showExtra: true,
      weekConfirmations: {},
    }
    await saveUserData(payload)

    expect(supabase.from).toHaveBeenCalledWith('user_data')
    const [upsertData] = mockUpsert.mock.calls[0]
    expect(upsertData.is_employer_dhl).toBe(true)
    expect(upsertData.config).toBe(payload.config)
    expect(upsertData.user_id).toBe('test-user-id')
  })

  it('sets is_employer_dhl=false when employerPreset is not DHL', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    await saveUserData({
      config: { ...DEFAULT_CONFIG, employerPreset: null },
      expenses: [], goals: [], logs: [], showExtra: false, weekConfirmations: {},
    })

    const [upsertData] = mockUpsert.mock.calls[0]
    expect(upsertData.is_employer_dhl).toBe(false)
  })

  it('persists ptoGoal payloads as pto_goal during save', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    const ptoGoal = { targetHours: 120, accruedHours: 32 }
    await saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true,
      weekConfirmations: {}, ptoGoal,
    })

    const [upsertData] = mockUpsert.mock.calls[0]
    expect(upsertData.pto_goal).toEqual(ptoGoal)
  })

  it('writes null to pto_goal when ptoGoal is undefined', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    await saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true,
      weekConfirmations: {},
    })

    const [upsertData] = mockUpsert.mock.calls[0]
    expect(upsertData.pto_goal).toBeNull()
  })

  it('logs error message when upsert fails (line 149 error branch)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockUpsert = vi.fn().mockResolvedValue({ error: { message: 'Connection refused' } })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    await saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true, weekConfirmations: {},
    })

    expect(consoleSpy).toHaveBeenCalledWith('Failed to save user data:', 'Connection refused')
    consoleSpy.mockRestore()
  })

  // App.jsx's eager-save helper (savePersistedStateNow) awaits this return
  // value to decide whether to surface a SaveFailedBanner and schedule a
  // retry — must accurately reflect success/failure, not just log-and-swallow.
  it('resolves true on a successful upsert', async () => {
    supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) })
    await expect(saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true, weekConfirmations: {},
    })).resolves.toBe(true)
  })

  it('resolves false on a failed upsert', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'Connection refused' } }) })
    await expect(saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true, weekConfirmations: {},
    })).resolves.toBe(false)
    consoleSpy.mockRestore()
  })

  it('resolves false when unauthenticated (no userId)', async () => {
    getCurrentUserId.mockResolvedValueOnce(null)
    await expect(saveUserData({
      config: DEFAULT_CONFIG,
      expenses: [], goals: [], logs: [], showExtra: true, weekConfirmations: {},
    })).resolves.toBe(false)
  })
})

// Regression coverage for the unload-time hardening: a plain fetch (what
// saveUserData issues via supabase-js) can be aborted mid-flight when the page
// actually unloads or a backgrounded mobile tab gets reclaimed, silently
// dropping whatever hadn't saved yet. flushUserDataKeepalive bypasses
// supabase-js and issues a raw keepalive:true fetch so the browser can finish
// the request after the page is gone.
describe('flushUserDataKeepalive', () => {
  const payload = {
    config: { ...DEFAULT_CONFIG, employerPreset: 'DHL' },
    expenses: [], goals: [], logs: [], showExtra: true, weekConfirmations: { 5: { confirmedAt: 'x' } },
    ptoGoal: 40,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    getCachedAuthSnapshot.mockReturnValue({ accessToken: 'tok-123', userId: 'test-user-id' })
  })

  it('issues a keepalive fetch directly to the PostgREST upsert endpoint', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    flushUserDataKeepalive(payload)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toMatch(/\/rest\/v1\/user_data\?on_conflict=user_id$/)
    expect(options.method).toBe('POST')
    expect(options.keepalive).toBe(true)
    expect(options.headers.Authorization).toBe('Bearer tok-123')
    expect(options.headers.Prefer).toBe('resolution=merge-duplicates,return=minimal')

    const body = JSON.parse(options.body)
    expect(body.user_id).toBe('test-user-id')
    expect(body.is_employer_dhl).toBe(true)
    expect(body.pto_goal).toBe(40)
    expect(body.week_confirmations).toEqual({ 5: { confirmedAt: 'x' } })
  })

  it('writes null to pto_goal when ptoGoal is undefined', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    flushUserDataKeepalive({ ...payload, ptoGoal: undefined })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.pto_goal).toBeNull()
  })

  it('does not fetch when there is no cached access token or user id', () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    getCachedAuthSnapshot.mockReturnValue({ accessToken: null, userId: null })

    flushUserDataKeepalive(payload)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to the normal supabase upsert when fetch throws synchronously (e.g. keepalive body-size limit)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError('keepalive body exceeds limit') }))
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    flushUserDataKeepalive(payload)
    // saveUserData's fallback path awaits getCurrentUserId() before upserting —
    // let that microtask settle before asserting.
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1))
    consoleSpy.mockRestore()
  })
})

/** Wire up syncUserProfile's profile-metadata upsert() + auth.getSession(). */
function setupSyncProfileMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  supabase.from.mockReturnValue({ upsert })
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  return { upsert }
}

describe('syncUserProfile — profile metadata + trial seeding (migration 017/019)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls the service-role seed-trial route with the session bearer token', async () => {
    setupSyncProfileMock()
    await syncUserProfile({ id: 'test-user-id', user_metadata: {} })

    expect(fetch).toHaveBeenCalledWith('/api/seed-trial', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
    }))
  })

  it('skips the seed-trial call when there is no active session', async () => {
    setupSyncProfileMock()
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    await syncUserProfile({ id: 'test-user-id', user_metadata: {} })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not write display_name/avatar_url when no OAuth metadata is present', async () => {
    const { upsert } = setupSyncProfileMock()
    await syncUserProfile({ id: 'test-user-id', user_metadata: {} })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('upserts OAuth profile metadata (display_name/avatar_url) directly — still client-writable', async () => {
    const { upsert } = setupSyncProfileMock()
    await syncUserProfile({
      id: 'test-user-id',
      user_metadata: { full_name: 'Anthony Hahne', avatar_url: 'https://example.com/a.png' },
    })

    const [patch] = upsert.mock.calls[0]
    expect(patch.display_name).toBe('Anthony Hahne')
    expect(patch.avatar_url).toBe('https://example.com/a.png')
    expect(patch.trial_started_at).toBeUndefined()
    expect(patch.subscription_status).toBeUndefined()
  })

  it('no-ops when user has no id', async () => {
    setupSyncProfileMock()
    await syncUserProfile(null)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// TODO §19 phase 1 — account_history write path (migration 020)
// ─────────────────────────────────────────────────────────────

describe('saveConfigSnapshot', () => {
  it('inserts the full new config + metadata into account_history', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ insert: mockInsert })

    const config = { ...DEFAULT_CONFIG, baseRate: 21.15 }
    await saveConfigSnapshot({
      config,
      changedFields: ['baseRate'],
      source: 'profile_edit',
      effectiveFrom: '2026-07-06',
    })

    expect(supabase.from).toHaveBeenCalledWith('account_history')
    const [row] = mockInsert.mock.calls[0]
    expect(row.user_id).toBe('test-user-id')
    expect(row.snapshot).toBe(config)
    expect(row.changed_fields).toEqual(['baseRate'])
    expect(row.source).toBe('profile_edit')
    expect(row.effective_from).toBe('2026-07-06')
  })

  it('logs and swallows the error when the table is missing (migration 020 not run)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'relation "account_history" does not exist' } })
    supabase.from.mockReturnValue({ insert: mockInsert })

    await expect(saveConfigSnapshot({
      config: DEFAULT_CONFIG, changedFields: ['baseRate'],
      source: 'config_edit', effectiveFrom: '2026-07-06',
    })).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to save config snapshot:',
      'relation "account_history" does not exist',
    )
    consoleSpy.mockRestore()
  })
})

describe('fetchConfigHistoryMeta', () => {
  function setupHistoryMetaMock(result) {
    const limit = vi.fn().mockResolvedValue(result)
    const order = vi.fn().mockReturnValue({ limit })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    supabase.from.mockReturnValue({ select })
    return { select, eq }
  }

  it('returns count and the latest row', async () => {
    const latest = {
      effective_from: '2026-07-06',
      changed_fields: ['baseRate'],
      source: 'profile_edit',
      created_at: '2026-07-06T15:00:00Z',
    }
    setupHistoryMetaMock({ data: [latest], error: null, count: 4 })

    const meta = await fetchConfigHistoryMeta()
    expect(supabase.from).toHaveBeenCalledWith('account_history')
    expect(meta).toEqual({ count: 4, latest })
  })

  it('returns { error } when the table is missing', async () => {
    setupHistoryMetaMock({ data: null, error: { message: 'relation "account_history" does not exist' }, count: null })
    const meta = await fetchConfigHistoryMeta()
    expect(meta).toEqual({ error: 'relation "account_history" does not exist' })
  })

  it('returns count 0 with null latest for an empty table', async () => {
    setupHistoryMetaMock({ data: [], error: null, count: 0 })
    const meta = await fetchConfigHistoryMeta()
    expect(meta).toEqual({ count: 0, latest: null })
  })
})
