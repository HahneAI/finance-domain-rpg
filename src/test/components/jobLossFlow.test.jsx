import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JobLossEntry } from '../../components/JobLossEntry.jsx'
import { LifeEventMenu } from '../../components/LifeEventMenu.jsx'
import { RateUpdateModal } from '../../components/RateUpdateModal.jsx'
import { JobLossHomePanel } from '../../components/JobLossHomePanel.jsx'
import { JobLossBudgetPanel } from '../../components/JobLossBudgetPanel.jsx'
import { ReemploymentTracker } from '../../components/ReemploymentTracker.jsx'
import { DEFAULT_CONFIG, INITIAL_EXPENSES } from '../../constants/config.js'
import { resolveLastPayPeriodEnd, resolvePendingCheckArrivalDate, estimatePendingCheckAmount } from '../../lib/jobLossRunway.js'
import { toLocalIso } from '../../lib/finance.js'

// jsdom doesn't implement scrollIntoView — JobHuntChatPanel (§18.E, mounted
// inside JobLossHomePanel when canAccessAiFeatures is true) calls it on
// every message-list update to keep the latest turn in view.
Element.prototype.scrollIntoView ??= () => {}

// CoachNetWorthCard (mounted inside JobLossHomePanel per the DW-8 fix) calls
// chatWithCoach — mocked here the same way CoachNetWorthCard.test.jsx does,
// so these tests never touch the network/API key.
const { coachMocks } = vi.hoisted(() => ({ coachMocks: { chatWithCoach: vi.fn() } }))
vi.mock('../../lib/claude.js', () => ({ chatWithCoach: coachMocks.chatWithCoach }))
function chunkGenerator(chunks) {
  return async function* () {
    for (const c of chunks) yield c
  }
}

// ResumeReviewCard (mounted inside JobLossHomePanel when canAccessAiFeatures
// is true, §18.E1) reads/writes via lib/db.js — mocked so its effects never
// touch the real Supabase client, which would otherwise throw at import time
// in this test environment (no VITE_SUPABASE_URL set).
vi.mock('../../lib/db.js', () => ({
  loadResumeProfile: vi.fn().mockResolvedValue(null),
  saveResumeProfile: vi.fn().mockResolvedValue(true),
  saveCoachChat: vi.fn().mockResolvedValue('chat-id'),
}))

const JOB_LOSS_CONFIG = {
  ...DEFAULT_CONFIG,
  jobLossMode: true,
  jobLossDate: '2026-06-01',
  unemploymentEnabled: true,
  unemploymentWeekly: 320,
  unemploymentDurationWeeks: 12,
  baseRate: 20,
  maxWeeklyHours: 40,
}

// ─────────────────────────────────────────────────────────────
// LifeEventMenu
// ─────────────────────────────────────────────────────────────

describe('LifeEventMenu', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<LifeEventMenu open={false} onClose={() => {}} onSelect={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows all three life-event tiles when open', () => {
    render(<LifeEventMenu open onClose={() => {}} onSelect={() => {}} />)
    expect(screen.getByText('Pay Structure Changed')).toBeTruthy()
    expect(screen.getByText('Lost My Job')).toBeTruthy()
    expect(screen.getByText('Quick Rate Update')).toBeTruthy()
  })

  it('routes "Lost My Job" to the job_loss sentinel', () => {
    const onSelect = vi.fn()
    render(<LifeEventMenu open onClose={() => {}} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Lost My Job'))
    expect(onSelect).toHaveBeenCalledWith('job_loss')
  })

  it('routes "Pay Structure Changed" to the structure_change wizard', () => {
    const onSelect = vi.fn()
    render(<LifeEventMenu open onClose={() => {}} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Pay Structure Changed'))
    expect(onSelect).toHaveBeenCalledWith('structure_change')
  })

  it('routes "Quick Rate Update" to the rate_update modal (TODO §15.D, no longer Coming Soon)', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<LifeEventMenu open onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Quick Rate Update'))
    expect(onSelect).toHaveBeenCalledWith('rate_update')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<LifeEventMenu open onClose={onClose} onSelect={() => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// JobLossEntry
// ─────────────────────────────────────────────────────────────

describe('JobLossEntry', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<JobLossEntry open={false} onClose={() => {}} onActivate={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('disables Next until the unemployment question is answered', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText('Enter Job Loss Mode')).toBeTruthy() // still on Step 0
  })

  it('activates with unemployment disabled when the user answers No', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<JobLossEntry open onClose={onClose} onActivate={onActivate} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // unemployment
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1 (pending check)
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // pending check
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
      jobLossMode: true,
      jobLossCashOnHand: 2000,
      jobLossPendingCheckAmount: null,
      jobLossPendingCheckDate: null,
      unemploymentEnabled: false,
      unemploymentWeekly: null,
      unemploymentDurationWeeks: null,
      unemploymentWaitingWeek: false,
    }))
    expect(onClose).toHaveBeenCalled()
  })

  it('requires weekly amount and duration when the user answers Yes', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText('Enter Job Loss Mode')).toBeTruthy() // blocked, still Step 0

    fireEvent.change(screen.getByPlaceholderText('e.g. 400'), { target: { value: '350' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 26'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // pending check
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
      jobLossMode: true,
      jobLossCashOnHand: 2000,
      unemploymentEnabled: true,
      unemploymentWeekly: 350,
      unemploymentDurationWeeks: 20,
      unemploymentWaitingWeek: true, // default: most states have a waiting week
    }))
  })

  it('cancels without activating', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<JobLossEntry open onClose={onClose} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })

  // TODO §15.H13 — cash on hand is mandatory: blocks Next/Activate while
  // empty, accepts 0 as a real answer, shows the red-border/required state
  // only after a failed attempt (not on first render).
  it('blocks Next until cash on hand is entered, with no red border before the first attempt', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    const cashInput = screen.getByPlaceholderText('e.g. 1,023')
    expect(cashInput.style.border).not.toContain('deduction')
    expect(screen.queryByText(/Required — 0 is a fine answer/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText(/Required — 0 is a fine answer/i)).toBeTruthy()
  })

  it('accepts 0 as a valid cash-on-hand answer', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // unemployment
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // pending check
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ jobLossCashOnHand: 0 }))
  })

  it('clears the cash-on-hand required error once a valid value is entered after a failed attempt', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Required — 0 is a fine answer/i)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '500' } })
    expect(screen.queryByText(/Required — 0 is a fine answer/i)).toBeNull()
  })

  // TODO §15.H15 — pending/final paycheck: skippable Y/N gate; Yes reveals a
  // worked-days grid + a single-select arrival-day picker; resolved once at
  // Activate time into a concrete amount + date (raw picks aren't stored).
  describe('Pending/final paycheck (§15.H15)', () => {
    const PAY_CONFIG = {
      payPeriodEndDay: 0, userPaySchedule: 'weekly', baseRate: 20, shiftHours: 8,
      fedRateLow: 0.08, stateRateLow: 0.03, ficaRate: 0.0765, k401Rate: 0,
    }

    function reachPendingCheckStep(onActivate, config = PAY_CONFIG, cash = '2000') {
      render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} config={config} />)
      fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: cash } })
      fireEvent.click(screen.getByRole('button', { name: 'No' })) // unemployment
      fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1
    }

    it('is skippable — No leaves both fields null and does not block Activate', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'No' }))
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
      expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
        jobLossPendingCheckAmount: null,
        jobLossPendingCheckDate: null,
      }))
    })

    it('blocks Next when Yes is chosen but no arrival day is picked, with a real click reaching the guard', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      fireEvent.click(screen.getByRole('button', { name: 'Activate' })) // no expenses passed → this step's button is "Activate"
      expect(onActivate).not.toHaveBeenCalled()
      expect(screen.getByText(/Required to estimate when the check lands/i)).toBeTruthy()
    })

    it('accepts 0 worked days as valid — a $0 estimate, not a blocked step', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      fireEvent.click(screen.getByRole('button', { name: 'Arrives Fri' }))
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
      expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ jobLossPendingCheckAmount: 0 }))
    })

    it('computes a concrete amount + date from worked days + arrival day, matching the lib helpers directly', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      fireEvent.click(screen.getByRole('button', { name: 'Worked Mon' }))
      fireEvent.click(screen.getByRole('button', { name: 'Worked Tue' }))
      fireEvent.click(screen.getByRole('button', { name: 'Worked Wed' }))
      fireEvent.click(screen.getByRole('button', { name: 'Arrives Fri' }))

      const today = new Date().toISOString().slice(0, 10)
      const periodEnd = resolveLastPayPeriodEnd(today, PAY_CONFIG.payPeriodEndDay, PAY_CONFIG.userPaySchedule)
      const arrivalDate = resolvePendingCheckArrivalDate(periodEnd, 5) // Fri = 5
      const expectedAmount = Math.round(estimatePendingCheckAmount(3, PAY_CONFIG))

      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
      expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
        jobLossPendingCheckAmount: expectedAmount,
        jobLossPendingCheckDate: toLocalIso(arrivalDate),
      }))
    })

    it('shows a live preview once an arrival day is picked', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      expect(screen.queryByText(/arriving/i)).toBeNull() // no arrival day yet
      fireEvent.click(screen.getByRole('button', { name: 'Worked Mon' }))
      fireEvent.click(screen.getByRole('button', { name: 'Arrives Fri' }))
      expect(screen.getByText(/arriving/i)).toBeTruthy()
    })

    it('toggling a worked day back off removes it from the count', () => {
      const onActivate = vi.fn()
      reachPendingCheckStep(onActivate)
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      fireEvent.click(screen.getByRole('button', { name: 'Worked Mon' }))
      fireEvent.click(screen.getByRole('button', { name: 'Worked Mon' })) // toggle back off
      fireEvent.click(screen.getByRole('button', { name: 'Arrives Fri' }))
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
      expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ jobLossPendingCheckAmount: 0 }))
    })
  })

  const REVIEW_EXPENSES = [
    { id: 'exp_rent', category: 'Needs', label: 'Rent', billingMeta: { amount: 1200, cycle: 'every30days', effectiveFrom: '2026-01-01' } },
    { id: 'exp_gym', category: 'Lifestyle', label: 'Gym', billingMeta: { amount: 40, cycle: 'every30days', effectiveFrom: '2026-01-01' } },
  ]

  it('walks through the expense review + due-date steps and activates with the result', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<JobLossEntry open onClose={onClose} onActivate={onActivate} expenses={REVIEW_EXPENSES} />)

    // Step 0 — same date/benefits/cash-on-hand gate as before, now advances to Step 1 instead of activating.
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1 (pending check)
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getByText('Any paycheck still coming?')).toBeTruthy()

    // Step 1 — skip the pending check.
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 2
    expect(screen.getByText('Which bills do you want to track?')).toBeTruthy()

    // Step 2 — both start checked; uncheck Gym.
    fireEvent.click(screen.getByText('Gym').closest('label').querySelector('input[type="checkbox"]'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('When are these due?')).toBeTruthy()
    expect(screen.queryByText('Gym')).toBeNull() // unchecked, so not shown in the due-date step

    // Step 2 — pick a due date for the one kept bill (Rent).
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).not.toHaveBeenCalled() // no due date picked yet
    fireEvent.click(screen.getByText('3rd week of month'))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(onActivate).toHaveBeenCalledTimes(1)
    const [configPatch, updatedExpenses] = onActivate.mock.calls[0]
    expect(configPatch).toMatchObject({ jobLossMode: true, unemploymentEnabled: false })
    expect(updatedExpenses.find(e => e.id === 'exp_rent')).toMatchObject({ trackDuringJobLoss: true })
    expect(updatedExpenses.find(e => e.id === 'exp_rent').dueDateAnchor).toMatch(/-15$/)
    expect(updatedExpenses.find(e => e.id === 'exp_gym')).toMatchObject({ trackDuringJobLoss: false })
    expect(onClose).toHaveBeenCalled()
  })

  it('supports going Back from the expense review step without losing Step 0 answers', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} expenses={REVIEW_EXPENSES} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1 (pending check)
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // skip pending check
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 2
    expect(screen.getByText('Which bills do you want to track?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // → Step 1
    expect(screen.getByText('Any paycheck still coming?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // → Step 0
    expect(screen.getByText('Enter Job Loss Mode')).toBeTruthy()
    expect(screen.getByText('✓ No')).toBeTruthy() // step 0's answer persisted across the Back navigation
    expect(screen.getByPlaceholderText('e.g. 1,023').value).toBe('2000') // cash-on-hand answer persisted too
  })

  const LOAN_EXPENSE = {
    id: 'exp_loan1', type: 'loan', category: 'Loans', label: 'Car Note',
    loanMeta: { totalAmount: 2400, paymentAmount: 200, paymentFrequency: 'monthly', firstPaymentDate: '2026-05-10' },
  }

  it('shows a Loan badge in the review checklist and attaches the loan\'s own payment date automatically', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} expenses={[...REVIEW_EXPENSES, LOAN_EXPENSE]} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 1 (pending check)
    fireEvent.click(screen.getByRole('button', { name: 'No' })) // skip pending check
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // → Step 2
    expect(screen.getByText('Car Note')).toBeTruthy()
    expect(screen.getByText('Loan')).toBeTruthy() // badge in the checklist row

    // Advance to Step 2 — the loan should NOT appear in the due-date picker list.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('When are these due?')).toBeTruthy()
    expect(screen.queryByText('Car Note')).toBeNull()
    expect(screen.getByText(/Loans use the payment date already on file/i)).toBeTruthy()

    // Two non-loan bills (Rent, Gym) are both still kept — pick a due date for each.
    screen.getAllByText('3rd week of month').forEach(btn => fireEvent.click(btn))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    const [, updatedExpenses] = onActivate.mock.calls[0]
    const loanResult = updatedExpenses.find(e => e.id === 'exp_loan1')
    expect(loanResult).toMatchObject({ trackDuringJobLoss: true, dueDateAnchor: '2026-05-10' })
  })
})

// ─────────────────────────────────────────────────────────────
// RateUpdateModal (TODO §15.D)
// ─────────────────────────────────────────────────────────────

describe('RateUpdateModal', () => {
  const RATE_CONFIG = { ...DEFAULT_CONFIG, baseRate: 20, maxWeeklyHours: 40 }

  it('renders nothing when closed', () => {
    const { container } = render(<RateUpdateModal open={false} onClose={() => {}} config={RATE_CONFIG} onActivate={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('prefills the new-rate input from the current baseRate', () => {
    render(<RateUpdateModal open config={RATE_CONFIG} onClose={() => {}} onActivate={() => {}} />)
    expect(screen.getByPlaceholderText('e.g. 24.50')).toHaveValue(20)
  })

  it('disables Confirm until a positive rate is entered', () => {
    const onActivate = vi.fn()
    render(<RateUpdateModal open config={RATE_CONFIG} onClose={() => {}} onActivate={onActivate} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 24.50'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('activates with the new baseRate and the chosen effective date', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<RateUpdateModal open config={RATE_CONFIG} onClose={onClose} onActivate={onActivate} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 24.50'), { target: { value: '24.50' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput, { target: { value: '2026-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onActivate).toHaveBeenCalledWith({ baseRate: 24.5, effectiveFrom: '2026-07-20' })
    expect(onClose).toHaveBeenCalled()
  })

  it('cancels without activating', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<RateUpdateModal open config={RATE_CONFIG} onClose={onClose} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<RateUpdateModal open config={RATE_CONFIG} onClose={onClose} onActivate={() => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// JobLossHomePanel + JobLossBudgetPanel (TODO §15 mode rebuild, 2026-07-18)
// — replace JobLossDashboard/ExpenseTriage as Job Loss Mode's own dedicated
// Home/Budget views instead of a pinned card layered over the normal panels.
// ─────────────────────────────────────────────────────────────

describe('JobLossHomePanel', () => {
  it('renders the runway metrics for a job-loss config', () => {
    render(
      <JobLossHomePanel
        config={JOB_LOSS_CONFIG}
        setConfig={() => {}}
        expenses={INITIAL_EXPENSES}
        effectiveToday="2026-06-15"
        includeBenefits
      />
    )
    expect(screen.getByText('Runway')).toBeTruthy()
    expect(screen.getByText('Weekly Burn')).toBeTruthy()
  })

  it('renders with empty expenses and no unemployment', () => {
    const cfg = { ...JOB_LOSS_CONFIG, unemploymentEnabled: false, unemploymentWeekly: null }
    render(<JobLossHomePanel config={cfg} setConfig={() => {}} expenses={[]} effectiveToday="2026-06-15" includeBenefits />)
    expect(screen.getByText('Runway')).toBeTruthy()
  })

  // TODO §15.H14 bullet 2 / §15.H16 — Lifestyle spend is excluded from
  // weeklyBurn on purpose (survival-spend focus), but a user who keeps those
  // bills tracked is still paying for them; this caption is the transparency
  // fix so the headline number doesn't silently omit real spend.
  describe('Lifestyle spend caption (§15.H16)', () => {
    const GYM = {
      id: 'exp_gym', category: 'Lifestyle', label: 'Gym',
      billingMeta: { amount: 40, cycle: 'every7days', effectiveFrom: '2026-01-01' },
      history: [{ effectiveFrom: '2026-01-01', weekly: [40, 40, 40, 40] }],
    }

    it('shows a caption when a tracked Lifestyle expense is active', () => {
      render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={[...INITIAL_EXPENSES, GYM]} effectiveToday="2026-06-15" includeBenefits />)
      expect(screen.getByText(/Lifestyle spend still tracked/i)).toBeTruthy()
      expect(screen.getByText(/\$40\/wk/)).toBeTruthy()
    })

    it('does not show the caption when there are no Lifestyle expenses', () => {
      render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
      expect(screen.queryByText(/Lifestyle spend still tracked/i)).toBeNull()
    })

    it('does not show the caption when the Lifestyle expense is untracked', () => {
      const untracked = { ...GYM, trackDuringJobLoss: false }
      render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={[...INITIAL_EXPENSES, untracked]} effectiveToday="2026-06-15" includeBenefits />)
      expect(screen.queryByText(/Lifestyle spend still tracked/i)).toBeNull()
    })
  })

  it('logs extra income and reflects it in the "Extra Income Logged" tile', () => {
    const configs = []
    const setConfig = vi.fn(updater => configs.push(typeof updater === 'function' ? updater(JOB_LOSS_CONFIG) : updater))
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={setConfig} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 150'), { target: { value: '200' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekend gig'), { target: { value: 'Yard work' } })
    fireEvent.click(screen.getByText('+ Log Income'))
    expect(setConfig).toHaveBeenCalled()
    const result = configs[0]
    expect(result.jobHuntIncomeLog).toHaveLength(1)
    expect(result.jobHuntIncomeLog[0]).toMatchObject({ amount: 200, note: 'Yard work' })
  })

  it('disables Log Income until a positive amount is entered', () => {
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
    expect(screen.getByText('+ Log Income').closest('button')).toBeDisabled()
  })

  it('removes a logged income entry and eager-saves the result', () => {
    const cfg = { ...JOB_LOSS_CONFIG, jobHuntIncomeLog: [{ id: 'jhi_1', amount: 100, note: 'Gig', loggedAt: '2026-06-10T00:00:00.000Z' }] }
    const setConfig = vi.fn()
    const saveConfigNow = vi.fn()
    render(<JobLossHomePanel config={cfg} setConfig={setConfig} saveConfigNow={saveConfigNow} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
    fireEvent.click(screen.getByLabelText('Remove entry'))
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({ jobHuntIncomeLog: [] }))
    expect(saveConfigNow).toHaveBeenCalledWith(expect.objectContaining({ jobHuntIncomeLog: [] }))
  })

  it('shadows setConfig and saveConfigNow with no-ops when readOnly', () => {
    const cfg = { ...JOB_LOSS_CONFIG, jobHuntIncomeLog: [{ id: 'jhi_1', amount: 100, note: 'Gig', loggedAt: '2026-06-10T00:00:00.000Z' }] }
    const setConfig = vi.fn()
    const saveConfigNow = vi.fn()
    render(<JobLossHomePanel config={cfg} setConfig={setConfig} saveConfigNow={saveConfigNow} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits readOnly />)
    fireEvent.click(screen.getByLabelText('Remove entry'))
    expect(setConfig).not.toHaveBeenCalled()
    expect(saveConfigNow).not.toHaveBeenCalled()
  })

  it('embeds the Re-employment Tracker', () => {
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
    expect(screen.getByText('Re-employment')).toBeTruthy()
    expect(screen.getByText('Target annual')).toBeTruthy()
  })

  // TODO §15.H13 — cash on hand is now a persisted config field, editable
  // from Home (this describe block) AND Budget, not a session-only draft.
  describe('Cash On Hand (persisted, TODO §15.H13)', () => {
    it('pre-fills the input from config.jobLossCashOnHand', () => {
      const cfg = { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 1500 }
      render(<JobLossHomePanel config={cfg} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
      expect(screen.getByPlaceholderText('e.g. 1,023').value).toBe('1500')
    })

    it('eager-saves the new value on blur, not on every keystroke', () => {
      const cfg = { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 500 }
      const setConfig = vi.fn()
      const saveConfigNow = vi.fn()
      render(<JobLossHomePanel config={cfg} setConfig={setConfig} saveConfigNow={saveConfigNow} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
      const cashInput = screen.getByPlaceholderText('e.g. 1,023')
      fireEvent.change(cashInput, { target: { value: '3000' } })
      expect(setConfig).not.toHaveBeenCalled() // typing alone doesn't save
      fireEvent.blur(cashInput)
      expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({ jobLossCashOnHand: 3000 }))
      expect(saveConfigNow).toHaveBeenCalledWith(expect.objectContaining({ jobLossCashOnHand: 3000 }))
    })

    it('does not save on blur when the value is unchanged', () => {
      const cfg = { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 500 }
      const setConfig = vi.fn()
      const saveConfigNow = vi.fn()
      render(<JobLossHomePanel config={cfg} setConfig={setConfig} saveConfigNow={saveConfigNow} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits />)
      fireEvent.blur(screen.getByPlaceholderText('e.g. 1,023'))
      expect(setConfig).not.toHaveBeenCalled()
      expect(saveConfigNow).not.toHaveBeenCalled()
    })

    it('is disabled when readOnly', () => {
      const cfg = { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 500 }
      render(<JobLossHomePanel config={cfg} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" includeBenefits readOnly />)
      expect(screen.getByPlaceholderText('e.g. 1,023')).toBeDisabled()
    })
  })

  // DW-8 (docs/BUG_FIX_TODO.md) — CoachNetWorthCard's Red tier ("Job Loss
  // Mode, runway under 30 days") was structurally unreachable because this
  // panel replaces HomePanel entirely and never mounted the card at all.
  describe('Coach presence (DW-8 fix)', () => {
    beforeEach(() => {
      localStorage.clear()
      coachMocks.chatWithCoach.mockReset()
    })

    // Zero cash on hand + real weekly burn from INITIAL_EXPENSES puts runway
    // well under 30 days for this fixture — the Red tier's own condition.
    const RUNWAY_UNDER_30 = { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 0 }

    it('does not render the card for a non-admin/non-tester account', () => {
      render(
        <JobLossHomePanel
          config={RUNWAY_UNDER_30} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
        />
      )
      expect(screen.queryByText('Coach — Critical')).toBeNull()
      expect(coachMocks.chatWithCoach).not.toHaveBeenCalled()
    })

    it('renders the Red tier for an admin account when runway is under 30 days', async () => {
      coachMocks.chatWithCoach.mockImplementation(chunkGenerator(['Runway is tight — here is what to do.']))
      render(
        <JobLossHomePanel
          config={RUNWAY_UNDER_30} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits={false} currentWeek={{ idx: 10 }}
          isAdmin
        />
      )
      expect(await screen.findByText('Coach — Critical')).toBeTruthy()
    })

    // docs/coach-entry-points.md §2 — the Net Worth Check-In card (including
    // its Red tier, the one this panel can reach) left the admin/tester-only
    // gate; a real trial/paid entitlement now also opens it, same as HomePanel.
    it('renders the Red tier for a non-admin/non-tester account with a real trial entitlement', async () => {
      coachMocks.chatWithCoach.mockImplementation(chunkGenerator(['Runway is tight — here is what to do.']))
      render(
        <JobLossHomePanel
          config={RUNWAY_UNDER_30} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits={false} currentWeek={{ idx: 10 }}
          isAdmin={false} isTester={false}
          entitlement={{ isEntitled: true, state: 'trial' }}
        />
      )
      expect(await screen.findByText('Coach — Critical')).toBeTruthy()
    })

    it('does not render the card for a non-admin/non-tester account with an expired entitlement', () => {
      render(
        <JobLossHomePanel
          config={RUNWAY_UNDER_30} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin={false} isTester={false}
          entitlement={{ isEntitled: false, state: 'expired' }}
        />
      )
      expect(screen.queryByText('Coach — Critical')).toBeNull()
      expect(coachMocks.chatWithCoach).not.toHaveBeenCalled()
    })

    // Locked decision 2026-07-25 — investor accounts bypass this too, even
    // with no entitlement at all (investor accounts routinely carry none).
    it('renders the Red tier for an investor account with no entitlement', async () => {
      coachMocks.chatWithCoach.mockImplementation(chunkGenerator(['Runway is tight — here is what to do.']))
      render(
        <JobLossHomePanel
          config={{ ...RUNWAY_UNDER_30, isInvestor: true }} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits={false} currentWeek={{ idx: 10 }}
          isAdmin={false} isTester={false}
          entitlement={{ isEntitled: false, state: 'none' }}
        />
      )
      expect(await screen.findByText('Coach — Critical')).toBeTruthy()
    })
  })

  // §18 sections 4+ standing constraint — Job Hunt Assistant (§18.E) and
  // Résumé Review (§18.E1) stay on the narrow canAccessAiFeatures gate
  // (admin/tester/investor — hasPrivilegedAccess), unlike the Net Worth card
  // above which left it for a wider trial/paid gate. A real trial
  // entitlement alone (no admin/tester/investor) must NOT be enough.
  describe('Job Hunt Assistant + Résumé Review gate (§18 sections 4+)', () => {
    it('does not render for a non-admin/non-tester account, even with a real trial entitlement', () => {
      render(
        <JobLossHomePanel
          config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin={false} isTester={false}
          entitlement={{ isEntitled: true, state: 'trial' }}
        />
      )
      expect(screen.queryByText('Job Hunt Assistant')).toBeNull()
      expect(screen.queryByText('Résumé Review')).toBeNull()
    })

    it('renders both for an admin account', async () => {
      render(
        <JobLossHomePanel
          config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin
        />
      )
      expect(screen.getByText('Job Hunt Assistant')).toBeTruthy()
      // ResumeReviewCard loads its profile async on mount before rendering.
      expect(await screen.findByText('Résumé Review')).toBeTruthy()
    })

    it('renders both for a manually-flagged tester account', async () => {
      render(
        <JobLossHomePanel
          config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin={false} isTester
        />
      )
      expect(screen.getByText('Job Hunt Assistant')).toBeTruthy()
      expect(await screen.findByText('Résumé Review')).toBeTruthy()
    })

    // Locked decision 2026-07-25 (entitlements.js's hasPrivilegedAccess):
    // investor/demo accounts bypass every paid wall too, AI features
    // included — even with no admin/tester flag and no real subscription
    // entitlement at all (investor accounts routinely have neither).
    it('renders both for an investor account, even with no admin/tester flag or entitlement', async () => {
      render(
        <JobLossHomePanel
          config={{ ...JOB_LOSS_CONFIG, isInvestor: true }} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin={false} isTester={false}
          entitlement={{ isEntitled: false, state: 'none' }}
        />
      )
      expect(screen.getByText('Job Hunt Assistant')).toBeTruthy()
      expect(await screen.findByText('Résumé Review')).toBeTruthy()
    })

    it('opens the Job Hunt chat panel on tap', async () => {
      render(
        <JobLossHomePanel
          config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES}
          effectiveToday="2026-06-15" includeBenefits currentWeek={{ idx: 10 }}
          isAdmin
        />
      )
      await screen.findByText('Résumé Review') // let ResumeReviewCard's mount-load settle first
      fireEvent.click(screen.getByText('Talk to Coach about the search'))
      expect(screen.getByLabelText('Close Job Hunt Assistant')).toBeTruthy()
    })
  })
})

describe('JobLossBudgetPanel', () => {
  function renderBudget(overrides = {}) {
    return render(
      <JobLossBudgetPanel
        config={JOB_LOSS_CONFIG}
        setConfig={() => {}}
        expenses={INITIAL_EXPENSES}
        setExpenses={() => {}}
        effectiveToday="2026-06-15"
        includeBenefits
        setIncludeBenefits={() => {}}
        {...overrides}
      />
    )
  }

  it('renders the savings input and expense list', () => {
    renderBudget()
    expect(screen.getByText('Savings & Benefits')).toBeTruthy()
    expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1)
  })

  it('badges a loan expense and shows its payment amount from loanMeta, not billingMeta', () => {
    const loan = {
      id: 'exp_loan1', type: 'loan', category: 'Loans', label: 'Car Note',
      loanMeta: { totalAmount: 2400, paymentAmount: 200, paymentFrequency: 'monthly', firstPaymentDate: '2026-06-01' },
    }
    renderBudget({ expenses: [...INITIAL_EXPENSES, loan] })
    expect(screen.getAllByText('Car Note').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Loan')).toBeTruthy()
    expect(screen.getByText(/\$200\/monthly/)).toBeTruthy()
  })

  it('shows the empty state when there are no expenses', () => {
    renderBudget({ expenses: [] })
    expect(screen.getByText(/No expenses yet/i)).toBeTruthy()
  })

  it('does not add an expense until a due date is picked', () => {
    const setExpenses = vi.fn()
    renderBudget({ expenses: [], setExpenses })
    fireEvent.change(screen.getByPlaceholderText('e.g. Rent'), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1200'), { target: { value: '1200' } })
    fireEvent.click(screen.getByText('+ Add Expense'))
    expect(setExpenses).not.toHaveBeenCalled()
    expect(screen.getByText(/Pick a due date/i)).toBeTruthy()
  })

  it('adds a new expense with a due date anchor, not defaulted to today', () => {
    const setExpenses = vi.fn()
    renderBudget({ expenses: [], setExpenses })
    fireEvent.change(screen.getByPlaceholderText('e.g. Rent'), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1200'), { target: { value: '1200' } })
    fireEvent.click(screen.getByText('2nd week of month'))
    fireEvent.click(screen.getByText('+ Add Expense'))
    expect(setExpenses).toHaveBeenCalled()
    const result = setExpenses.mock.calls[0][0]([])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ label: 'Rent', category: 'Needs', trackDuringJobLoss: true })
    expect(result[0].billingMeta.amount).toBe(1200)
    expect(result[0].dueDateAnchor).toBe('2026-06-08')
  })

  it('changes an expense triage status and eager-saves the result', () => {
    const setExpenses = vi.fn(updater => updater(INITIAL_EXPENSES))
    const onSaveExpensesNow = vi.fn()
    renderBudget({ setExpenses, onSaveExpensesNow })
    fireEvent.click(screen.getByText('Paused'))
    expect(setExpenses).toHaveBeenCalled()
    expect(onSaveExpensesNow).toHaveBeenCalled()
    const saved = onSaveExpensesNow.mock.calls[0][0]
    expect(saved.find(e => e.id === INITIAL_EXPENSES[0].id).jobLossStatus).toBe('paused')
  })

  it('removes an expense and eager-saves the result', () => {
    const setExpenses = vi.fn(updater => updater(INITIAL_EXPENSES))
    const onSaveExpensesNow = vi.fn()
    renderBudget({ setExpenses, onSaveExpensesNow })
    fireEvent.click(screen.getByLabelText('Remove expense'))
    expect(setExpenses).toHaveBeenCalled()
    expect(onSaveExpensesNow).toHaveBeenCalledWith([])
  })

  it('shadows setExpenses/onSaveExpensesNow with no-ops and hides mutation controls when readOnly', () => {
    const setExpenses = vi.fn()
    const onSaveExpensesNow = vi.fn()
    renderBudget({ setExpenses, onSaveExpensesNow, readOnly: true })
    expect(screen.queryByText('+ Add Expense')).toBeNull()
    expect(screen.queryByLabelText('Remove expense')).toBeNull()
    expect(screen.queryByText('Paused')).toBeNull()
  })

  // TODO §15.H13 — same persisted field as JobLossHomePanel's Cash On Hand
  // input, editable from both places, neither one "owning" it.
  describe('Cash on hand / current savings (persisted, TODO §15.H13)', () => {
    it('pre-fills the input from config.jobLossCashOnHand', () => {
      renderBudget({ config: { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 1500 } })
      expect(screen.getByPlaceholderText('e.g. 1,023').value).toBe('1500')
    })

    it('eager-saves the new value on blur, not on every keystroke', () => {
      const setConfig = vi.fn()
      const saveConfigNow = vi.fn()
      renderBudget({ config: { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 500 }, setConfig, saveConfigNow })
      const cashInput = screen.getByPlaceholderText('e.g. 1,023')
      fireEvent.change(cashInput, { target: { value: '3000' } })
      expect(setConfig).not.toHaveBeenCalled()
      fireEvent.blur(cashInput)
      expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({ jobLossCashOnHand: 3000 }))
      expect(saveConfigNow).toHaveBeenCalledWith(expect.objectContaining({ jobLossCashOnHand: 3000 }))
    })

    it('shadows setConfig/saveConfigNow and disables the input when readOnly', () => {
      const setConfig = vi.fn()
      const saveConfigNow = vi.fn()
      renderBudget({ config: { ...JOB_LOSS_CONFIG, jobLossCashOnHand: 500 }, setConfig, saveConfigNow, readOnly: true })
      const cashInput = screen.getByPlaceholderText('e.g. 1,023')
      expect(cashInput).toBeDisabled()
      fireEvent.change(cashInput, { target: { value: '3000' } })
      fireEvent.blur(cashInput)
      expect(setConfig).not.toHaveBeenCalled()
      expect(saveConfigNow).not.toHaveBeenCalled()
    })
  })
})

describe('ReemploymentTracker', () => {
  it('renders with defaults and derives a target from baseRate × hours', () => {
    const { container } = render(<ReemploymentTracker config={JOB_LOSS_CONFIG} setConfig={() => {}} />)
    // 20 × 40 × 52 = $41,600 target income
    expect(container.textContent).toContain('41,600')
  })

  it('lists existing job applications from config', () => {
    const cfg = {
      ...JOB_LOSS_CONFIG,
      jobApplications: [{ id: 'a1', company: 'Acme Logistics', role: 'Driver', dateApplied: '2026-06-10', status: 'applied' }],
    }
    const { container } = render(<ReemploymentTracker config={cfg} setConfig={() => {}} />)
    expect(container.textContent).toContain('Acme Logistics')
  })

  it('eager-saves the computed config when setting the target income', () => {
    const setConfig = vi.fn(v => v)
    const saveConfigNow = vi.fn()
    render(<ReemploymentTracker config={JOB_LOSS_CONFIG} setConfig={setConfig} saveConfigNow={saveConfigNow} />)
    fireEvent.change(screen.getByPlaceholderText('41600'), { target: { value: '50000' } })
    fireEvent.click(screen.getByText('Set'))
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({ targetIncomeAnnual: 50000 }))
    expect(saveConfigNow).toHaveBeenCalledWith(expect.objectContaining({ targetIncomeAnnual: 50000 }))
  })
})
