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

function continueBtn() {
  return screen.getByRole('button', { name: /continue setup/i })
}

// The employment-status select stays mounted at index 0 for the whole page (it never
// gets swapped out for a later clause) — every later blank's index below assumes that.
function chooseEmployed() {
  fireEvent.change(selects()[0], { target: { value: 'employed' } })
}

describe('SetupWizardAdlib — merged single-page flow', () => {
  it('disables Continue Setup until the employment-status blank is filled', () => {
    renderAdlib()
    expect(continueBtn()).toBeDisabled()
  })

  it('reveals the Pay Structure clause on the same page as soon as "employed" is chosen — no page navigation', () => {
    renderAdlib()
    chooseEmployed()
    expect(screen.getByText(/I work for/i)).toBeTruthy()
    // Still one page: the employment-status select is still present, not swapped out.
    expect(selects()[0].value).toBe('employed')
  })

  it('hands off directly to the jobless flow when "unemployed" is chosen, without any Pay Structure clause', () => {
    const { onHandoff } = renderAdlib()
    fireEvent.change(selects()[0], { target: { value: 'unemployed' } })
    expect(screen.queryByText(/I work for/i)).toBeNull()
    expect(continueBtn()).not.toBeDisabled()
    fireEvent.click(continueBtn())
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

  it('has no Back button — everything lives on one page', () => {
    renderAdlib()
    chooseEmployed()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })
})

describe('SetupWizardAdlib — Pay Structure clause (base user)', () => {
  it('reveals the rate/shift/schedule blanks once "someone else" is chosen', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    expect(screen.getByText(/I get paid/i)).toBeTruthy()
    expect(continueBtn()).toBeDisabled()
  })

  it('completes the hourly path and hands off to Schedule (step id 2)', () => {
    const { onHandoff } = renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'weekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    expect(continueBtn()).not.toBeDisabled()
    fireEvent.click(continueBtn())
    expect(onHandoff).toHaveBeenCalledTimes(1)
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.baseRate).toBe(21.15)
    expect(mergedFormData.shiftHours).toBe(10)
    expect(mergedFormData.userPaySchedule).toBe('weekly')
    expect(initialStepId).toBe(2)
  })

  it('completes the salary path and derives baseRate/shiftHours the same way the real wizard does', () => {
    const { onHandoff } = renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[2], { target: { value: 'salary' } })
    fireEvent.change(numbers()[0], { target: { value: '52000' } })
    fireEvent.click(continueBtn())
    const [mergedFormData] = onHandoff.mock.calls[0]
    expect(mergedFormData.annualSalary).toBe(52000)
    expect(mergedFormData.baseRate).toBeCloseTo(52000 / 2080)
    expect(mergedFormData.shiftHours).toBe(8)
  })
})

describe('SetupWizardAdlib — starts blank even from an already-answered real config', () => {
  // A DHL admin's real config already has employerPreset/dhlTeam/userPaySchedule/etc.
  // answered. The preview must not pre-fill from that — every mandatory blank should
  // still require an explicit choice before Continue Setup enables.
  const answeredConfig = {
    ...DEFAULT_CONFIG,
    startedUnemployed: false,
    employerPreset: 'DHL',
    dhlTeam: 'B',
    dhlNightShift: true,
    userPaySchedule: 'weekly',
    baseRate: 22.10,
    shiftHours: 12,
  }

  it('does not carry over startedUnemployed — Continue Setup stays disabled', () => {
    renderAdlib(answeredConfig)
    expect(continueBtn()).toBeDisabled()
    expect(selects()[0].value).toBe('')
  })

  it('does not carry over employer/team/pay-schedule once employed is chosen', () => {
    renderAdlib(answeredConfig)
    chooseEmployed()
    expect(selects()[1].value).toBe('')
    expect(continueBtn()).toBeDisabled()
  })
})

describe('SetupWizardAdlib — resumeFormData', () => {
  it('reopens with the Pay Structure clause already revealed, pre-filled with the in-progress answers', () => {
    const resumeFormData = {
      ...DEFAULT_CONFIG,
      startedUnemployed: false,
      employerPreset: null,
      userPaySchedule: 'weekly',
      baseRate: 21.15,
      shiftHours: 10,
    }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/I work for/i)).toBeTruthy()
    expect(continueBtn()).not.toBeDisabled()
  })

  it('reopens on just the employment-status clause for a resumed jobless answer', () => {
    const resumeFormData = { ...DEFAULT_CONFIG, startedUnemployed: true }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/right now, i am/i)).toBeTruthy()
    expect(screen.queryByText(/I work for/i)).toBeNull()
    expect(continueBtn()).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Pay Structure clause (DHL)', () => {
  it('reveals Team, then shift + pay-schedule blanks progressively', () => {
    renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    expect(screen.getByText(/I'm on Team/i)).toBeTruthy()
    expect(continueBtn()).toBeDisabled()

    fireEvent.change(selects()[2], { target: { value: 'A' } })
    expect(screen.getByText(/working the/i)).toBeTruthy()
  })

  it('completes the DHL path and hands off to Schedule with DHL defaults applied', () => {
    const { onHandoff } = renderAdlib()
    chooseEmployed()
    fireEvent.change(selects()[1], { target: { value: 'DHL' } })
    fireEvent.change(selects()[2], { target: { value: 'B' } })
    fireEvent.change(selects()[3], { target: { value: 'night' } })
    fireEvent.change(selects()[4], { target: { value: 'weekly' } })
    expect(continueBtn()).not.toBeDisabled()
    fireEvent.click(continueBtn())
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.employerPreset).toBe('DHL')
    expect(mergedFormData.dhlTeam).toBe('B')
    expect(mergedFormData.startingWeekIsLong).toBe(true) // Team B starts long
    expect(mergedFormData.dhlNightShift).toBe(true)
    expect(mergedFormData.userPaySchedule).toBe('weekly')
    expect(initialStepId).toBe(2)
  })
})
