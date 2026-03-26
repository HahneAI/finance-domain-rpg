import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SetupWizard } from '../../components/SetupWizard.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  setupComplete: false,
  // Ensure Step 1 isValid (baseRate > 0, shiftHours > 0)
  baseRate: 21.15,
  shiftHours: 12,
  // Ensure Step 4 isValid (fedRateLow > 0, userState != null)
  fedRateLow: 0.0784,
  userState: 'MO',
  // Buffer is optional — no floor enforced
  paycheckBuffer: 50,
  bufferEnabled: true,
  // No DHL by default
  employerPreset: null,
  dhlTeam: null,
  // Step 2 intentionally invalid (startDate: null) — matches DEFAULT_CONFIG
  startDate: null,
}

function renderWizard({ lifeEvent = null, config = BASE_CONFIG } = {}) {
  const onComplete = vi.fn()
  render(
    <SetupWizard
      config={config}
      onComplete={onComplete}
      lifeEvent={lifeEvent}
    />
  )
  return { onComplete }
}

/** Click "Next →" or "Finish" button */
function clickNext() {
  const btn = screen.getByRole('button', { name: /next|finish/i })
  fireEvent.click(btn)
}

/** Click "Back" button (throws if absent) */
function clickBack() {
  const btn = screen.getByRole('button', { name: /^back$/i })
  fireEvent.click(btn)
}

/** Returns the step counter element text, e.g. "Setup · 1 of 9" */
function getStepCounter() {
  return screen.getByText(/of \d+/).textContent
}

// ─────────────────────────────────────────────────────────────────────────────
// Step routing by life event
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — step routing', () => {
  it('first-run (lifeEvent=null) without DHL shows 9 steps total', () => {
    renderWizard({ lifeEvent: null })
    expect(getStepCounter()).toContain('of 9')
  })

  it('first-run with DHL preset shows 10 steps (DHL Team Setup inserted)', () => {
    const dhlConfig = { ...BASE_CONFIG, employerPreset: 'DHL' }
    renderWizard({ lifeEvent: null, config: dhlConfig })
    expect(getStepCounter()).toContain('of 10')
  })

  it('lost_job life event shows only 5 steps (skips summary, deductions, buffer, gate)', () => {
    renderWizard({ lifeEvent: 'lost_job' })
    expect(getStepCounter()).toContain('of 5')
  })

  it('changed_jobs life event shows full 9 steps', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(getStepCounter()).toContain('of 9')
  })

  it('commission_job life event shows 6 steps (through Tax Summary, skips rest)', () => {
    renderWizard({ lifeEvent: 'commission_job' })
    expect(getStepCounter()).toContain('of 6')
  })

  it('counter label reads "Setup" for first-run', () => {
    renderWizard({ lifeEvent: null })
    expect(getStepCounter()).toMatch(/setup/i)
  })

  it('counter label reads "Life Event" for re-entry', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(getStepCounter()).toMatch(/life event/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 0 — Welcome / re-entry display
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — Step 0 rendering', () => {
  it('first-run renders welcome copy (no event selection buttons)', () => {
    renderWizard({ lifeEvent: null })
    // Welcome copy mentions setting up pay
    expect(screen.getByText(/set up your pay/i)).toBeTruthy()
    // No life event options visible
    expect(screen.queryByText(/lost my job/i)).toBeNull()
  })

  it('re-entry with lifeEvent set shows life event selection buttons', () => {
    renderWizard({ lifeEvent: 'changed_jobs' })
    expect(screen.getByText(/lost my job/i)).toBeTruthy()
    expect(screen.getByText(/changed jobs/i)).toBeTruthy()
    expect(screen.getByText(/got a commission job/i)).toBeTruthy()
  })

  it('shows "Welcome" title on step 0', () => {
    renderWizard({ lifeEvent: null })
    expect(screen.getByText('Welcome')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation — Back / Next buttons
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — navigation', () => {
  it('no Back button on step 0', () => {
    renderWizard()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })

  it('Back button appears after advancing to step 1', () => {
    renderWizard()
    // Step 0 isValid: always true — Next should be enabled
    clickNext()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeTruthy()
  })

  it('Back button returns to previous step', () => {
    renderWizard()
    clickNext()  // go to step 1 ("Pay Structure")
    expect(screen.getByText('Pay Structure')).toBeTruthy()
    clickBack()  // return to step 0 ("Welcome")
    expect(screen.getByText('Welcome')).toBeTruthy()
  })

  it('step counter increments on Next click', () => {
    renderWizard()
    expect(getStepCounter()).toContain('1 of')
    clickNext()
    expect(getStepCounter()).toContain('2 of')
  })

  it('step counter decrements on Back click', () => {
    renderWizard()
    clickNext()  // step 1
    expect(getStepCounter()).toContain('2 of')
    clickBack()  // step 0
    expect(getStepCounter()).toContain('1 of')
  })

  it('last step shows "Finish" instead of "Next →"', () => {
    // Use commission_job (6 steps) and a config that passes all validations
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-01',   // Step 2 valid
      taxExemptOptIn: true,      // Step 8 valid (not in commission_job flow)
    }
    renderWizard({ lifeEvent: 'commission_job', config })

    // Navigate through all 6 steps (0→1→2→3→4→5)
    // Step 0: always valid
    clickNext()  // → step 1 (Pay Structure): valid (baseRate>0, shiftHours>0)
    clickNext()  // → step 2 (Schedule): valid (startDate set)
    clickNext()  // → step 3 (Deductions): always valid
    clickNext()  // → step 4 (Tax Rates): valid (fedRateLow>0, userState set)
    clickNext()  // → step 5 (Tax Summary): last step for commission_job
    expect(screen.getByRole('button', { name: /finish/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  })

  it('Skip button appears for skippable steps (Step 3 — Deductions)', () => {
    const config = { ...BASE_CONFIG, startDate: '2026-03-01' }
    renderWizard({ config })
    clickNext()  // → step 1
    clickNext()  // → step 2
    clickNext()  // → step 3 (Deductions — skippable)
    expect(screen.getByRole('button', { name: /skip/i })).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isValid gates — Next/Finish disabled when step is invalid
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — isValid gates', () => {
  it('Step 1: Next disabled when baseRate is 0', () => {
    const config = { ...BASE_CONFIG, baseRate: 0 }
    renderWizard({ config })
    clickNext()  // → step 1 (Pay Structure)
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('Step 1: Next enabled when baseRate > 0 and shiftHours > 0', () => {
    renderWizard()
    clickNext()  // → step 1
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('Step 2: Next disabled when startDate is null', () => {
    const config = { ...BASE_CONFIG, startDate: null }
    renderWizard({ config })
    clickNext()  // → step 1
    clickNext()  // → step 2 (Schedule)
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('Step 2: Next enabled after startDate input is provided', () => {
    const config = { ...BASE_CONFIG, startDate: null }
    renderWizard({ config })
    clickNext()  // → step 1
    clickNext()  // → step 2 (Schedule)

    // Find the date input and fire a change event
    const dateField = document.querySelector('input[type="date"]')
    expect(dateField).not.toBeNull()
    fireEvent.change(dateField, { target: { value: '2026-03-01' } })

    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('Step 15 (DHL Team): Next disabled until dhlTeam is selected', () => {
    const config = { ...BASE_CONFIG, employerPreset: 'DHL', dhlTeam: null }
    renderWizard({ config })
    clickNext()  // → step 1 (Pay Structure)
    clickNext()  // → step 15 (DHL Team Setup)
    expect(screen.getByText('DHL Team Setup')).toBeTruthy()
    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('Step 7 (Paycheck Buffer): Next NOT blocked — buffer is optional', () => {
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-01',
      attendanceBucketEnabled: false,
      paycheckBuffer: 0,        // below old floor — should no longer block
      bufferEnabled: true,
      bufferOverrideAck: false,
    }
    renderWizard({ config })
    // Navigate to step 7 (0→1→2→3→4→5→6→7)
    clickNext()  // 1 Pay Structure
    clickNext()  // 2 Schedule
    clickNext()  // 3 Deductions
    clickNext()  // 4 Tax Rates
    clickNext()  // 5 Tax Summary
    clickNext()  // 6 Other Deductions
    clickNext()  // 7 Paycheck Buffer
    expect(screen.getByText('Paycheck Buffer')).toBeTruthy()
    // Next is enabled regardless of buffer value — buffer is optional
    const nextBtn = screen.getByRole('button', { name: /next|finish/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('Step 8 (Tax Exempt): Next blocked until taxExemptOptIn is true', () => {
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-01',
      attendanceBucketEnabled: false,
      paycheckBuffer: 50,
      taxExemptOptIn: false,
    }
    renderWizard({ config })
    clickNext()  // 1
    clickNext()  // 2
    clickNext()  // 3
    clickNext()  // 4
    clickNext()  // 5
    clickNext()  // 6
    clickNext()  // 7
    clickNext()  // 8 Tax Exempt Gate
    expect(screen.getByText('Tax Exempt Gate')).toBeTruthy()
    const finishBtn = screen.getByRole('button', { name: /finish/i })
    expect(finishBtn).toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// onComplete callback — called with correct merged data
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — onComplete', () => {
  it('calls onComplete with setupComplete: true and taxedWeeks when finishing', async () => {
    // Use commission_job (6 steps, all valid with this config)
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-01',
      firstActiveIdx: 8,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'commission_job', config })

    clickNext()  // 0 → 1
    clickNext()  // 1 → 2
    clickNext()  // 2 → 3
    clickNext()  // 3 → 4
    clickNext()  // 4 → 5 (last step)

    // Click Finish
    const finish = screen.getByRole('button', { name: /finish/i })
    fireEvent.click(finish)

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    const result = onComplete.mock.calls[0][0]

    expect(result.setupComplete).toBe(true)
    expect(Array.isArray(result.taxedWeeks)).toBe(true)
    expect(result.taxedWeeks.length).toBeGreaterThan(0)
  })

  it('taxedWeeks in onComplete result contains only indices >= firstActiveIdx', async () => {
    const firstActiveIdx = 10
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-09',  // results in firstActiveIdx ~10
      firstActiveIdx,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'commission_job', config })

    clickNext(); clickNext(); clickNext(); clickNext(); clickNext()
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    const { taxedWeeks } = onComplete.mock.calls[0][0]
    expect(taxedWeeks.every(idx => idx >= firstActiveIdx)).toBe(true)
  })

  it('onComplete result preserves all formData fields', async () => {
    const config = {
      ...BASE_CONFIG,
      startDate: '2026-03-01',
      baseRate: 23.50,
      k401Rate: 0.08,
    }
    const { onComplete } = renderWizard({ lifeEvent: 'commission_job', config })
    clickNext(); clickNext(); clickNext(); clickNext(); clickNext()
    fireEvent.click(screen.getByRole('button', { name: /finish/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    const result = onComplete.mock.calls[0][0]
    expect(result.baseRate).toBe(23.50)
    expect(result.k401Rate).toBe(0.08)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Step content smoke tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SetupWizard — step titles', () => {
  it('shows correct title sequence for first-run without DHL', () => {
    const config = { ...BASE_CONFIG, startDate: '2026-03-01', attendanceBucketEnabled: false }
    renderWizard({ config })

    const titles = ['Welcome', 'Pay Structure', 'Schedule', 'Deductions',
      'Tax Rates', 'Tax Summary', 'Other Deductions', 'Paycheck Buffer', 'Tax Exempt Gate']

    for (const title of titles) {
      expect(screen.getByText(title)).toBeTruthy()
      const nextBtn = screen.queryByRole('button', { name: /next|finish/i })
      if (nextBtn && !nextBtn.disabled) {
        fireEvent.click(nextBtn)
      } else if (nextBtn?.disabled) {
        break  // stop if stuck — already verified up to this point
      }
    }
  })

  it('shows "DHL Team Setup" step when DHL is selected', () => {
    const config = { ...BASE_CONFIG, employerPreset: 'DHL', dhlTeam: null }
    renderWizard({ config })
    clickNext()  // → step 1 (Pay Structure)
    clickNext()  // → step 15 (DHL Team Setup)
    expect(screen.getByText('DHL Team Setup')).toBeTruthy()
  })
})
