import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SetupWizard } from '../../components/SetupWizard.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  setupComplete: false,
  startedUnemployed: false, // satisfies Step 0 first-run gate (§1.H seed)
  baseRate: 21.15,
  shiftHours: 12,
  fedRateLow: 0.0784,
  userState: 'MO',
  startDate: '2026-03-01',
  maxWeeklyHours: 40,
  hoursUnderstood: true, // satisfies Step 2 (Schedule) base-user confirmation gate
  attendanceBucketEnabled: false,
  freedomAllowance: 50,
  freedomAllowanceEnabled: true,
}

function renderWizard({ lifeEvent = null, config = BASE_CONFIG } = {}) {
  const onComplete = vi.fn()
  render(
    <SetupWizard
      config={config}
      onComplete={onComplete}
      lifeEvent={lifeEvent}
    />,
  )
  return { onComplete }
}

function clickNext() {
  const btn = screen.getByRole('button', { name: /next|finish/i })
  fireEvent.click(btn)
}

function clickBack() {
  const btn = screen.getByRole('button', { name: /^back$/i })
  fireEvent.click(btn)
}

function getStepCounter() {
  return screen.getByText(/· \d+ of \d+/i).textContent
}

function advanceSteps(count) {
  for (let i = 0; i < count; i += 1) {
    clickNext()
  }
}

describe('SetupWizard — step routing', () => {
  it('first-run shows 6 steps total', () => {
    renderWizard({ lifeEvent: null })
    expect(getStepCounter()).toContain('of 6')
  })

  it('changed_jobs life event also shows 6 steps (wrap-up included)', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(getStepCounter()).toContain('of 6')
  })

  it('lost_job life event skips wrap-up and shows 5 steps', () => {
    renderWizard({ lifeEvent: 'lost_job' })
    expect(getStepCounter()).toContain('of 5')
  })

  it('commission_job life event shows 5 steps (through Tax Rates)', () => {
    renderWizard({ lifeEvent: 'commission_job' })
    expect(getStepCounter()).toContain('of 5')
  })

  it('counter label reads "Setup" for first-run', () => {
    renderWizard({ lifeEvent: null })
    expect(getStepCounter()).toMatch(/setup/i)
  })

  it('counter label reads "Life Event" for re-entry flows', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(getStepCounter()).toMatch(/life event/i)
  })
})

describe('SetupWizard — Step 0 rendering', () => {
  it('first-run renders welcome copy without life event buttons', () => {
    renderWizard({ lifeEvent: null })
    expect(screen.getByText(/set up your pay/i)).toBeTruthy()
    expect(screen.queryByText(/lost my job/i)).toBeNull()
  })

  it('re-entry shows life event selection buttons', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(screen.getByText(/lost my job/i)).toBeTruthy()
    expect(screen.getByText(/changed jobs/i)).toBeTruthy()
    expect(screen.getByText(/got a commission job/i)).toBeTruthy()
  })
})

describe('SetupWizard — navigation', () => {
  it('no Back button on step 0', () => {
    renderWizard()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })

  it('Back button appears after advancing', () => {
    renderWizard()
    clickNext()
    expect(screen.getByRole('button', { name: /^back$/i })).toBeTruthy()
  })

  it('step counter increments and decrements with navigation', () => {
    renderWizard()
    expect(getStepCounter()).toContain('1 of')
    clickNext()
    expect(getStepCounter()).toContain('2 of')
    clickBack()
    expect(getStepCounter()).toContain('1 of')
  })

  it('last step shows "Finish" instead of "Next →"', () => {
    renderWizard()
    advanceSteps(5) // arrive at Wrap Up (step 6)
    expect(screen.getByRole('button', { name: /finish/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  })

  it('Step 3 (Deductions) exposes a Skip button', () => {
    renderWizard()
    advanceSteps(3) // enter Step 3
    expect(screen.getByRole('button', { name: /skip/i })).toBeTruthy()
  })
})

describe('SetupWizard — validation gates', () => {
  it('Step 1: Next disabled when baseRate is 0', () => {
    const config = { ...BASE_CONFIG, baseRate: 0 }
    renderWizard({ config })
    clickNext()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('Step 1: DHL preset requires selecting a team', () => {
    const config = { ...BASE_CONFIG, employerPreset: 'DHL', dhlTeam: null }
    renderWizard({ config })
    clickNext()
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
    // Team pick resets userPaySchedule → must also pick pay schedule before Next unlocks
    fireEvent.click(screen.getByRole('button', { name: /team b/i }))
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
  })

  it('Step 2: Next disabled until startDate provided', () => {
    const config = { ...BASE_CONFIG, startDate: null }
    renderWizard({ config })
    clickNext()
    clickNext()
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput, { target: { value: '2026-03-05' } })
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
  })

  it('Step 2: non-DHL requires maxWeeklyHours and payPeriodEndDay', () => {
    const config = { ...BASE_CONFIG, employerPreset: null, maxWeeklyHours: null, payPeriodEndDay: null }
    renderWizard({ config })
    clickNext()
    clickNext()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 40/i), { target: { value: '40' } })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^sun$/i }))
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
  })

  it('Step 3: Non-DHL users must answer the attendance question', () => {
    const config = { ...BASE_CONFIG, attendanceBucketEnabled: null }
    renderWizard({ config })
    clickNext() // step 1
    clickNext() // step 2
    clickNext() // step 3
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /standard time off/i }))
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
  })
})

describe('SetupWizard — DHL hidden defaults', () => {
  it('switching DHL off restores non-DHL schedule defaults', async () => {
    const config = {
      ...BASE_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'A',
      userPaySchedule: 'weekly',
      scheduleIsVariable: true,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })

    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    // Answering "No" clears the DHL-seeded base rate / shift length, so re-supply them.
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.employerPreset).toBeNull()
    expect(payload.scheduleIsVariable).toBe(false)
  })

  it('clears the DHL-seeded base rate when the gate is answered "No"', () => {
    // DEFAULT_CONFIG.baseRate (19.65) is the DHL preset value. A base user must not
    // inherit it silently — the field should be blank after answering "No".
    renderWizard({ config: { ...BASE_CONFIG, baseRate: 19.65, shiftHours: 12 } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))

    const baseRateInput = screen.getByPlaceholderText(/e\.g\. 19\.65/i)
    expect(baseRateInput.value).toBe('')
  })

  it('re-seeds the DHL base rate when the gate is toggled back to "Yes"', () => {
    // Toggling No clears baseRate to null; toggling Yes must restore the DHL preset
    // value so the required field is never left blank for a DHL user.
    renderWizard({ config: { ...BASE_CONFIG, baseRate: 19.65, shiftHours: 12 } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    expect(screen.getByPlaceholderText(/e\.g\. 19\.65/i).value).toBe('')

    // First "Yes" is the DHL employer gate (other yes/no gates render lower in the form).
    fireEvent.click(screen.getAllByRole('button', { name: /^yes$/i })[0])
    expect(screen.getByPlaceholderText(/e\.g\. 19\.65/i).value).toBe('19.65')
  })

  it('hides OT fields for DHL users and keeps them visible for non-DHL users', () => {
    const dhlConfig = { ...BASE_CONFIG, employerPreset: 'DHL', dhlTeam: 'A', userPaySchedule: 'weekly' }
    renderWizard({ config: dhlConfig })

    expect(screen.queryByText(/overtime threshold/i)).toBeNull()
    expect(screen.queryByText(/ot multiplier/i)).toBeNull()
    cleanup()

    renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    expect(screen.getByText(/overtime threshold/i)).toBeTruthy()
    // OT multiplier lives inside the collapsed "Advanced Pay Rules" disclosure.
    expect(screen.queryByText(/^ot multiplier$/i)).toBeNull()
    fireEvent.click(screen.getByText(/advanced pay rules/i))
    expect(screen.getByText(/^ot multiplier$/i)).toBeTruthy()
  })

  it('hides pay-period selector for DHL users on Schedule step', () => {
    const config = { ...BASE_CONFIG, employerPreset: 'DHL', dhlTeam: 'A', userPaySchedule: 'weekly' }
    renderWizard({ config })
    clickNext()
    clickNext()
    expect(screen.queryByText(/pay period closes on/i)).toBeNull()
  })

  it('auto-applies Sunday/40/1.5 defaults for DHL users in onComplete payload', async () => {
    const config = {
      ...BASE_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'A',
      userPaySchedule: 'weekly',
      payPeriodEndDay: 2,
      otThreshold: 44,
      otMultiplier: 2,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })
    advanceSteps(5)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.payPeriodEndDay).toBe(0)
    expect(payload.otThreshold).toBe(40)
    expect(payload.otMultiplier).toBe(1.5)
  })
})

describe('SetupWizard — onComplete', () => {
  function finishWizard(overrides = {}) {
    const config = { ...BASE_CONFIG, ...overrides }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })
    advanceSteps(5)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    return onComplete
  }

  it('calls onComplete with setupComplete: true and taxedWeeks populated', async () => {
    const onComplete = finishWizard()
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.setupComplete).toBe(true)
    expect(Array.isArray(payload.taxedWeeks)).toBe(true)
    expect(payload.taxedWeeks.length).toBeGreaterThan(0)
  })

  it('taxedWeeks only contains indices >= firstActiveIdx', async () => {
    // startDate '2026-03-10' is week idx 10 (FISCAL_YEAR_START '2026-01-05' + 64 days).
    // The wizard recalculates firstActiveIdx from startDate on mount, so a bare
    // firstActiveIdx override without a matching startDate gets overwritten.
    const onComplete = finishWizard({ startDate: '2026-03-10' })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.firstActiveIdx).toBe(10)
    expect(payload.taxedWeeks.every(idx => idx >= 10)).toBe(true)
  })

  it('preserves all formData fields in onComplete payload', async () => {
    const onComplete = finishWizard({ baseRate: 24.5, k401Rate: 0.08 })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.baseRate).toBe(24.5)
    expect(payload.k401Rate).toBe(0.08)
  })

  // The wizard (any life event, including an employer-preset switch) must never
  // carry expenses/goals/logs — those live in separate Supabase columns and
  // App.jsx's handleWizardComplete only ever calls setConfig(payload). If the
  // payload ever picked up one of these keys it would risk silently overwriting
  // the user's budget/goal/log records on save.
  it('never includes expenses, goals, or logs keys in the payload', async () => {
    const onComplete = finishWizard()
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload).not.toHaveProperty('expenses')
    expect(payload).not.toHaveProperty('goals')
    expect(payload).not.toHaveProperty('logs')
  })
})

describe('SetupWizard — employer switch never touches expenses/goals/logs', () => {
  it('base -> DHL: payload flips employerPreset but carries no expenses/goals/logs keys', async () => {
    const config = { ...BASE_CONFIG, employerPreset: null }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })

    clickNext() // step 0 -> step 1 (Pay Structure)
    fireEvent.click(screen.getAllByRole('button', { name: /^yes$/i })[0]) // DHL employer gate -> Yes
    fireEvent.click(screen.getByRole('button', { name: /team b/i }))
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.employerPreset).toBe('DHL')
    expect(payload).not.toHaveProperty('expenses')
    expect(payload).not.toHaveProperty('goals')
    expect(payload).not.toHaveProperty('logs')
  })

  it('DHL -> base: payload flips employerPreset but carries no expenses/goals/logs keys', async () => {
    const config = {
      ...BASE_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'A',
      userPaySchedule: 'weekly',
      scheduleIsVariable: true,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })

    clickNext() // step 0 -> step 1
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL employer gate -> No
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    // Answering "No" clears the DHL-seeded base rate / shift length, so re-supply them.
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.employerPreset).toBeNull()
    expect(payload).not.toHaveProperty('expenses')
    expect(payload).not.toHaveProperty('goals')
    expect(payload).not.toHaveProperty('logs')
  })
})

describe('SetupWizard — step titles', () => {
  it('walks through the condensed six-step sequence', () => {
    renderWizard()
    const titles = ['Welcome', 'Pay Structure', 'Schedule', 'Deductions', 'Tax Rates', 'Wrap Up']
    titles.forEach((title, idx) => {
      expect(screen.getByText(title)).toBeTruthy()
      if (idx < titles.length - 1) {
        clickNext()
      }
    })
  })

  it('renders Wrap Up step for changed_jobs life events', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    advanceSteps(5)
    expect(screen.getByText('Wrap Up')).toBeTruthy()
  })

  it('omits Wrap Up for lost_job life events', () => {
    renderWizard({ lifeEvent: 'lost_job' })
    for (let i = 0; i < 5; i += 1) {
      expect(screen.queryByText('Wrap Up')).toBeNull()
      const btn = screen.queryByRole('button', { name: /next|finish/i })
      if (!btn) break
      fireEvent.click(btn)
    }
  })
})

describe('SetupWizard — Jobless Setup mini-flow (TODO §1.H)', () => {
  it('pre-answering startedUnemployed=true on first-run shows only 4 steps (Welcome + 3 jobless steps)', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: true } })
    expect(getStepCounter()).toContain('of 4')
  })

  it('answering "Yes" at Step 0 immediately collapses the step count from 6 to 4', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: false } })
    expect(getStepCounter()).toContain('of 6')
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    expect(getStepCounter()).toContain('of 4')
  })

  it('answering "No" after "Yes" restores the normal 6-step pay-structure flow', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: false } })
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    expect(getStepCounter()).toContain('of 4')
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    expect(getStepCounter()).toContain('of 6')
  })

  it('walks through the jobless step titles: Welcome, Unemployment Benefits, New Job Season Details, Wrap Up', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: false } })
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i })) // sets newJobSeasonDate default — real entry path
    expect(screen.getByText('Welcome')).toBeTruthy()
    clickNext()
    expect(screen.getByText('Unemployment Benefits')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // answer the gate so Next unblocks
    clickNext()
    expect(screen.getByText('New Job Season Details')).toBeTruthy()
    clickNext()
    expect(screen.getByText('Wrap Up')).toBeTruthy()
  })

  it('Unemployment Benefits: Next is disabled until the Y/N question is answered', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: true } })
    clickNext() // Welcome -> Unemployment Benefits
    clickNext() // attempt Next with nothing answered
    expect(screen.getByText('Unemployment Benefits')).toBeTruthy() // still on the same step
  })

  it('Unemployment Benefits: answering Yes requires weekly amount and duration before proceeding', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: true } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    clickNext()
    expect(screen.getByText('Unemployment Benefits')).toBeTruthy() // blocked — fields empty

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 400/i), { target: { value: '350' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 26/i), { target: { value: '20' } })
    clickNext()
    expect(screen.getByText('New Job Season Details')).toBeTruthy()
  })

  it('Unemployment Benefits: answering No proceeds without requiring amount/duration', () => {
    renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: true } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    clickNext()
    expect(screen.getByText('New Job Season Details')).toBeTruthy()
  })

  it('completing the mini-flow calls onComplete with newJobSeasonMode, newJobSeasonDate, and unemployment fields set', async () => {
    const { onComplete } = renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: false } })
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i })) // sets newJobSeasonDate default
    clickNext() // -> Unemployment Benefits
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 400/i), { target: { value: '350' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 26/i), { target: { value: '20' } })
    clickNext() // -> New Job Season Details
    clickNext() // -> Wrap Up (newJobSeasonDate already defaulted at Step 0)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.setupComplete).toBe(true)
    expect(payload.newJobSeasonMode).toBe(true)
    expect(payload.newJobSeasonDate).toBeTruthy()
    expect(payload.unemploymentEnabled).toBe(true)
    expect(payload.unemploymentWeekly).toBe(350)
    expect(payload.unemploymentDurationWeeks).toBe(20)
  })

  it('New Job Season Details: entering a prior hourly rate sets targetIncomeAnnual (rate × 40 × 52)', async () => {
    const { onComplete } = renderWizard({ config: { ...BASE_CONFIG, startedUnemployed: false } })
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i })) // sets newJobSeasonDate default
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    clickNext() // -> New Job Season Details
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 22\.00/i), { target: { value: '20' } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onComplete.mock.calls[0][0].targetIncomeAnnual).toBe(20 * 40 * 52)
  })

  it('structure_change re-entry ignores startedUnemployed (never routes into the jobless mini-flow)', () => {
    renderWizard({ lifeEvent: 'structure_change', config: { ...BASE_CONFIG, startedUnemployed: true, setupComplete: true } })
    expect(screen.queryByText('Unemployment Benefits')).toBeNull()
    expect(getStepCounter()).toContain('of 6')
  })

  it('structure_change Wrap Up shows a first-time message instead of a diff when startedUnemployed is true', () => {
    renderWizard({ lifeEvent: 'structure_change', config: { ...BASE_CONFIG, startedUnemployed: true, setupComplete: true } })
    advanceSteps(5)
    expect(screen.getByText(/filling in a real pay structure for the first time/i)).toBeTruthy()
    expect(screen.queryByText(/base rate/i)).toBeNull() // no DIFF_FIELDS row rendered
  })
})

describe('SetupWizard — tips/commission daily check-in opt-in (Step 1)', () => {
  it('does not show the question until the DHL employer gate is answered', () => {
    renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext() // step 0 -> step 1
    expect(screen.queryByText(/do you earn tips or commission/i)).toBeNull()
  })

  it('defaults to "No" once the gate is answered, with no follow-up shown', () => {
    renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL gate -> No
    expect(screen.getByText(/do you earn tips or commission/i)).toBeTruthy()
    expect(screen.queryByText(/is this a commission-only position/i)).toBeNull()
  })

  it('selecting "Tips" enables the check-in with no commission-only follow-up', async () => {
    const { onComplete } = renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL gate -> No (clears baseRate/shiftHours)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^tips$/i }))
    expect(screen.queryByText(/is this a commission-only position/i)).toBeNull()

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.tipsOrCommissionEnabled).toBe(true)
    expect(payload.tipsOrCommissionLabel).toBe('tips')
    expect(payload.tipsOrCommissionEnabledAt).toBeTruthy()
  })

  it('selecting "Commission" reveals the commission-only follow-up question', () => {
    renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^commission$/i }))
    expect(screen.getByText(/is this a commission-only position/i)).toBeTruthy()
  })

  it('captures commission-only Yes/No with no functional effect beyond the field itself', async () => {
    const { onComplete } = renderWizard({ config: { ...BASE_CONFIG, employerPreset: null } })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL gate -> No (clears baseRate/shiftHours)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^commission$/i }))
    // Two "Yes" buttons now exist (DHL gate + commission-only follow-up) — the
    // follow-up renders later in the same Step1 tree, so it's the last match.
    fireEvent.click(screen.getAllByRole('button', { name: /^yes$/i }).at(-1))

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.tipsOrCommissionLabel).toBe('commission')
    expect(payload.tipsCommissionOnlyPosition).toBe(true)
  })

  it('does not stamp tipsOrCommissionEnabledAt again on a re-entry where it was already enabled', async () => {
    const config = {
      ...BASE_CONFIG,
      employerPreset: null,
      tipsOrCommissionEnabled: true,
      tipsOrCommissionLabel: 'tips',
      tipsOrCommissionEnabledAt: '2026-01-01',
    }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL gate -> No (clears baseRate/shiftHours)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onComplete.mock.calls[0][0].tipsOrCommissionEnabledAt).toBe('2026-01-01')
  })

  it('clears tipsOrCommissionEnabledAt when turned back off', async () => {
    const config = {
      ...BASE_CONFIG,
      employerPreset: null,
      tipsOrCommissionEnabled: true,
      tipsOrCommissionLabel: 'tips',
      tipsOrCommissionEnabledAt: '2026-01-01',
    }
    const { onComplete } = renderWizard({ lifeEvent: 'changed_jobs', config })
    clickNext()
    fireEvent.click(screen.getByRole('button', { name: /^no$/i })) // DHL gate -> No (clears baseRate/shiftHours)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 19\.65/i), { target: { value: '21.15' } })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 10/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /^weekly$/i }))
    // Two "No" pills now exist (DHL gate + tips/commission block) — the tips/commission
    // one renders later in the same Step1 tree, so it's the last match.
    fireEvent.click(screen.getAllByRole('button', { name: /^no$/i }).at(-1))

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.tipsOrCommissionEnabled).toBe(false)
    expect(payload.tipsOrCommissionEnabledAt).toBeNull()
  })
})
