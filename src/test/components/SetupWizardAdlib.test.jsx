import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupWizardAdlib } from '../../components/SetupWizardAdlib.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

function renderAdlib(config = DEFAULT_CONFIG) {
  const onHandoff = vi.fn()
  const onCancel = vi.fn()
  render(<SetupWizardAdlib config={config} onHandoff={onHandoff} onCancel={onCancel} />)
  return { onHandoff, onCancel }
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

// The single primary action button — its label flips between "Next" (more pages
// ahead) and "Continue Setup →" (the last page), but there is always exactly one.
function primaryBtn() {
  return screen.getByRole('button', { name: /^next$|continue setup/i })
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
    // A second page (Schedule) is still ahead for an employed user.
    expect(primaryBtn()).toHaveTextContent(/^next$/i)
  })

  it('hands off directly to the jobless flow when "unemployed" is chosen, skipping Schedule entirely', () => {
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

  it('calls onCancel when Exit Preview is clicked', () => {
    const { onCancel } = renderAdlib()
    fireEvent.click(screen.getByRole('button', { name: /exit preview/i }))
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
  it('lands on the Schedule page after completing a base-user Intake page', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByText(/I started on/i)).toBeTruthy()
    expect(screen.getByText(/Ad-Lib Preview · 2 of 2/i)).toBeTruthy()
  })

  it('shows a Back button on the Schedule page that returns to Intake', () => {
    renderAdlib()
    advanceToSchedule_baseUser()
    expect(screen.getByRole('button', { name: /^back$/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByText(/I work for/i)).toBeTruthy()
    expect(screen.getByText(/Ad-Lib Preview · 1 of 2/i)).toBeTruthy()
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

  it('completes the weekly path and hands off to Deductions (step id 3)', () => {
    const { onHandoff } = renderAdlib()
    advanceToSchedule_baseUser()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.change(numbers()[0], { target: { value: '40' } })
    fireEvent.change(selects()[0], { target: { value: 'do' } })
    fireEvent.change(selects()[1], { target: { value: '1' } }) // Monday
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
    fireEvent.click(primaryBtn())
    expect(onHandoff).toHaveBeenCalledTimes(1)
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.startDate).toBe('2026-03-01')
    expect(mergedFormData.maxWeeklyHours).toBe(40)
    expect(mergedFormData.hoursUnderstood).toBe(true)
    expect(mergedFormData.payPeriodEndDay).toBe(1)
    expect(initialStepId).toBe(3)
  })

  it('requires the payday-parity answer for a biweekly/salary pay schedule before proceeding', () => {
    const { onHandoff } = renderAdlib()
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
    fireEvent.click(primaryBtn())
    const [mergedFormData] = onHandoff.mock.calls[0]
    expect(mergedFormData.biweeklyPayWeekParity).not.toBeNull()
  })
})

describe('SetupWizardAdlib — Schedule page (DHL Plant)', () => {
  it('reveals the Short/Long Week clause once a start date is entered, but does not require it', () => {
    renderAdlib()
    advanceToSchedule_dhlPlant()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.getByText(/Right now I'm on my/i)).toBeTruthy()
    // Not required by the real Step2 gate — Continue Setup is already enabled.
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('completes the Plant path and hands off to Deductions (step id 3) with DHL fields intact', () => {
    const { onHandoff } = renderAdlib()
    advanceToSchedule_dhlPlant()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.click(primaryBtn())
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.employerPreset).toBe('DHL')
    expect(mergedFormData.dhlSite).toBe('PLANT')
    expect(mergedFormData.dhlTeam).toBe('B')
    expect(mergedFormData.startDate).toBe('2026-03-01')
    expect(initialStepId).toBe(3)
  })
})

describe('SetupWizardAdlib — Schedule page (DHL Warehouse)', () => {
  it('does not show the Short/Long Week clause — nothing to ask beyond the start date', () => {
    renderAdlib()
    advanceToSchedule_dhlWarehouse()
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    expect(screen.queryByText(/Right now I'm on my/i)).toBeNull()
    expect(screen.queryByText(/which week are you currently on/i)).toBeNull()
    // Not required by the real Step2 gate — Continue Setup is already enabled
    // as soon as the start date is filled.
    expect(primaryBtn()).not.toBeDisabled()
  })

  it('completes the Warehouse path and hands off to Deductions (step id 3) with the Warehouse fields intact', () => {
    const { onHandoff } = renderAdlib()
    advanceToSchedule_dhlWarehouse('WS', '12')
    fireEvent.change(dateField(), { target: { value: '2026-03-01' } })
    fireEvent.click(primaryBtn())
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.employerPreset).toBe('DHL')
    expect(mergedFormData.dhlSite).toBe('WAREHOUSE')
    expect(mergedFormData.dhlTeam).toBe('WS')
    expect(mergedFormData.shiftHours).toBe(12)
    expect(mergedFormData.scheduleIsVariable).toBe(false)
    expect(mergedFormData.startDate).toBe('2026-03-01')
    expect(initialStepId).toBe(3)
  })
})

describe('SetupWizardAdlib — resumeFormData', () => {
  it('reopens on the Schedule page (page 2) pre-filled with the in-progress answers, for an employed resume', () => {
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
    }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/I started on/i)).toBeTruthy()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
  })

  it('reopens on just the employment-status clause (page 1) for a resumed jobless answer', () => {
    const resumeFormData = { ...DEFAULT_CONFIG, startedUnemployed: true }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/right now, i am/i)).toBeTruthy()
    expect(screen.queryByText(/I work for/i)).toBeNull()
    expect(primaryBtn()).not.toBeDisabled()
    expect(primaryBtn()).toHaveTextContent(/continue setup/i)
  })
})
