import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SetupWizard } from '../../components/SetupWizard.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  setupComplete: false,
  baseRate: 21.15,
  shiftHours: 12,
  fedRateLow: 0.0784,
  userState: 'MO',
  startDate: '2026-03-01',
  attendanceBucketEnabled: false,
  paycheckBuffer: 50,
  bufferEnabled: true,
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

  it('Step 2: non-DHL requires standardWeeklyHours and payPeriodEndDay', () => {
    const config = { ...BASE_CONFIG, employerPreset: null, standardWeeklyHours: null, payPeriodEndDay: null }
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

    advanceSteps(4)
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.employerPreset).toBeNull()
    expect(payload.scheduleIsVariable).toBe(false)
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
    expect(screen.getByText(/ot multiplier/i)).toBeTruthy()
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
    const onComplete = finishWizard({ firstActiveIdx: 10 })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.taxedWeeks.every(idx => idx >= 10)).toBe(true)
  })

  it('preserves all formData fields in onComplete payload', async () => {
    const onComplete = finishWizard({ baseRate: 24.5, k401Rate: 0.08 })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const payload = onComplete.mock.calls[0][0]
    expect(payload.baseRate).toBe(24.5)
    expect(payload.k401Rate).toBe(0.08)
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
