import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewJobSeasonEntry } from '../../components/NewJobSeasonEntry.jsx'
import { NewJobSeasonBudgetPanel } from '../../components/NewJobSeasonBudgetPanel.jsx'
import {
  sumBillsDueSince, computeNewJobSeasonRunway, planMarkBillPaid, planUnmarkBillPaid,
  isPaidForCurrentCycle, isNjsBillActive,
} from '../../lib/newJobSeasonRunway.js'
import { isExpenseRemoved } from '../../lib/finance.js'
import { resolveCurrentWeekOfMonth, resolveWeekOfMonthAnchor, WEEK_OF_MONTH_OPTIONS } from '../../lib/expense.js'

// Shotgun run 2026-10-01 — TODO §24 (deleted bills), §25 (Mark as Paid),
// §26 (week-of-month helper + "Already paid this week?" step).

Element.prototype.scrollIntoView ??= () => {}

const TODAY = '2026-06-15'
const liveHistory = [{ effectiveFrom: '2026-01-01', weekly: [250, 250, 250, 250] }]
// "Deleted" the way BudgetPanel deletes: amount zeroed forward, history kept.
const deletedHistory = [...liveHistory, { effectiveFrom: '2026-06-01', weekly: [0, 0, 0, 0] }]

const RENT = {
  id: 'exp_rent', category: 'Needs', label: 'Rent', newJobSeasonStatus: 'active',
  dueDateAnchor: '2026-06-20', history: liveHistory,
  billingMeta: { amount: 1000, cycle: 'every30days', effectiveFrom: '2026-01-01' },
}
const GHOST = { // deleted, but a leftover due date lands inside the cash window
  id: 'exp_ghost', category: 'Needs', label: 'Old Gym', newJobSeasonStatus: 'active',
  dueDateAnchor: '2026-06-18', history: deletedHistory,
  billingMeta: { amount: 400, cycle: 'every30days', effectiveFrom: '2026-01-01' },
}

describe('isExpenseRemoved (§24)', () => {
  it('flags a zeroed-forward expense with history, not a live one', () => {
    expect(isExpenseRemoved(GHOST, TODAY)).toBe(true)
    expect(isExpenseRemoved(RENT, TODAY)).toBe(false)
  })
  it('does not flag one scheduled to come back later in the year', () => {
    const returning = { ...GHOST, history: [...deletedHistory, { effectiveFrom: '2026-09-01', weekly: [250, 250, 250, 250] }] }
    expect(isExpenseRemoved(returning, TODAY)).toBe(false)
  })
  it('never flags loans or expenses with no history', () => {
    expect(isExpenseRemoved({ type: 'loan', loanMeta: {} }, TODAY)).toBe(false)
    expect(isExpenseRemoved({ ...GHOST, history: [] }, TODAY)).toBe(false)
    expect(isExpenseRemoved(GHOST, null)).toBe(false)
  })
})

describe('deleted bills never reach the cash math (§24)', () => {
  it('sumBillsDueSince ignores a deleted bill (the money-bug assertion)', () => {
    expect(sumBillsDueSince([GHOST], '2026-06-01', TODAY.replace('15', '30'))).toBe(0)
    expect(sumBillsDueSince([RENT, GHOST], '2026-06-01', '2026-06-30')).toBe(1000)
  })
  it('effectiveCashOnHand and essentialCount exclude the deleted bill', () => {
    const config = {
      newJobSeasonMode: true, newJobSeasonDate: '2026-06-01',
      newJobSeasonCashOnHand: 5000, newJobSeasonCashOnHandAsOf: '2026-06-01',
    }
    const dash = computeNewJobSeasonRunway({ config, expenses: [RENT, GHOST], effectiveToday: '2026-06-30' })
    expect(dash.billsDueSinceAsOf).toBe(1000)
    expect(dash.effectiveCashOnHand).toBe(4000)
    expect(dash.essentialCount).toBe(1)
  })
})

describe('"paid" status (§25)', () => {
  it('counts as a live bill for burn, unlike paused/cancelled', () => {
    expect(isNjsBillActive({ newJobSeasonStatus: 'paid' })).toBe(true)
    expect(isNjsBillActive({ newJobSeasonStatus: 'paused' })).toBe(false)
    const config = { newJobSeasonMode: true, newJobSeasonDate: '2026-06-01', newJobSeasonCashOnHand: 100 }
    const paid = { ...RENT, newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-20' }
    expect(computeNewJobSeasonRunway({ config, expenses: [paid], effectiveToday: TODAY }).weeklyBurn).toBe(250)
  })
  it('auto-resets once the paid occurrence is behind us', () => {
    const paid = { ...RENT, newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-20' }
    expect(isPaidForCurrentCycle(paid, '2026-06-20')).toBe(true)
    expect(isPaidForCurrentCycle(paid, '2026-06-21')).toBe(false)
    expect(isPaidForCurrentCycle(RENT, TODAY)).toBe(false)
  })
  it('takes the amount out of cash once, and flags the occurrence so decay skips it', () => {
    const plan = planMarkBillPaid({
      expense: RENT, dueIso: '2026-06-20', effectiveToday: TODAY, cashAsOf: TODAY, effectiveCashOnHand: 2000,
    })
    expect(plan.nextCashOnHand).toBe(1000)
    expect(plan.expensePatch).toMatchObject({ newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-20', newJobSeasonPaidSkipDecay: true })
    // …and when its date is later crossed, the decay does not subtract it again.
    const paid = { ...RENT, ...plan.expensePatch }
    expect(sumBillsDueSince([paid], TODAY, '2026-06-25')).toBe(0)
    expect(sumBillsDueSince([RENT], TODAY, '2026-06-25')).toBe(1000)
  })
  it('leaves cash alone when the decay already counted that occurrence', () => {
    const plan = planMarkBillPaid({
      expense: RENT, dueIso: TODAY, effectiveToday: TODAY, cashAsOf: '2026-06-01', effectiveCashOnHand: 2000,
    })
    expect(plan.nextCashOnHand).toBeNull()
    expect(plan.expensePatch.newJobSeasonPaidSkipDecay).toBe(false)
  })
  it('undo credits cash back only if mark-paid took it out', () => {
    expect(planUnmarkBillPaid({ expense: { ...RENT, newJobSeasonPaidSkipDecay: true }, effectiveCashOnHand: 1000 }).nextCashOnHand).toBe(2000)
    expect(planUnmarkBillPaid({ expense: { ...RENT, newJobSeasonPaidSkipDecay: false }, effectiveCashOnHand: 1000 }).nextCashOnHand).toBeNull()
  })
})

describe('resolveCurrentWeekOfMonth (§26)', () => {
  it('uses the same 1/8/15/22 cutoffs as the picker', () => {
    expect(resolveCurrentWeekOfMonth('2026-06-07')).toBe('week1')
    expect(resolveCurrentWeekOfMonth('2026-06-08')).toBe('week2')
    expect(resolveCurrentWeekOfMonth('2026-06-14')).toBe('week2')
    expect(resolveCurrentWeekOfMonth('2026-06-15')).toBe('week3')
    expect(resolveCurrentWeekOfMonth('2026-06-21')).toBe('week3')
    expect(resolveCurrentWeekOfMonth('2026-06-22')).toBe('week4')
    expect(resolveCurrentWeekOfMonth('2026-02-28')).toBe('week4')
  })
  it('round-trips with resolveWeekOfMonthAnchor for every bucket', () => {
    for (const opt of WEEK_OF_MONTH_OPTIONS) {
      expect(resolveCurrentWeekOfMonth(resolveWeekOfMonthAnchor(opt.value, '2026-06-30'))).toBe(opt.value)
    }
  })
  it('returns null for missing/bad input', () => {
    expect(resolveCurrentWeekOfMonth(null)).toBeNull()
    expect(resolveCurrentWeekOfMonth('nope')).toBeNull()
  })
})

describe('NewJobSeasonBudgetPanel — deleted + paid bills (§24/§25)', () => {
  const config = {
    newJobSeasonMode: true, newJobSeasonDate: '2026-06-01',
    newJobSeasonCashOnHand: 2000, newJobSeasonCashOnHandAsOf: TODAY,
  }
  const GAS = {
    id: 'exp_gas', category: 'Needs', label: 'Gas Bill', newJobSeasonStatus: 'active',
    dueDateAnchor: '2026-06-17', history: liveHistory,
    billingMeta: { amount: 80, cycle: 'every30days', effectiveFrom: '2026-01-01' },
  }
  function renderPanel(extra = {}) {
    const expenses = extra.expenses ?? [RENT, GAS, GHOST]
    return render(
      <NewJobSeasonBudgetPanel
        config={config} setConfig={() => {}} saveConfigNow={extra.saveConfigNow}
        expenses={expenses} setExpenses={extra.setExpenses ?? (() => {})}
        onSaveExpensesNow={extra.onSaveExpensesNow}
        effectiveToday={TODAY} includeBenefits setIncludeBenefits={() => {}}
        {...extra}
      />
    )
  }

  it('does not list a deleted bill anywhere on the panel', () => {
    renderPanel()
    expect(screen.queryByText('Old Gym')).toBeNull()
    expect(screen.getAllByText('Rent').length).toBeGreaterThan(0)
  })

  it('Mark Paid flips the status and subtracts the amount through the cash-on-hand save', () => {
    const expenses = [RENT, GAS]
    const setExpenses = vi.fn(u => u(expenses))
    const onSaveExpensesNow = vi.fn()
    const saveConfigNow = vi.fn()
    renderPanel({ expenses, setExpenses, onSaveExpensesNow, saveConfigNow })
    fireEvent.click(screen.getByLabelText('Mark Rent as paid'))
    expect(saveConfigNow).toHaveBeenCalledWith(expect.objectContaining({
      newJobSeasonCashOnHand: 1000, newJobSeasonCashOnHandAsOf: TODAY,
    }))
    const saved = onSaveExpensesNow.mock.calls[0][0]
    expect(saved.find(e => e.id === 'exp_rent')).toMatchObject({ newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-20' })
    expect(saved.find(e => e.id === 'exp_gas').newJobSeasonStatus).toBe('active')
  })

  it('keeps a paid bill visible but sorted after every active bill', () => {
    // Rent (due in 5 days) is paid → must render below Gas (due in 2 days) AND below
    // any later-due active bill; make the active one due *after* the paid one.
    const paidRent = { ...RENT, newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-20', dueDateAnchor: '2026-06-16' }
    const lateActive = { ...GAS, dueDateAnchor: '2026-07-10' }
    renderPanel({ expenses: [paidRent, lateActive] })
    // Upcoming Bills renders above the Tracked Bills list, so the first two matches are its rows.
    const labels = screen.getAllByText(/^(Rent|Gas Bill)$/).slice(0, 2).map(n => n.textContent)
    expect(labels).toEqual(['Gas Bill', 'Rent'])
    expect(screen.getByLabelText('Undo paid for Rent')).toBeTruthy()
  })

  it('hides Mark Paid when readOnly', () => {
    renderPanel({ readOnly: true })
    expect(screen.queryByLabelText('Mark Rent as paid')).toBeNull()
  })
})

describe('NewJobSeasonEntry — "Already paid this week?" step (§26)', () => {
  const WEEKLY = {
    id: 'exp_wk', category: 'Needs', label: 'Childcare', history: liveHistory,
    billingMeta: { amount: 150, cycle: 'weekly', effectiveFrom: '2026-01-01' },
  }
  const MONTHLY = {
    id: 'exp_mo', category: 'Needs', label: 'Internet', history: liveHistory,
    billingMeta: { amount: 70, cycle: 'every30days', effectiveFrom: '2026-01-01' },
  }
  // Anchors resolve against the real "today" (confirm()'s existing behavior), so
  // pin the clock to the activation date — only Date is faked.
  afterEach(() => vi.useRealTimers())
  function runToDueDates(expenses, dateIso, onActivate, weekPick = '1st week of month') {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${dateIso}T12:00:00`))
    const { container } = render(<NewJobSeasonEntry open onClose={() => {}} onActivate={onActivate} expenses={expenses} />)
    fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: dateIso } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))   // → pending check
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))   // → track bills
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))   // → due dates
    // pick "1st week of month" for every bill's DueDatePicker
    screen.getAllByText(weekPick).forEach(b => fireEvent.click(b))
  }

  it('appears for a weekly bill with something due in 7 days, and checked bills land "paid"', () => {
    const onActivate = vi.fn()
    runToDueDates([WEEKLY], '2026-06-10', onActivate) // week 2 — only the weekly cadence triggers it
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Already paid this week?')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Already paid Childcare'))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    const [patch, updated] = onActivate.mock.calls[0]
    expect(patch.newJobSeasonCashOnHand).toBe(800) // cash not reduced — Step 0 already reflects it
    expect(updated[0]).toMatchObject({ id: 'exp_wk', newJobSeasonStatus: 'paid', newJobSeasonPaidSkipDecay: true })
    expect(updated[0].newJobSeasonPaidDueDate).toMatch(/^2026-06-/)
  })

  it('appears in the 4th week of the month even with only monthly bills', () => {
    const onActivate = vi.fn()
    // 06-22 is the first day of the 4th week → the "4th week" anchor is 06-22 itself → due today.
    runToDueDates([MONTHLY], '2026-06-22', onActivate, '4th week of month')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Already paid this week?')).toBeTruthy()
    expect(screen.getByLabelText('Already paid Internet')).toBeTruthy()
  })

  it('is skipped when it is not week 4 and no bill recurs weekly', () => {
    const onActivate = vi.fn()
    runToDueDates([MONTHLY], '2026-06-03', onActivate)
    expect(screen.getByRole('button', { name: 'Activate' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Already paid this week?')).toBeNull()
  })

  it('never offers a deleted bill for tracking, and passes it through untouched on Activate', () => {
    const onActivate = vi.fn()
    const { container } = render(<NewJobSeasonEntry open onClose={() => {}} onActivate={onActivate} expenses={[MONTHLY, GHOST]} />)
    fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: '2026-06-03' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByText('Old Gym')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    screen.getAllByText('1st week of month').forEach(b => fireEvent.click(b))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    const updated = onActivate.mock.calls[0][1]
    expect(updated.map(e => e.id)).toEqual(['exp_mo', 'exp_ghost'])
    expect(updated[1]).toEqual(GHOST)
  })
})
