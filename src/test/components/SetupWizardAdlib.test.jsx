import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupWizardAdlib } from '../../components/SetupWizardAdlib.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// TypedText (SetupWizardAdlib.jsx) now renders each word of a clause as its own
// span (word-chunked stepped reveal, fixing the horizontal-overflow bug — see
// docs/TODO.md §19.1.F / drift-app-warden §7 F129), so a multi-word sentence is
// no longer one continuous text node RTL's default getByText can match (it only
// concatenates direct text-node children, not nested elements). This matcher
// checks the full recursive textContent instead, picking the innermost element
// whose own children don't already contain the match — the standard
// testing-library recipe for text split across elements.
function byText(regex) {
  return (_content, node) => {
    if (!node) return false
    const hasText = n => regex.test(n.textContent || '')
    const nodeHasText = hasText(node)
    const childrenDontHaveText = Array.from(node.children || []).every(child => !hasText(child))
    return nodeHasText && childrenDontHaveText
  }
}

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
    expect(screen.getByText(byText(/I work for/i))).toBeTruthy()
    // Still one page: the employment-status select is still present, not swapped out.
    expect(selects()[0].value).toBe('employed')
    // More pages (Schedule, Deductions, Tax Rates) are still ahead for an employed user.
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
  })

  it('hands off directly to the jobless flow when "unemployed" is chosen, skipping Schedule/Deductions/Tax Rates entirely', () => {
    const { onHandoff } = renderAdlib()
    fireEvent.change(selects()[0], { target: { value: 'unemployed' } })
    expect(screen.queryByText(byText(/I work for/i))).toBeNull()
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
    expect(screen.getByText(byText(/I get paid/i))).toBeTruthy()
    expect(primaryBtn()).toBeDisabled()
  })

  it('reveals the Site question once DHL is chosen, before any team question', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    expect(screen.getByText(byText(/I work at the/i))).toBeTruthy()
    expect(screen.queryByText(byText(/I'm on Team/i))).toBeNull()
    expect(screen.queryByText(byText(/I'm on the/i))).toBeNull()
    expect(primaryBtn()).toBeDisabled()
  })

  it('Plant reveals Team, then shift + pay-schedule blanks progressively', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'PLANT' } })
    expect(screen.getByText(byText(/I'm on Team/i))).toBeTruthy()
    expect(screen.queryByText(byText(/I'm on the/i))).toBeNull() // Warehouse-only clause
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[3], { target: { value: 'A' } })
    expect(screen.getByText(byText(/working the/i))).toBeTruthy()
  })

  it('Warehouse reveals a Mon-Thu/Wed-Sat team blank and a shift-length blank instead of Team A/B', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'WAREHOUSE' } })
    expect(screen.getByText(byText(/I'm on the/i))).toBeTruthy()
    expect(screen.queryByText(byText(/I'm on Team/i))).toBeNull()
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[3], { target: { value: 'MT' } })
    expect(screen.getByText(byText(/team, on/i))).toBeTruthy()
    expect(screen.queryByText(byText(/working the/i))).toBeNull() // still needs shift length first
    expect(primaryBtn()).toBeDisabled()

    fireEvent.change(selects()[4], { target: { value: '10' } })
    expect(screen.getByText(byText(/working the/i))).toBeTruthy()
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

describe('SetupWizardAdlib — Intake page field-parity additions (OT Threshold, DHL Weekend Differential, Tips/Commission)', () => {
  it('reveals the base-user Overtime Threshold blank only once pay structure is fully answered, and none of it gates the primary action', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'weekly' } })
    expect(screen.queryByText(byText(/my overtime kicks in at/i))).toBeNull()
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    expect(screen.queryByText(byText(/my overtime kicks in at/i))).toBeNull() // shiftHours still blank
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    expect(screen.getByText(byText(/my overtime kicks in at/i))).toBeTruthy()
    expect(screen.getByText(byText(/on top of that, i/i))).toBeTruthy() // tips/commission clause too
    expect(primaryBtn()).not.toBeDisabled() // neither field is required
  })

  it('a Custom Overtime Threshold reveals its own numeric blank', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'weekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    const otSelect = screen.getAllByRole('combobox').at(-2) // second-to-last select is OT threshold (tips is last)
    fireEvent.change(otSelect, { target: { value: 'custom' } })
    const customNum = numbers().at(-1)
    fireEvent.change(customNum, { target: { value: '45' } })
    expect(screen.getByText(byText(/hours a week\./i))).toBeTruthy()
  })

  it('DHL reveals an editable Weekend Differential blank once the pay-schedule clause is answered', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'PLANT' } })
    fireEvent.change(selects()[3], { target: { value: 'A' } })
    fireEvent.change(selects()[4], { target: { value: 'night' } })
    expect(screen.queryByText(byText(/my weekend differential is/i))).toBeNull()
    fireEvent.change(selects()[5], { target: { value: 'weekly' } })
    expect(screen.getByText(byText(/my weekend differential is/i))).toBeTruthy()
    // DHL_PRESET default (1.75) is pre-filled, editable rather than hardcoded/unchangeable.
    const diffInput = numbers().at(-1)
    expect(diffInput.value).toBe('1.75')
    fireEvent.change(diffInput, { target: { value: '2.5' } })
    expect(diffInput.value).toBe('2.5')
  })

  it('selecting "earn commission" reveals the commission-only-position follow-up blank', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'weekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    const tipsSelect = screen.getAllByRole('combobox').at(-1)
    fireEvent.change(tipsSelect, { target: { value: 'commission' } })
    expect(screen.getByText(byText(/this is/i))).toBeTruthy()
    expect(screen.getByText(byText(/we.ll ask a quick daily check-in/i))).toBeTruthy()
  })
})

describe('SetupWizardAdlib — advancing from Intake to Schedule', () => {
  it('lands on the Schedule page (2 of 5) after completing a base-user Intake page', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByText(byText(/I started on/i))).toBeTruthy()
    expect(screen.getByText(byText(/Setup · 2 of 5/i))).toBeTruthy()
  })

  it('shows a Back button on the Schedule page that returns to Intake', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByRole('button', { name: /^back$/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByText(byText(/I work for/i))).toBeTruthy()
    expect(screen.getByText(byText(/Setup · 1 of 5/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/I work up to/i))).toBeTruthy()
  })

  it('reveals the acknowledgment clause once hours are entered, and gates on answering "do"', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(numbers()[0], { target: { value: '40' } })
    expect(screen.getByText(byText(/understand this hours number/i))).toBeTruthy()
    expect(screen.queryByText(byText(/pay period closes on/i))).toBeNull()

    fireEvent.change(selects()[0], { target: { value: 'do' } })
    expect(screen.getByText(byText(/pay period closes on/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Setup · 3 of 5/i))).toBeTruthy()
    expect(screen.getByText(byText(/benefits or deductions/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/one of my paydays/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Right now I'm on my/i))).toBeTruthy()
    // Not required by the real Step2 gate — Next is already enabled.
    expect(primaryBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Schedule page (DHL Warehouse)', () => {
  it('does not show the Short/Long Week clause — nothing to ask beyond the start date', () => {
    renderAdlib()
    advanceToSchedule_dhlWarehouse()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.queryByText(byText(/Right now I'm on my/i))).toBeNull()
    expect(screen.queryByText(byText(/which week are you currently on/i))).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Deductions page (base user)', () => {
  it('is page 3 of 5 (not the last page) and reads "Next", not "Continue Setup"', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    expect(screen.getByText(byText(/Setup · 3 of 5/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
    expect(primaryBtn()).toBeDisabled() // attendance still required
  })

  it('reveals the attendance question once the benefits gate is answered either way', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    expect(screen.queryByText(byText(/formal points or hours system/i))).toBeNull()
    fireEvent.change(selects()[0], { target: { value: 'no' } })
    expect(screen.getByText(byText(/formal points or hours system/i))).toBeTruthy()
  })

  it('reveals benefit chips once answered "have", and a $ blank once a weekly benefit is toggled on', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    expect(screen.getByText(byText(/I'm enrolled in/i))).toBeTruthy()
    const healthChip = screen.getByRole('button', { name: /health \/ medical/i })
    fireEvent.click(healthChip)
    expect(screen.getByText(byText(/Health \/ Medical costs \$/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Health \/ Medical costs \$/i))).toBeTruthy()
    fireEvent.click(healthChip)
    expect(screen.queryByText(byText(/Health \/ Medical costs \$/i))).toBeNull()
  })

  it('401k reveals a contribution-rate and enrollment-date blank, both required', () => {
    renderAdlib()
    advanceToDeductions_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /401k \/ retirement/i }))
    expect(screen.getByText(byText(/I put/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Setup · 4 of 5/i))).toBeTruthy()
    expect(screen.getByText(byText(/I officially file/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
  })
})

describe('SetupWizardAdlib — Deductions page (DHL)', () => {
  it('is already valid with zero interaction — advances straight to Tax Rates', () => {
    renderAdlib()
    advanceToDeductions_dhlPlant()
    expect(screen.queryByText(byText(/formal points or hours system/i))).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
    fireEvent.click(primaryBtn())
    expect(screen.getByText(byText(/I officially file/i))).toBeTruthy()
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
    expect(screen.queryByText(byText(/I'm enrolled in/i))).toBeNull()
    expect(selects()[0].value).toBe('')
  })
})

describe('SetupWizardAdlib — Tax Rates page (base user)', () => {
  it('is page 4 of 5 (not the last page) and Next starts disabled', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    expect(screen.getByText(byText(/Setup · 4 of 5/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
    expect(primaryBtn()).toBeDisabled()
  })

  it('renders the filing-status and state blanks as one sentence', () => {
    renderAdlib()
    advanceToTaxRates_baseUser()
    expect(screen.getByText(byText(/I officially file/i))).toBeTruthy()
    expect(screen.getByText(byText(/living in the state of/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Typical Paycheck/i))).toBeTruthy()
    expect(screen.queryByText(byText(/Longer Week Paystub/i))).toBeNull()
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
    expect(screen.queryByText(byText(/Typical Paycheck/i))).toBeNull() // calculator collapses after apply
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
    expect(screen.getByText(byText(/Setup · 5 of 5/i))).toBeTruthy()
    expect(screen.getByText(byText(/Here's my estimated/i))).toBeTruthy()
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
    expect(screen.getByText(byText(/Shorter Week Paystub/i))).toBeTruthy()
    expect(screen.getByText(byText(/Longer Week Paystub/i))).toBeTruthy()

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
    expect(screen.getByText(byText(/Setup · 5 of 5/i))).toBeTruthy()
  })
})

describe('SetupWizardAdlib — Wrap Up page (base user)', () => {
  it('is the last page (5 of 5) and Finish Setup is already enabled — nothing is required', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(byText(/Setup · 5 of 5/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i)
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('renders a live net-estimate summary with Gross Pay and Net rows', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(byText(/Gross Pay/i))).toBeTruthy()
    expect(screen.getByText(byText(/Federal Tax/i))).toBeTruthy()
    expect(screen.getByText(byText(/^Net$/i))).toBeTruthy()
  })

  it('shows the buffer amount blank by default — buffer defaults on', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    expect(screen.getByText(byText(/a paycheck buffer/i))).toBeTruthy()
    expect(screen.getByText(byText(/per check\./i))).toBeTruthy()
    expect(numbers().length).toBeGreaterThan(0)
  })

  it('hides the buffer amount blank once turned off', () => {
    renderAdlib()
    advanceToWrapUp_baseUser()
    fireEvent.change(selects()[0], { target: { value: 'off' } })
    expect(screen.queryByText(byText(/per check\./i))).toBeNull()
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

describe('SetupWizardAdlib — full ad-lib-to-production completion (round-4 field parity)', () => {
  // Exercises a base-user run through every page, touching every field added across all four
  // field-parity rounds (Advanced Pay Rules, DHL rotation is Plant-only so out of scope for a
  // base-user run, Deductions' Benefits Start Date/Other Deductions/Attendance/PTO, Tax Rates'
  // "Use Estimate for Now" fallback, Wrap Up's Tax-Exempt opt-in), then asserts the final config
  // finalizeWizardConfig() hands to onComplete — grounded in that function's real, documented
  // behavior (drift-app-warden §7 F5/F13/F128), not a parallel assumption about what it does.
  it('completes and produces a correctly normalized final config touching every round 2-4 field', () => {
    const { onComplete } = renderAdlib()

    // ── Intake ──
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'weekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } }) // baseRate
    fireEvent.change(numbers()[1], { target: { value: '10' } })    // shiftHours

    // Base-user Overtime Threshold -> 48h
    fireEvent.change(screen.getByLabelText('Overtime threshold'), { target: { value: '48' } })

    // Advanced Pay Rules (round 4)
    fireEvent.click(screen.getByRole('button', { name: /advanced pay rules/i }))
    fireEvent.click(screen.getByRole('button', { name: '2×' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' })) // night differential enable
    fireEvent.change(screen.getByLabelText('Night differential rate, dollars per hour'), { target: { value: '2.25' } })
    fireEvent.change(screen.getByLabelText('Weekend differential, dollars per hour'), { target: { value: '3' } })

    // Tips/Commission opt-in (round 3)
    fireEvent.change(screen.getByLabelText('Tips or commission'), { target: { value: 'tips' } })

    fireEvent.click(primaryBtn())

    // ── Schedule ──
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('Max weekly hours'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Hours understood acknowledgment'), { target: { value: 'do' } })
    fireEvent.change(screen.getByLabelText('Pay period closing day'), { target: { value: '1' } }) // Monday
    fireEvent.click(primaryBtn())

    // ── Deductions (round 4) ──
    fireEvent.change(screen.getByLabelText('Benefits enrollment'), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Health / Medical' }))
    fireEvent.change(screen.getByLabelText('Health / Medical weekly cost, dollars'), { target: { value: '18.50' } })
    fireEvent.change(screen.getByLabelText('Benefits start date'), { target: { value: '2026-04-01' } })

    fireEvent.click(screen.getByRole('button', { name: /add deduction/i }))
    fireEvent.change(screen.getByLabelText('Deduction label'), { target: { value: 'Union Dues' } })
    fireEvent.change(screen.getByLabelText('Deduction amount per paycheck, dollars'), { target: { value: '12.50' } })

    fireEvent.change(screen.getByLabelText('Attendance tracking policy'), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /attendance policy details/i }))
    fireEvent.change(screen.getByLabelText('Attendance policy unit'), { target: { value: 'points' } })
    fireEvent.change(screen.getByLabelText('Attendance warning threshold'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Attendance termination threshold'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Attendance current balance'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Attendance per-event increment'), { target: { value: '1' } })

    fireEvent.change(screen.getByLabelText('PTO offered'), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: /pto policy details/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Per Hour Worked' }))
    fireEvent.change(screen.getByLabelText('Accrual Rate (hrs per hour worked)'), { target: { value: '0.05' } })
    fireEvent.change(screen.getByLabelText('PTO current balance, hours'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('PTO cap, hours'), { target: { value: '120' } })

    fireEvent.click(primaryBtn())

    // ── Tax Rates — "Use Estimate for Now" fallback path (round 4) ──
    fireEvent.change(screen.getByLabelText('Filing status'), { target: { value: 'mfj' } })
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'CA' } })
    fireEvent.click(screen.getByRole('button', { name: /recalculate using paystub/i }))
    fireEvent.click(screen.getByRole('button', { name: /use estimate for now/i }))
    fireEvent.click(primaryBtn())

    // ── Wrap Up — Paycheck Buffer amount + Tax-Exempt opt-in (round 4) ──
    fireEvent.change(screen.getByLabelText('Paycheck buffer amount, dollars'), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /request access/i }))
    expect(screen.getByText(byText(/tax-exempt projections — coming soon/i))).toBeTruthy()

    fireEvent.click(primaryBtn())

    expect(onComplete).toHaveBeenCalledTimes(1)
    const finalConfig = onComplete.mock.calls[0][0]

    // Advanced Pay Rules
    expect(finalConfig.otMultiplier).toBe(2)
    expect(finalConfig.nightDiffEnabled).toBe(true)
    expect(finalConfig.nightDiffRate).toBe(2.25)
    expect(finalConfig.diffRate).toBe(3)
    expect(finalConfig.otThreshold).toBe(48)

    // Tips/Commission — finalizeWizardConfig() stamps tipsOrCommissionEnabledAt on the
    // false→true transition (F128), which a real first-run account (no priorConfig) always is.
    expect(finalConfig.tipsOrCommissionEnabled).toBe(true)
    expect(finalConfig.tipsOrCommissionLabel).toBe('tips')
    expect(finalConfig.tipsOrCommissionEnabledAt).toBeTruthy()

    // Deductions round 4
    expect(finalConfig.selectedBenefits).toContain('health')
    expect(finalConfig.healthPremium).toBe(18.5)
    expect(finalConfig.benefitsStartDate).toBe('2026-04-01')
    expect(finalConfig.otherDeductions).toEqual([
      expect.objectContaining({ label: 'Union Dues', perCheckAmount: 12.5 }),
    ])
    expect(finalConfig.attendanceBucketEnabled).toBe(true)
    expect(finalConfig.attendanceUnit).toBe('points')
    expect(finalConfig.attendanceWarnThreshold).toBe(6)
    expect(finalConfig.attendanceTerminateThreshold).toBe(12)
    expect(finalConfig.attendanceCurrentBalance).toBe(2)
    expect(finalConfig.attendanceIncrement).toBe(1)
    expect(finalConfig.ptoEnabled).toBe(true)
    expect(finalConfig.ptoAccrualMethod).toBe('per_hour')
    expect(finalConfig.ptoAccrualRate).toBe(0.05)
    expect(finalConfig.ptoCurrentBalance).toBe(40)
    expect(finalConfig.ptoCap).toBe(120)

    // Tax Rates "Use Estimate for Now" fallback
    expect(finalConfig.taxRatesEstimated).toBe(true)
    expect(finalConfig.fedRateLow).toBe(0.10)
    expect(finalConfig.fedRateHigh).toBe(0.10) // fixed (non-variable) schedule

    // Wrap Up — buffer + Tax-Exempt opt-in
    expect(finalConfig.freedomAllowanceEnabled).not.toBe(false)
    expect(finalConfig.freedomAllowance).toBe(75)
    expect(finalConfig.taxExemptOptIn).toBe(true)

    // finalizeWizardConfig()'s own normalization (F5/F13/F128) — taxExemptOptIn: true makes
    // taxedWeeks derive to [] (finalizeWizardConfig's own "filed exempt" branch), same as it
    // would for real SetupWizard.jsx's identical opt-in.
    expect(finalConfig.setupComplete).toBe(true)
    expect(finalConfig.accountCreatedIdx).not.toBeNull()
    expect(Array.isArray(finalConfig.taxedWeeks)).toBe(true)
    expect(finalConfig.taxedWeeks).toEqual([])
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
    expect(screen.getByText(byText(/Here's my estimated/i))).toBeTruthy()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i)
  })

  it('reopens on just the employment-status clause (page 1) for a resumed jobless answer', () => {
    const resumeFormData = { ...DEFAULT_CONFIG, startedUnemployed: true }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(byText(/right now, i am/i))).toBeTruthy()
    expect(screen.queryByText(byText(/I work for/i))).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
  })
})

// ── lifeEvent re-entry (drift-app-warden §7 F139) — lost_job and commission_job both skip
// the employment-status question and Wrap Up entirely, and pre-fill formData from the real
// account config instead of blanking it (BLANK_PAY_FIELDS is first-run only).
describe('SetupWizardAdlib — lifeEvent re-entry plumbing (lost_job / commission_job)', () => {
  // A config close to DEFAULT_CONFIG but with the Schedule/Deductions fields an already-set-up
  // account would actually have answered — DEFAULT_CONFIG alone leaves startDate/
  // maxWeeklyHours/hoursUnderstood/attendanceBucketEnabled null, which isIntakeValid doesn't
  // require (base-user rate/shift fields are DEFAULT_CONFIG's own non-null defaults) but
  // isScheduleValid/isDeductionsValid do.
  const reEntryConfig = {
    ...DEFAULT_CONFIG,
    startedUnemployed: false,
    startDate: '2026-01-01',
    firstActiveIdx: 0,
    maxWeeklyHours: 40,
    hoursUnderstood: true,
    attendanceBucketEnabled: true,
  }

  it('lost_job: skips the employment-status clause, shows re-entry intro copy, is cancelable, and ends after Tax Rates (4 pages, no Wrap Up)', () => {
    const onComplete = vi.fn()
    const onHandoff = vi.fn()
    const onCancel = vi.fn()
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="lost_job" onHandoff={onHandoff} onComplete={onComplete} onCancel={onCancel} />)

    expect(screen.queryByText(byText(/right now, i am/i))).toBeNull()
    expect(screen.getByText(byText(/rebuild your pay for the new job/i))).toBeTruthy()
    expect(screen.getByText(byText(/Life Event · 1 of 4/i))).toBeTruthy()
    expect(screen.getByText(byText(/I work for/i))).toBeTruthy() // pay-structure clauses render immediately — isEmployed forced true
    expect(primaryBtn()).not.toBeDisabled() // reEntryConfig's pay fields already satisfy isIntakeValid

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.click(primaryBtn()) // -> Schedule
    expect(screen.getByText(byText(/Life Event · 2 of 4/i))).toBeTruthy()
    fireEvent.click(primaryBtn()) // -> Deductions
    expect(screen.getByText(byText(/Life Event · 3 of 4/i))).toBeTruthy()
    fireEvent.click(primaryBtn()) // -> Tax Rates
    expect(screen.getByText(byText(/Life Event · 4 of 4/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i) // last page — Tax Rates, not Wrap Up
    expect(screen.queryByText(byText(/here's my estimated/i))).toBeNull() // Wrap Up never renders

    fireEvent.click(primaryBtn())
    expect(onHandoff).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledTimes(1)
    const finalConfig = onComplete.mock.calls[0][0]
    // Wrap-Up-only fields still default correctly even with no Wrap Up page (finalizeWizardConfig
    // is unconditional — drift-app-warden §7 F5/F13).
    expect(finalConfig.setupComplete).toBe(true)
    expect(finalConfig.accountCreatedIdx).not.toBeNull()
    expect(Array.isArray(finalConfig.taxedWeeks)).toBe(true)
    expect(finalConfig.freedomAllowanceEnabled).not.toBe(false)
    expect(finalConfig.freedomAllowance).toBe(reEntryConfig.freedomAllowance ?? 50)
  })

  it('commission_job: shows re-entry intro copy and the Commission Income clause, ends after Tax Rates, and persists commissionMonthly', () => {
    const onComplete = vi.fn()
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="commission_job" onHandoff={vi.fn()} onComplete={onComplete} onCancel={vi.fn()} />)

    expect(screen.getByText(byText(/add your commission job to your pay structure/i))).toBeTruthy()
    expect(screen.getByText(byText(/my pay also/i))).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Commission income'), { target: { value: 'yes' } })
    fireEvent.change(screen.getByLabelText('Commission monthly average, dollars'), { target: { value: '900' } })

    fireEvent.click(primaryBtn()) // -> Schedule
    fireEvent.click(primaryBtn()) // -> Deductions
    fireEvent.click(primaryBtn()) // -> Tax Rates
    expect(screen.getByText(byText(/Life Event · 4 of 4/i))).toBeTruthy()
    fireEvent.click(primaryBtn())

    expect(onComplete).toHaveBeenCalledTimes(1)
    const finalConfig = onComplete.mock.calls[0][0]
    expect(finalConfig.commissionMonthly).toBe(900)
    expect(finalConfig.setupComplete).toBe(true)
    expect(Array.isArray(finalConfig.taxedWeeks)).toBe(true)
  })

  it("doesn't reveal the Commission Income clause on the lost_job path", () => {
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="lost_job" onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByText(byText(/my pay also/i))).toBeNull()
  })

  it('first-run (lifeEvent omitted/null) behavior is unchanged — still blanks formData and asks employment status first', () => {
    renderAdlib(DEFAULT_CONFIG)
    expect(screen.getByText(byText(/Setup · 1 of 5/i))).toBeTruthy()
    expect(screen.getByText(byText(/right now, i am/i))).toBeTruthy()
    expect(primaryBtn()).toBeDisabled()
  })
})

// ── Life-event pivot picker (drift-app-warden §7 F140) — structure_change is the only real
// entry point (App.jsx item 5); SetupWizardAdlib's internal LifeEventPivot is what makes
// lost_job/changed_jobs/commission_job reachable from it, mirroring real SetupWizard.jsx's own
// (previously dead) Step0 picker mechanism.
describe('SetupWizardAdlib — lifeEvent re-entry plumbing (structure_change + internal pivot)', () => {
  const reEntryConfig = {
    ...DEFAULT_CONFIG,
    startedUnemployed: false,
    startDate: '2026-01-01',
    firstActiveIdx: 0,
    maxWeeklyHours: 40,
    hoursUnderstood: true,
    attendanceBucketEnabled: true,
  }

  it('structure_change: shows the real Step0 intro copy, is a full 5-page flow (Wrap Up included), and offers the pivot picker below the intro', () => {
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="structure_change" onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(byText(/update your pay structure/i))).toBeTruthy()
    expect(screen.getByText(byText(/Life Event · 1 of 5/i))).toBeTruthy()
    expect(screen.getByText(byText(/something else changed instead/i))).toBeTruthy()
    expect(screen.getByText(byText(/lost my job/i))).toBeTruthy()
    expect(screen.getByText(byText(/changed jobs/i))).toBeTruthy()
    expect(screen.getByText(byText(/got a commission job/i))).toBeTruthy()
    // Pay-structure clauses (isEmployed forced true, employment-status question skipped)
    // still render alongside the pivot block, pre-filled from reEntryConfig.
    expect(screen.getByText(byText(/I work for/i))).toBeTruthy()
    expect(screen.queryByText(byText(/right now, i am/i))).toBeNull()
  })

  it('pivots from structure_change to commission_job via the picker: page set shrinks to 4 (no Wrap Up) and the Commission field appears', () => {
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="structure_change" onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(byText(/Life Event · 1 of 5/i))).toBeTruthy()
    expect(screen.queryByText(byText(/my pay also/i))).toBeNull()

    fireEvent.click(screen.getByText(byText(/got a commission job/i)))

    expect(screen.getByText(byText(/Life Event · 1 of 4/i))).toBeTruthy()
    expect(screen.getByText(byText(/my pay also/i))).toBeTruthy()
    // The structure_change-specific intro is gone post-pivot — only the generic picker remains.
    expect(screen.queryByText(byText(/update your pay structure/i))).toBeNull()
    expect(screen.getByText(byText(/what changed\? only the affected steps/i))).toBeTruthy()

    fireEvent.click(primaryBtn()) // -> Schedule
    fireEvent.click(primaryBtn()) // -> Deductions
    fireEvent.click(primaryBtn()) // -> Tax Rates
    expect(screen.getByText(byText(/Life Event · 4 of 4/i))).toBeTruthy()
    expect(primaryBtn()).toHaveTextContent(/finish setup/i) // last page — no Wrap Up
  })

  it('pivots from structure_change to changed_jobs: stays a full 5-page flow (Wrap Up included) and shows no diff summary at Wrap Up', () => {
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="structure_change" onHandoff={vi.fn()} onComplete={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByText(byText(/^changed jobs$/i)))
    expect(screen.getByText(byText(/Life Event · 1 of 5/i))).toBeTruthy()

    fireEvent.click(primaryBtn()) // -> Schedule
    fireEvent.click(primaryBtn()) // -> Deductions
    fireEvent.click(primaryBtn()) // -> Tax Rates
    fireEvent.click(primaryBtn()) // -> Wrap Up
    expect(screen.getByText(byText(/Life Event · 5 of 5/i))).toBeTruthy()
    expect(screen.queryByText(byText(/what's changing/i))).toBeNull()
  })

  it('structure_change completion renders the "What\'s Changing" diff at Wrap Up and calls onComplete', () => {
    const onComplete = vi.fn()
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="structure_change" onHandoff={vi.fn()} onComplete={onComplete} onCancel={vi.fn()} />)

    // Change the base rate on Intake so the frozen baseline (reEntryConfig) and the final
    // formData diverge — the diff summary should surface exactly this change.
    const rateInput = screen.getByLabelText('Hourly rate, dollars')
    fireEvent.change(rateInput, { target: { value: '24' } })

    fireEvent.click(primaryBtn()) // -> Schedule
    fireEvent.click(primaryBtn()) // -> Deductions
    fireEvent.click(primaryBtn()) // -> Tax Rates
    fireEvent.click(primaryBtn()) // -> Wrap Up

    expect(screen.getByText(byText(/what's changing/i))).toBeTruthy()
    expect(screen.getByText(byText(/base rate/i))).toBeTruthy()

    fireEvent.click(primaryBtn()) // Finish
    expect(onComplete).toHaveBeenCalledTimes(1)
    const finalConfig = onComplete.mock.calls[0][0]
    expect(finalConfig.baseRate).toBe(24)
    expect(finalConfig.setupComplete).toBe(true)
  })

  it('changed_jobs (direct entry): full page set including Wrap Up, no diff summary, completes normally', () => {
    const onComplete = vi.fn()
    render(<SetupWizardAdlib config={reEntryConfig} lifeEvent="changed_jobs" onHandoff={vi.fn()} onComplete={onComplete} onCancel={vi.fn()} />)

    expect(screen.getByText(byText(/Life Event · 1 of 5/i))).toBeTruthy()
    expect(screen.queryByText(byText(/right now, i am/i))).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()

    fireEvent.click(primaryBtn()) // -> Schedule
    fireEvent.click(primaryBtn()) // -> Deductions
    fireEvent.click(primaryBtn()) // -> Tax Rates
    fireEvent.click(primaryBtn()) // -> Wrap Up
    expect(screen.getByText(byText(/Life Event · 5 of 5/i))).toBeTruthy()
    expect(screen.queryByText(byText(/what's changing/i))).toBeNull()

    fireEvent.click(primaryBtn())
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0].setupComplete).toBe(true)
  })
})
