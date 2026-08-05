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

describe('SetupWizardAdlib — Welcome page', () => {
  it('disables Next until the employment-status blank is filled', () => {
    renderAdlib()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
  })

  it('enables Next once "employed" is chosen and advances to Pay Structure', () => {
    renderAdlib()
    fireEvent.change(selects()[0], { target: { value: 'employed' } })
    expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/I work for/i)).toBeTruthy()
  })

  it('collapses to a single page and hands off directly to the jobless flow when "unemployed" is chosen', () => {
    const { onHandoff } = renderAdlib()
    fireEvent.change(selects()[0], { target: { value: 'unemployed' } })
    const btn = screen.getByRole('button', { name: /continue setup/i })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
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
})

describe('SetupWizardAdlib — Pay Structure page (base user)', () => {
  function goToPayPage() {
    fireEvent.change(selects()[0], { target: { value: 'employed' } })
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
  }

  it('Back returns to the Welcome page', () => {
    renderAdlib()
    goToPayPage()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByText(/right now, i am/i)).toBeTruthy()
  })

  it('reveals the rate/shift/schedule blanks once "someone else" is chosen', () => {
    renderAdlib()
    goToPayPage()
    fireEvent.change(selects()[0], { target: { value: 'OTHER' } })
    expect(screen.getByText(/I get paid/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue setup/i })).toBeDisabled()
  })

  it('completes the hourly path and hands off to Schedule (step id 2)', () => {
    const { onHandoff } = renderAdlib()
    goToPayPage()
    fireEvent.change(selects()[0], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[1], { target: { value: 'weekly' } })
    fireEvent.change(numbers()[0], { target: { value: '21.15' } })
    fireEvent.change(numbers()[1], { target: { value: '10' } })
    const btn = screen.getByRole('button', { name: /continue setup/i })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onHandoff).toHaveBeenCalledTimes(1)
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.baseRate).toBe(21.15)
    expect(mergedFormData.shiftHours).toBe(10)
    expect(mergedFormData.userPaySchedule).toBe('weekly')
    expect(initialStepId).toBe(2)
  })

  it('completes the salary path and derives baseRate/shiftHours the same way the real wizard does', () => {
    const { onHandoff } = renderAdlib()
    goToPayPage()
    fireEvent.change(selects()[0], { target: { value: 'OTHER' } })
    fireEvent.change(selects()[1], { target: { value: 'salary' } })
    fireEvent.change(numbers()[0], { target: { value: '52000' } })
    fireEvent.click(screen.getByRole('button', { name: /continue setup/i }))
    const [mergedFormData] = onHandoff.mock.calls[0]
    expect(mergedFormData.annualSalary).toBe(52000)
    expect(mergedFormData.baseRate).toBeCloseTo(52000 / 2080)
    expect(mergedFormData.shiftHours).toBe(8)
  })
})

describe('SetupWizardAdlib — starts blank even from an already-answered real config', () => {
  // A DHL admin's real config already has employerPreset/dhlTeam/userPaySchedule/etc.
  // answered. The preview must not pre-fill from that — every mandatory blank should
  // still require an explicit choice before Next/Continue Setup enables.
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

  it('does not carry over startedUnemployed — Next stays disabled on Welcome', () => {
    renderAdlib(answeredConfig)
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
    expect(selects()[0].value).toBe('')
  })

  it('does not carry over employer/team/pay-schedule on Pay Structure', () => {
    renderAdlib(answeredConfig)
    fireEvent.change(selects()[0], { target: { value: 'employed' } })
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(selects()[0].value).toBe('')
    expect(screen.getByRole('button', { name: /continue setup/i })).toBeDisabled()
  })
})

describe('SetupWizardAdlib — resumeFormData', () => {
  it('reopens on the Pay Structure page pre-filled with the in-progress answers', () => {
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
    expect(screen.getByRole('button', { name: /continue setup/i })).not.toBeDisabled()
  })

  it('reopens on the single Welcome page for a resumed jobless answer', () => {
    const resumeFormData = { ...DEFAULT_CONFIG, startedUnemployed: true }
    render(<SetupWizardAdlib config={DEFAULT_CONFIG} onHandoff={vi.fn()} onCancel={vi.fn()} resumeFormData={resumeFormData} />)
    expect(screen.getByText(/right now, i am/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue setup/i })).not.toBeDisabled()
  })
})

describe('SetupWizardAdlib — Pay Structure page (DHL)', () => {
  function goToPayPage() {
    fireEvent.change(selects()[0], { target: { value: 'employed' } })
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
  }

  it('reveals Team, then shift + pay-schedule blanks progressively', () => {
    renderAdlib()
    goToPayPage()
    fireEvent.change(selects()[0], { target: { value: 'DHL' } })
    expect(screen.getByText(/I'm on Team/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue setup/i })).toBeDisabled()

    fireEvent.change(selects()[1], { target: { value: 'A' } })
    expect(screen.getByText(/working the/i)).toBeTruthy()
  })

  it('completes the DHL path and hands off to Schedule with DHL defaults applied', () => {
    const { onHandoff } = renderAdlib()
    goToPayPage()
    fireEvent.change(selects()[0], { target: { value: 'DHL' } })
    fireEvent.change(selects()[1], { target: { value: 'B' } })
    fireEvent.change(selects()[2], { target: { value: 'night' } })
    fireEvent.change(selects()[3], { target: { value: 'weekly' } })
    const btn = screen.getByRole('button', { name: /continue setup/i })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    const [mergedFormData, initialStepId] = onHandoff.mock.calls[0]
    expect(mergedFormData.employerPreset).toBe('DHL')
    expect(mergedFormData.dhlTeam).toBe('B')
    expect(mergedFormData.startingWeekIsLong).toBe(true) // Team B starts long
    expect(mergedFormData.dhlNightShift).toBe(true)
    expect(mergedFormData.userPaySchedule).toBe('weekly')
    expect(initialStepId).toBe(2)
  })
})
