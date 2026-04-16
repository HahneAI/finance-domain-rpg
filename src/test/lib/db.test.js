import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  supabase: { from: vi.fn() },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase } from '../../lib/supabase.js'
import { loadUserData, saveUserData } from '../../lib/db.js'

// ─────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────

/** Wire up loadUserData's two .single() calls with controlled responses. */
function setupLoadMock(mainRowData, wcRowData = { week_confirmations: {} }) {
  const single = vi.fn()
    .mockResolvedValueOnce({ data: mainRowData, error: null })
    .mockResolvedValueOnce({ data: wcRowData, error: null })
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single }),
    }),
  })
}

/** Wire up loadUserData to simulate a missing row (error path). */
function setupLoadError() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } })
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
    is_dhl:    false,
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
  it('returns all defaults when Supabase returns an error', async () => {
    setupLoadError()
    const result = await loadUserData()
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.expenses).toEqual(INITIAL_EXPENSES)
    expect(result.goals).toEqual(INITIAL_GOALS)
    expect(result.logs).toEqual(INITIAL_LOGS)
    expect(result.showExtra).toBe(true)
    expect(result.weekConfirmations).toEqual({})
    expect(result.isDHL).toBe(false)
    expect(result.isAdmin).toBe(false)
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
    setupLoadMock(makeRow({ config: oldConfig, is_dhl: false }))

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
  it('stamps DHL preset when is_dhl=true and setupComplete is absent', async () => {
    const oldDhlConfig = {
      ...DEFAULT_CONFIG,
      setupComplete: false,  // not yet through wizard
      w1FedRate: 0.08,
      w2FedRate: 0.13,
      w1StateRate: 0.03,
      w2StateRate: 0.04,
    }
    setupLoadMock(makeRow({ config: oldDhlConfig, is_dhl: true }))

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
    setupLoadMock(makeRow({ config: oldDhlConfig, is_dhl: true }))

    const result = await loadUserData()
    expect(result.config.fedRateLow).toBe(0.082)
    expect(result.config.fedRateHigh).toBe(0.134)
    expect(result.config.stateRateLow).toBe(0.033)
    expect(result.config.stateRateHigh).toBe(0.042)
  })

  it('does NOT fire migration when setupComplete is already true', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: true, employerPreset: 'DHL' }
    setupLoadMock(makeRow({ config, is_dhl: true }))

    const result = await loadUserData()
    // Should not overwrite existing setup
    expect(result.config.setupComplete).toBe(true)
    expect(result.config.employerPreset).toBe('DHL')
  })

  it('does NOT fire migration when is_dhl is false', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: false }
    setupLoadMock(makeRow({ config, is_dhl: false }))

    const result = await loadUserData()
    // Standard user — no DHL fields stamped
    expect(result.config.employerPreset).toBeNull()
  })
})

describe('loadUserData — rotation correction', () => {
  it('corrects dhlTeam=null to B + custom schedule when is_dhl=true', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      employerPreset: 'DHL',
      dhlTeam: null,            // never corrected pre-wizard
    startingWeekIsLong: true, // wrong initial value — gets corrected to false
    }
    setupLoadMock(makeRow({ config, is_dhl: true }))

    const result = await loadUserData()
    expect(result.config.dhlTeam).toBe('B')
    expect(result.config.dhlCustomSchedule).toBe(false)   // Phase 4: migrated
    expect(result.config.customWeeklyHours).toBe(60)       // Phase 4: auto-migrated
    expect(result.config.startingWeekIsLong).toBe(false)
  })

  it('does NOT fire rotation correction when dhlTeam is already set', async () => {
    const config = { ...DEFAULT_CONFIG, setupComplete: true, employerPreset: 'DHL', dhlTeam: 'A' }
    setupLoadMock(makeRow({ config, is_dhl: true }))

    const result = await loadUserData()
    expect(result.config.dhlTeam).toBe('A')  // unchanged
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
    expect(upsertData.is_dhl).toBe(true)
    expect(upsertData.config).toBe(payload.config)
    expect(upsertData.user_id).toBe('test-user-id')
  })

  it('sets is_dhl=false when employerPreset is not DHL', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ upsert: mockUpsert })

    await saveUserData({
      config: { ...DEFAULT_CONFIG, employerPreset: null },
      expenses: [], goals: [], logs: [], showExtra: false, weekConfirmations: {},
    })

    const [upsertData] = mockUpsert.mock.calls[0]
    expect(upsertData.is_dhl).toBe(false)
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
})
