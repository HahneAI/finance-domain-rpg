import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JobLossEntry } from '../../components/JobLossEntry.jsx'
import { LifeEventMenu } from '../../components/LifeEventMenu.jsx'
import { RateUpdateModal } from '../../components/RateUpdateModal.jsx'
import { JobLossHomePanel } from '../../components/JobLossHomePanel.jsx'
import { JobLossBudgetPanel } from '../../components/JobLossBudgetPanel.jsx'
import { ReemploymentTracker } from '../../components/ReemploymentTracker.jsx'
import { DEFAULT_CONFIG, INITIAL_EXPENSES } from '../../constants/config.js'

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

  it('disables Activate until the unemployment question is answered', () => {
    const onActivate = vi.fn()
    render(<JobLossEntry open onClose={() => {}} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('activates with unemployment disabled when the user answers No', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<JobLossEntry open onClose={onClose} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
      jobLossMode: true,
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
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('e.g. 400'), { target: { value: '350' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 26'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({
      jobLossMode: true,
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
        savingsDraft=""
        includeBenefits
      />
    )
    expect(screen.getByText('Runway')).toBeTruthy()
    expect(screen.getByText('Weekly Burn')).toBeTruthy()
  })

  it('renders with empty expenses and no unemployment', () => {
    const cfg = { ...JOB_LOSS_CONFIG, unemploymentEnabled: false, unemploymentWeekly: null }
    render(<JobLossHomePanel config={cfg} setConfig={() => {}} expenses={[]} effectiveToday="2026-06-15" savingsDraft="" includeBenefits />)
    expect(screen.getByText('Runway')).toBeTruthy()
  })

  it('logs extra income and reflects it in the "Extra Income Logged" tile', () => {
    const configs = []
    const setConfig = vi.fn(updater => configs.push(typeof updater === 'function' ? updater(JOB_LOSS_CONFIG) : updater))
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={setConfig} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" savingsDraft="" includeBenefits />)
    fireEvent.change(screen.getByPlaceholderText('e.g. 150'), { target: { value: '200' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekend gig'), { target: { value: 'Yard work' } })
    fireEvent.click(screen.getByText('+ Log Income'))
    expect(setConfig).toHaveBeenCalled()
    const result = configs[0]
    expect(result.jobHuntIncomeLog).toHaveLength(1)
    expect(result.jobHuntIncomeLog[0]).toMatchObject({ amount: 200, note: 'Yard work' })
  })

  it('disables Log Income until a positive amount is entered', () => {
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" savingsDraft="" includeBenefits />)
    expect(screen.getByText('+ Log Income').closest('button')).toBeDisabled()
  })

  it('removes a logged income entry', () => {
    const cfg = { ...JOB_LOSS_CONFIG, jobHuntIncomeLog: [{ id: 'jhi_1', amount: 100, note: 'Gig', loggedAt: '2026-06-10T00:00:00.000Z' }] }
    const setConfig = vi.fn()
    render(<JobLossHomePanel config={cfg} setConfig={setConfig} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" savingsDraft="" includeBenefits />)
    fireEvent.click(screen.getByLabelText('Remove entry'))
    expect(setConfig).toHaveBeenCalled()
    const result = setConfig.mock.calls[0][0](cfg)
    expect(result.jobHuntIncomeLog).toHaveLength(0)
  })

  it('embeds the Re-employment Tracker', () => {
    render(<JobLossHomePanel config={JOB_LOSS_CONFIG} setConfig={() => {}} expenses={INITIAL_EXPENSES} effectiveToday="2026-06-15" savingsDraft="" includeBenefits />)
    expect(screen.getByText('Re-employment')).toBeTruthy()
    expect(screen.getByText('Target annual')).toBeTruthy()
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
        savingsDraft=""
        setSavingsDraft={() => {}}
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

  it('shows the empty state when there are no expenses', () => {
    renderBudget({ expenses: [] })
    expect(screen.getByText(/No expenses yet/i)).toBeTruthy()
  })

  it('adds a new expense', () => {
    const setExpenses = vi.fn()
    renderBudget({ expenses: [], setExpenses })
    fireEvent.change(screen.getByPlaceholderText('e.g. Rent'), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1200'), { target: { value: '1200' } })
    fireEvent.click(screen.getByText('+ Add Expense'))
    expect(setExpenses).toHaveBeenCalled()
    const result = setExpenses.mock.calls[0][0]([])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ label: 'Rent', category: 'Needs' })
    expect(result[0].billingMeta.amount).toBe(1200)
  })

  it('changes an expense triage status', () => {
    const setExpenses = vi.fn()
    renderBudget({ setExpenses })
    fireEvent.click(screen.getByText('Paused'))
    expect(setExpenses).toHaveBeenCalled()
  })

  it('removes an expense', () => {
    const setExpenses = vi.fn()
    renderBudget({ setExpenses })
    fireEvent.click(screen.getByLabelText('Remove expense'))
    expect(setExpenses).toHaveBeenCalled()
    const result = setExpenses.mock.calls[0][0](INITIAL_EXPENSES)
    expect(result).toHaveLength(0)
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
})
