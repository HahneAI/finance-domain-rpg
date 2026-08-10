import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupWizardAdlib } from '../../components/SetupWizardAdlib.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

function renderAdlib(config = DEFAULT_CONFIG) {
  const onHandoff = vi.fn()
  const onComplete = vi.fn()
  const onCancel = vi.fn()
  render(<SetupWizardAdlib config={config} onHandoff={onHandoff} onComplete={onComplete} onCancel={onCancel} />)
  return { onHandoff, onComplete, onCancel }
}

function selects() {
  return screen.getAllByRole('combobox')
}

function numbers() {
  return screen.getAllByRole('spinbutton')
}

function dateField() {
  return screen.getByLabelText('Start date')
}

function k401DateField() {
  return screen.getByLabelText('401k enrollment date')
}

// The single primary action button — its label flips between "Next" (more pages
// ahead) and "Continue Setup →" (the last page), but there is always exactly one.
function primaryBtn() {
  return screen.getByRole('button', { name: /^next$|continue setup|finish setup/i })
}

// The employment-status select stays mounted at index 0 for the whole Intake page (it
// never gets swapped out for a later clause) — every later blank's index below assumes that.
function chooseEmployed() {
  fireEvent.change(selects()[0], { target: { value: 'employed' } })
}

// Fills the base-user (non-DHL) Intake page completely and advances to the Schedule page.
function advanceToSchedule_baseUser() {
  chooseEmployed()
  fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
  fireEvent.change(selects()[2], { target: { value: 'weekly' } })
  fireEvent.change(numbers()[0], { target: { value: '21.15' } })
  fireEvent.change(numbers()[1], { target: { value: '10' } })
  fireEvent.click(primaryBtn())
}

// Fills the DHL Plant Intake page completely and advances to the Schedule page.
function advanceToSchedule_dhlPlant() {
  chooseEmployed()
  fireEvent.change(selects()[1], { target: { value: 'DHL' } })
  fireEvent.change(selects()[2], { target: { value: 'PLANT' } })
  fireEvent.change(selects()[3], { target: { value: 'B' } })
  fireEvent.change(selects()[4], { target: { value: 'night' } })
  fireEvent.change(selects()[5], { target: { value: 'weekly' } })
  fireEvent.click(primaryBtn())
}

// Fills the DHL Warehouse Intake page completely and advances to the Schedule page.
function advanceToSchedule_dhlWarehouse(team = 'MT', shiftHours = '10') {
  chooseEmployed()
  fireEvent.change(selects()[1], { target: { value: 'DHL' } })
  fireEvent.change(selects()[2], { target: { value: 'WAREHOUSE' } })
  fireEvent.change(selects()[3], { target: { value: team } })
  fireEvent.change(selects()[4], { target: { value: shiftHours } })
  fireEvent.change(selects()[5], { target: { value: 'night' } })
  fireEvent.change(selects()[6], { target: { value: 'weekly' } })
  fireEvent.click(primaryBtn())
}

// Fills the base-user Schedule page completely and advances to Deductions.
function advanceToDeductions_baseUser() {
  advanceToSchedule_baseUser()
  fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
  fireEvent.change(numbers()[0], { target: { value: '40' } })
  fireEvent.change(selects()[0], { target: { value: 'do' } })
  fireEvent.change(selects()[1], { target: { value: '1' } }) // Monday
  fireEvent.click(primaryBtn())
}

// Fills the DHL Plant Schedule page (just a start date) and advances to Deductions.
function advanceToDeductions_dhlPlant() {
  advanceToSchedule_dhlPlant()
  fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
  fireEvent.click(primaryBtn())
}

// Fills the base-user Deductions page (no benefits, attendance answered) and advances to Tax Rates.
function advanceToTaxRates_baseUser() {
  advanceToDeductions_baseUser()
  fireEvent.change(selects()[0], { target: { value: 'no' } }) // no benefits
  fireEvent.change(selects()[1], { target: { value: 'no' } }) // attendance
  fireEvent.click(primaryBtn())
}

// DHL Deductions is already valid with zero interaction — just click through to Tax Rates.
function advanceToTaxRates_dhlPlant() {
  advanceToDeductions_dhlPlant()
  fireEvent.click(primaryBtn())
}

// Fills the base-user Tax Rates page (single/MO, paystub applied) and advances to Wrap Up.
function advanceToWrapUp_baseUser() {
  advanceToTaxRates_baseUser()
  fireEvent.change(selects()[0], { target: { value: 'single' } })
  fireEvent.change(selects()[1], { target: { value: 'MO' } })
  fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
  fireEvent.change(screen.getByLabelText(/gross pay/i), { target: { value: '1050' } })
  fireEvent.change(screen.getByLabelText(/fed withheld/i), { target: { value: '82' } })
  fireEvent.change(screen.getByLabelText(/state withheld/i), { target: { value: '35' } })
  fireEvent.click(screen.getByRole('button', { name: /apply these rates/i }))
  fireEvent.click(primaryBtn())
}

// Fills the DHL Plant Tax Rates page (both paystub weeks applied) and advances to Wrap Up.
function advanceToWrapUp_dhlPlant() {
  advanceToTaxRates_dhlPlant()
  fireEvent.change(selects()[0], { target: { value: 'single' } })
  fireEvent.change(selects()[1], { target: { value: 'MO' } })
  fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
  const gross = screen.getAllByLabelText(/gross pay/i)
  const fed = screen.getAllByLabelText(/fed withheld/i)
  const state = screen.getAllByLabelText(/state withheld/i)
  fireEvent.change(gross[0], { target: { value: '1050' } })
  fireEvent.change(fed[0], { target: { value: '82' } })
  fireEvent.change(state[0], { target: { value: '35' } })
  fireEvent.change(gross[1], { target: { value: '1450' } })
  fireEvent.change(fed[1], { target: { value: '186' } })
  fireEvent.change(state[1], { target: { value: '58' } })
  fireEvent.click(screen.getByRole('button', { name: /apply these rates/i }))
  fireEvent.click(primaryBtn())
}

describe('SetupWizardAdlib — Intake page (Welcome + Pay Structure merged)', () => {
  it('disables the primary action until the employment-status blank is filled', () => {
    renderAdlib()
    expect(primaryBtn()).toBeDisabled()
  })

  it('reveals the Pay Structure clause on the same page as soon as "employed" is chosen — no page navigation', () => {
    renderAdlib()
    chooseEmployed()
    expect(screen.getByText(/I work for/i)).toBeTruthy()
    // Still one page: the employment-status select is still present, not swapped out.
    expect(selects()[0].value).toBe('employed')
    // More pages (Schedule, Deductions, Tax Rates) are still ahead for an employed user.
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
  })

  it('hands off directly to the jobless flow when "unemployed" is chosen, skipping Schedule/Deductions/Tax Rates entirely', () => {
    const { onHandoff } = renderAdlib()
    fireEvent.change(selects()[0], { target: { value: 'unemployed' } })
    expect(screen.queryByText(/I work for/i)).toBeNull()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
    expect(primaryBtn()).not.toBeDisabled()
    fireEvent.click(primaryBtn())
    expect(onHandoff).toHaveBeenCalledTimes(1)
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.startedUnemployed).toBe(true)
    expect(initialStepId).toBe(10)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const { onCancel } = renderAdlib()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('has no Back button on the first page', () => {
    renderAdlib()
    chooseEmployed()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })

  it('reveals the rate/shift/schedule blanks once "someone else" is chosen', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    expect(screen.getByText(/I get paid/i)).toBeTruthy()
    expect(primaryBtn()).toBeDisabled()
  })

  it('reveals the Site question once DHL is chosen, before any team question', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    expect(screen.getByText(/I work at the/i)).toBeTruthy()
    expect(screen.queryByText(/I'm on Team/i)).toBeNull()
    expect(screen.queryByText(/I'm on the/i)).toBeNull()
    expect(primaryBtn()).toBeDisabled()
  })

  it('Plant reveals Team, then shift + pay-schedule blanks progressively', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'PLANT' } })
    expect(screen.getByText(/I'm on Team/i)).toBeTruthy()
    expect(screen.queryByText(/I'm on the/i)).toBeNull() // Warehouse-only clause
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[3], { target: { value: 'A' } })
    expect(screen.getByText(/working the/i)).toBeTruthy()
  })

  it('Warehouse reveals a Mon-Thu/Wed-Sat team blank and a shift-length blank instead of Team A/B', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'WAREHOUSE' } })
    expect(screen.getByText(/I'm on the/i)).toBeTruthy()
    expect(screen.queryByText(/I'm on Team/i)).toBeNull()
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[3], { target: { value: 'MT' } })
    expect(screen.getByText(/team, on/i)).toBeTruthy()
    expect(screen.queryByText(/working the/i)).toBeNull() // still needs shift length first
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[4], { target: { value: '10' } })
    expect(screen.getByText(/working the/i)).toBeTruthy()
  })

  it('does not carry over startedUnemployed/employer/site/pay fields from an already-answered real config', () => {
    // A DHL admin's real config already has employerPreset/dhlSite/dhlTeam/userPaySchedule/etc.
    // answered. The preview must not pre-fill from that — every mandatory blank should
    // still require an explicit choice before the primary action enables.
    const answeredConfig = {
      ...DEFAULT_CONFIG,
      startedUnemployed: false,
      employerPreset: 'DHL',
      dhlSite: 'PLANT',
      dhlTeam: 'B',
      dhlNightShift: true,
      userPaySchedule: 'weekly',
      baseRate: 22.10,
      shiftHours: 12,
    }
    renderAdlib(answeredConfig)
    expect(primaryBtn()).toBeDisabled()
    expect(selects()[0].value).toBe('')
    chooseEmployed()
    expect(selects()[1].value).toBe('')
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    expect(selects()[2].value).toBe('')
  })
})

describe('SetupWizardAdlib — advancing from Intake to Schedule', () => {
  it('lands on the Schedule page (2 of 5) after completing a base-user Intake page', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByText(/I started on/i)).toBeTruthy()
    expect(screen.getByText(/Setup · 2 of 5/i)).toBeTruthy()
  })

  it('shows a Back button on the Schedule page that returns to Intake', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByRole('button', { name: /^back$/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByText(/I work for/i)).toBeTruthy()
    expect(screen.getByText(/Setup · 1 of 5/i)).toBeTruthy()
  })
})

describe('SetupWizardAdlib — Schedule page (base user)', () => {
  it('disables the primary action until the start date is filled', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(primaryBtn()).toBeDisabled()
  })

  it('reveals the hours clause once a start date is entered', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.getByText(/I work up to/i)).toBeTruthy()
  })

  it('reveals the acknowledgment clause once hours are entered, and gates on answering "do"', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(numbers()[0], { target: { value: '40' } })
    expect(screen.getByText(/understand this hours number/i)).toBeTruthy()
    expect(screen.queryByText(/pay period closes on/i)).toBeNull()

    fireEvent.change(selects()[0], { target: { value: 'do' } })
    expect(screen.getByText(/pay period closes on/i)).toBeTruthy()
  })

  it('does not carry over startDate/maxWeeklyHours/hoursUnderstood from an already-answered real config', () => {
    const answeredConfig = {
      ...DEFAULT_CONFIG,
      startDate: '2025-01-01',
      maxWeeklyHours: 45,
      hoursUnderstood: true,
      payPeriodEndDay: 3,
    }
    renderAdlib(answeredConfig)
    advanceToSchedule_baseUser()
    expect(dateField().value).toBe('')
    expect(primaryBtn()).toBeDisabled()
  })

  it('advances to the Deductions page (not a handoff) once the Schedule page is complete', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(numbers()[0], { target: { value: '40' } })
    fireEvent.change(selects()[0], { target: { value: 'do' } })
    fireEvent.change(selects()[1], { target: { value: '1' } }) // Monday
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
    fireEvent.click(primaryBtn())
    expect(screen.getByText(/Setup · 3 of 5/i)).toBeTruthy()
    expect(screen.getByText(/benefits or deductions/i)).toBeTruthy()
  })

  it('requires the payday-parity answer for a biweekly/salary pay schedule before proceeding', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'biweekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    fireEvent.click(primaryBtn())

    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(numbers()[0], { target: { value: '40' } })
    fireEvent.change(selects()[0], { target: { value: 'do' } })
    fireEvent.change(selects()[1], { target: { value: '1' } }) // Monday
    expect(screen.getByText(/one of my paydays/i)).toBeTruthy()
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[2], { target: { value: 'this' } })
    expect(primaryBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Schedule page (DHL Plant)', () => {
  it('reveals the Short/Long Week clause once a start date is entered, but does not require it', () => {
    renderAdlib()
    advanceToSchedule_dhlPlant()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.getByText(/Right now I'm on my/i)).toBeTruthy()
    // Not required by the real Step2 gate — Next is already enabled.
    expect(primaryBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Schedule page (DHL Warehouse)', () => {
  it('does not show the Short/Long Week clause — nothing to ask beyond the start date', () => {
    renderAdlib()
    advanceToSchedule_dhlWarehouse()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.queryByText(/Right now I'm on my/i)).toBeNull()
    expect(screen.queryByText(/which week are you currently on/i)).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Deductions page (base user)', () => {
  it('is page 3 of 5 (not the last page) and reads "Next", not "Continue Setup"', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    expect(screen.getByText(/Setup · 3 of 5/i)).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
    expect(primaryBtn()).toBeDisabled() // attendance still required
  })

  it('reveals the attendance question once the benefits gate is answered either way', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    expect(screen.queryByText(/formal points or hours system/i)).toBeNull()
    fireEvent.change(selects()[0], { target: { value: 'no' } })
    expect(screen.getByText(/formal points or hours system/i)).toBeTruthy()
  })

  it('reveals benefit chips once answered "have", and a $ blank once a weekly benefit is toggled on', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    expect(screen.getByText(/I'm enrolled in/i)).toBeTruthy()
    const healthChip = screen.getByRole('button', { name: /health \/ medical/i })
    fireEvent.click(healthChip)
    expect(screen.getByText(/Health \/ Medical costs \$/i)).toBeTruthy()
    expect(numbers().length).toBeGreaterThan(0)
  })

  it('gates the primary action on the selected weekly benefit amount being filled', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /health \/ medical/i }))
    fireEvent.change(selects()[1], { target: { value: 'no' } }) // attendance answered
    expect(primaryBtn()).toBeDisabled() // health $ amount still blank

    fireEvent.change(numbers()[0], { target: { value: '18.50' } })
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('deselecting a benefit removes its clause and clears the gate on it', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    const healthChip = screen.getByRole('button', { name: /health \/ medical/i })
    fireEvent.click(healthChip)
    expect(screen.getByText(/Health \/ Medical costs \$/i)).toBeTruthy()
    fireEvent.click(healthChip)
    expect(screen.queryByText(/Health \/ Medical costs \$/i)).toBeNull()
  })

  it('401k reveals a contribution-rate and enrollment-date blank, both required', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /401k \/ retirement/i }))
    expect(screen.getByText(/I put/i)).toBeTruthy()
    fireEvent.change(selects()[1], { target: { value: 'no' } }) // attendance answered
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(numbers()[0], { target: { value: '6' } })
    expect(primaryBtn()).toBeDisabled() // still needs the enrollment date
    fireEvent.change(k401DateField(), { target: { value: '2026-05-01' } })
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('advances to the Tax Rates page (not a handoff) once Deductions is complete', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /health \/ medical/i }))
    fireEvent.change(numbers()[0], { target: { value: '18.50' } })
    fireEvent.change(selects()[1], { target: { value: 'yes' } }) // attendance
    expect(primaryBtn()).not.toBeDisabled()
    fireEvent.click(primaryBtn())
    expect(screen.getByText(/Setup · 4 of 5/i)).toBeTruthy()
    expect(screen.getByText(/I officially file/i)).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
  })
})

describe('SetupWizardAdlib — Deductions page (DHL)', () => {
  it('is already valid with zero interaction — advances straight to Tax Rates', () => {
    renderAdlib()
    advanceToDeductions_dhlPlant()
    expect(screen.queryByText(/formal points or hours system/i)).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
    fireEvent.click(primaryBtn())
    expect(screen.getByText(/I officially file/i)).toBeTruthy()
  })

  it('does not carry over selectedBenefits/attendanceBucketEnabled from an already-answered real config', () => {
    const answeredConfig = {
      ...DEFAULT_CONFIG,
      selectedBenefits: ['health', 'k401'],
      healthPremium: 40,
      attendanceBucketEnabled: false,
    }
    renderAdlib(answeredConfig)
    advanceToDeductions_dhlPlant()
    expect(screen.queryByText(/I'm enrolled in/i)).toBeNull()
    expect(selects()[0].value).toBe('')
  })
})

describe('SetupWizardAdlib — Tax Rates page (base user)', () => {
  it('is page 4 of 5 (not the last page) and Next starts disabled', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    expect(screen.getByText(/Setup · 4 of 5/i)).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
    expect(primaryBtn()).toBeDisabled()
  })

  it('renders the filing-status and state blanks as one sentence', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    expect(screen.getByText(/I officially file/i)).toBeTruthy()
    expect(screen.getByText(/living in the state of/i)).toBeTruthy()
    expect(selects().length).toBe(2)
  })

  it('does not show the Recalculate Using Paystub button until both selectors are filled', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    expect(screen.queryByRole('button', { name: /recalculate using paystub/i })).toBeNull()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    expect(screen.queryByRole('button', { name: /recalculate using paystub/i })).toBeNull()
    fireEvent.change(selects()[1], { target: { value: 'MO' } })
    expect(screen.getByRole('button', { name: /recalculate using paystub/i })).toBeTruthy()
  })

  it('reveals the paystub calculator when Recalculate Using Paystub is clicked, single-week for a non-variable schedule', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    fireEvent.change(selects()[1], { target: { value: 'MO' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    expect(screen.getByText(/Typical Paycheck/i)).toBeTruthy()
    expect(screen.queryByText(/Longer Week Paystub/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /apply these rates/i })).toBeNull()
  })

  it('hides the State Withheld field for a no-income-tax state', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    fireEvent.change(selects()[1], { target: { value: 'TX' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    expect(screen.queryByLabelText(/state withheld/i)).toBeNull()
  })

  it('applies computed rates and satisfies the mandatory-field gate', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    fireEvent.change(selects()[1], { target: { value: 'MO' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    fireEvent.change(screen.getByLabelText(/gross pay/i), { target: { value: '1050' } })
    fireEvent.change(screen.getByLabelText(/fed withheld/i), { target: { value: '82' } })
    fireEvent.change(screen.getByLabelText(/state withheld/i), { target: { value: '35' } })
    expect(primaryBtn()).toBeDisabled() // hasn't applied yet
    fireEvent.click(screen.getByRole('button', { name: /apply these rates/i }))
    expect(primaryBtn()).not.toBeDisabled()
    expect(screen.queryByText(/Typical Paycheck/i)).toBeNull() // calculator collapses after apply
  })

  it('advances to the Wrap Up page (not a handoff) once Tax Rates is complete', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    fireEvent.change(selects()[1], { target: { value: 'MO' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    fireEvent.change(screen.getByLabelText(/gross pay/i), { target: { value: '1050' } })
    fireEvent.change(screen.getByLabelText(/fed withheld/i), { target: { value: '82' } })
    fireEvent.change(screen.getByLabelText(/state withheld/i), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: /apply these rates/i }))
    expect(primaryBtn()).not.toBeDisabled()
    fireEvent.click(primaryBtn())
    expect(screen.getByText(/Setup · 5 of 5/i)).toBeTruthy()
    expect(screen.getByText(/Here's my estimated/i)).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i)
  })
})

describe('SetupWizardAdlib — Tax Rates page (DHL Plant, variable schedule)', () => {
  it('shows a second Longer Week Paystub box and applies distinct short/long rates, then advances to Wrap Up', () => {
    renderAdlib()
    advanceToTaxRates_dhlPlant()
    fireEvent.change(selects()[0], { target: { value: 'single' } })
    fireEvent.change(selects()[1], { target: { value: 'MO' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    expect(screen.getByText(/Shorter Week Paystub/i)).toBeTruthy()
    expect(screen.getByText(/Longer Week Paystub/i)).toBeTruthy()

    const gross = screen.getAllByLabelText(/gross pay/i)
    const fed = screen.getAllByLabelText(/fed withheld/i)
    const state = screen.getAllByLabelText(/state withheld/i)
    fireEvent.change(gross[0], { target: { value: '1050' } })
    fireEvent.change(fed[0], { target: { value: '82' } })
    fireEvent.change(state[0], { target: { value: '35' } })
    fireEvent.change(gross[1], { target: { value: '1450' } })
    fireEvent.change(fed[1], { target: { value: '186' } })
    fireEvent.change(state[1], { target: { value: '58' } })
    fireEvent.click(screen.getByRole('button', { name: /apply these rates/i }))
    fireEvent.click(primaryBtn())
    expect(screen.getByText(/Setup · 5 of 5/i)).toBeTruthy()
  })
})

describe('SetupWizardAdlib — Wrap Up page (base user)', () => {
  it('is the last page (5 of 5) and Finish Setup is already enabled — nothing is required', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(/Setup · 5 of 5/i)).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i)
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('renders a live net-estimate summary with Gross Pay and Net rows', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(/Gross Pay/i)).toBeTruthy()
    expect(screen.getByText(/Federal Tax/i)).toBeTruthy()
    expect(screen.getByText(/^Net$/i)).toBeTruthy()
  })

  it('shows the buffer amount blank by default — buffer defaults on', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(/a paycheck buffer/i)).toBeTruthy()
    expect(screen.getByText(/per check\./i)).toBeTruthy()
    expect(numbers().length).toBeGreaterThan(0)
  })

  it('hides the buffer amount blank once turned off', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'off' } })
    expect(screen.queryByText(/per check\./i)).toBeNull()
    expect(primaryBtn()).not.toBeDisabled() // still nothing required
  })

  it('completes and calls onComplete with a fully normalized final config (finalizeWizardConfig)', () => {
    const { onComplete, onHandoff } = renderAdlib()
    advanceToWrapUp_baseUser()
    fireEvent.click(primaryBtn())
    expect(onHandoff).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledTimes(1)
    const finalConfig = onComplete.mock.calls[0][0]
    expect(finalConfig.filingStatus).toBe('single')
    // freedomAllowanceEnabled defaults to "on" for display (`?? true`) without being written to
    // formData until the user actually touches the toggle — same as real Step7 — but
    // finalizeWizardConfig() normalizes freedomAllowance to 50 in the saved config regardless.
    expect(finalConfig.freedomAllowanceEnabled).not.toBe(false)
    expect(finalConfig.freedomAllowance).toBe(50)
    expect(finalConfig.setupComplete).toBe(true)
    expect(finalConfig.accountCreatedIdx).not.toBeNull()
    expect(Array.isArray(finalConfig.taxedWeeks)).toBe(true)
  })
})

describe('SetupWizardAdlib — Wrap Up page (DHL Plant, variable schedule)', () => {
  it('completes with distinct short/long tax rates carried through to the final payload, and DHL overrides applied', () => {
    const { onComplete } = renderAdlib()
    advanceToWrapUp_dhlPlant()
    fireEvent.click(primaryBtn())
    const finalConfig = onComplete.mock.calls[0][0]
    expect(finalConfig.fedRateLow).toBeCloseTo(82 / 1050, 4)
    expect(finalConfig.fedRateHigh).toBeCloseTo(186 / 1450, 4)
    expect(finalConfig.fedRateLow).not.toBeCloseTo(finalConfig.fedRateHigh, 4)
    // DHL enforced overrides (finalizeWizardConfig)
    expect(finalConfig.payPeriodEndDay).toBe(0)
    expect(finalConfig.otThreshold).toBe(40)
    expect(finalConfig.otMultiplier).toBe(1.5)
    expect(finalConfig.setupComplete).toBe(true)
  })
})

describe('SetupWizardAdlib — resumeFormData', () => {
  it('reopens on the Wrap Up page (page 5, the last page) pre-filled with the in-progress answers, for an employed resume', () => {
    const resumeFormData = {
      ...DEFAULT_CONFIG,
      startedUnemployed: false,
      employerPreset: null,
      userPaySchedule: 'weekly',
      baseRate: 21.15,
      shiftHours: 10,
      startDate: '2026-03-01',
      maxWeeklyHours: 40,
      hoursUnderstood: true,
      payPeriodEndDay: 0,
      attendanceBucketEnabled: true,
      filingStatus: 'single',
      userState: 'MO',
      fedRateLow: 0.08,
      fedRateHigh: 0.08,
      stateRateLow: 0.03,
      stateRateHigh: 0.03,
      taxRatesEstimated: false,
      freedomAllowanceEnabled: true,
      freedomAllowance: 50,
    }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/Here's my estimated/i)).toBeTruthy()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i)
  })

  it('reopens on just the employment-status clause (page 1) for a resumed jobless answer', () => {
    const resumeFormData = { ...DEFAULT_CONFIG, startedUnemployed: true }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/right now, i am/i)).toBeTruthy()
    expect(screen.queryByText(/I work for/i)).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
  })
})
