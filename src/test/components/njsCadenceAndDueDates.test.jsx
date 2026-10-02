import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewJobSeasonEntry } from '../../components/NewJobSeasonEntry.jsx'
import { ExpenseDueDateField } from '../../components/ExpenseDueDateField.jsx'
import { applyCadenceCorrection, getNextDueDate } from '../../lib/expense.js'
import { computeThisWeekActualSpend, getExactEffectiveAmountForMonth, getEffectiveAmountForMonth } from '../../lib/finance.js'

// Shotgun run #2, 2026-10-01 — TODO §23 (per-bill weekly/biweekly cadence in the
// NJS wizard) and §20.A/B1 (optional due date field + this-week-actual math).

Element.prototype.scrollIntoView ??= () => {}

const SUPPORT = {
  id: 'exp_support', category: 'Needs', label: 'Child Support',
  history: [{ effectiveFrom: '2026-01-01', weekly: [250, 250, 250, 250] }],
  billingMeta: { amount: 1000, cycle: 'every30days', effectiveFrom: '2026-01-01' },
}

describe('applyCadenceCorrection (§23)', () => {
  const fixed = applyCadenceCorrection(SUPPORT, { cycle: 'weekly', amount: 500, fromMonthKey: '2026-06', effectiveFrom: '2026-06-10' })
  it('rewrites billingMeta (what getNextDueDate reads)', () => {
    expect(fixed.billingMeta).toMatchObject({ amount: 500, cycle: 'weekly', effectiveFrom: '2026-06-10' })
  })
  it('makes the cost readers see a true $500/week from that month forward', () => {
    expect(getExactEffectiveAmountForMonth(fixed, '2026-06', 1)).toBe(500)
    expect(getExactEffectiveAmountForMonth(fixed, '2026-11', 3)).toBe(500)
    expect(getEffectiveAmountForMonth(fixed, '2026-06', 1)).toBe(500)
    // months before the correction are untouched (point-in-time safe)
    expect(getExactEffectiveAmountForMonth(fixed, '2026-05', 1)).toBe(250)
  })
  it('preserves a month the user had already customized', () => {
    const custom = { ...SUPPORT, monthlyOverrides: { '2026-09': { perPaycheck: 300, amount: 300, cycle: 'weekly' } } }
    const out = applyCadenceCorrection(custom, { cycle: 'biweekly', amount: 400, fromMonthKey: '2026-06', effectiveFrom: '2026-06-10' })
    expect(out.monthlyOverrides['2026-09'].amount).toBe(300)
    expect(out.monthlyOverrides['2026-06'].cycle).toBe('biweekly')
  })
})

describe('NewJobSeasonEntry — cadence override (§23)', () => {
  afterEach(() => vi.useRealTimers())

  function toDueDateStep(onActivate, dateIso = '2026-06-10') {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${dateIso}T12:00:00`))
    const { container } = render(<NewJobSeasonEntry open onClose={() => {}} onActivate={onActivate} expenses={[SUPPORT]} />)
    fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: dateIso } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 1,023'), { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  }

  it('blocks Next until the amount and payment day are both set', () => {
    toDueDateStep(vi.fn())
    fireEvent.click(screen.getByLabelText('Child Support cadence Weekly'))
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Child Support amount per payment'), { target: { value: '500' } })
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Child Support paid Fri'))
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled() // weekly → "already paid" step follows
  })

  it('writes a permanent weekly correction + the weekday anchor, and the "paid this week" step follows', () => {
    const onActivate = vi.fn()
    toDueDateStep(onActivate) // 2026-06-10 is a Wednesday
    fireEvent.click(screen.getByLabelText('Child Support cadence Weekly'))
    fireEvent.change(screen.getByLabelText('Child Support amount per payment'), { target: { value: '500' } })
    fireEvent.click(screen.getByLabelText('Child Support paid Fri'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Already paid this week?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    const updated = onActivate.mock.calls[0][1][0]
    expect(updated.billingMeta).toMatchObject({ amount: 500, cycle: 'weekly' })
    expect(updated.dueDateAnchor).toBe('2026-06-12') // next Friday
    expect(updated.trackDuringNewJobSeason).toBe(true)
    expect(getExactEffectiveAmountForMonth(updated, '2026-06', 1)).toBe(500)
  })

  it('"Monthly / as entered" leaves the bill untouched (picker path unchanged)', () => {
    const onActivate = vi.fn()
    toDueDateStep(onActivate)
    fireEvent.click(screen.getByLabelText('Child Support cadence Weekly'))
    fireEvent.click(screen.getByLabelText('Child Support cadence Monthly / as entered'))
    fireEvent.click(screen.getByText('1st week of month'))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(onActivate.mock.calls[0][1][0].billingMeta.cycle).toBe('every30days')
  })
})

describe('computeThisWeekActualSpend (§20.B1 hybrid rule)', () => {
  const WK = ['2026-06-15', '2026-06-21']
  const RENT = { ...SUPPORT, id: 'rent', label: 'Rent', dueDateAnchor: '2026-06-18' }
  const UNDATED = { id: 'misc', category: 'Needs', label: 'Misc', history: [{ effectiveFrom: '2026-01-01', weekly: [100, 100, 100, 100] }], billingMeta: { amount: 400, cycle: 'every30days', effectiveFrom: '2026-01-01' } }
  const WEEKLY = { id: 'wk', category: 'Needs', label: 'Support', dueDateAnchor: '2026-06-01', history: [{ effectiveFrom: '2026-01-01', weekly: [500, 500, 500, 500] }], billingMeta: { amount: 500, cycle: 'weekly', effectiveFrom: '2026-01-01' } }
  const LOAN = { id: 'loan', type: 'loan', category: 'Loans', label: 'Car', history: [{ effectiveFrom: '2026-01-01', weekly: [75, 75, 75, 75] }], loanMeta: { paymentAmount: 300, paymentFrequency: 'monthly', firstPaymentDate: '2026-06-17' } }

  it('returns null until at least one non-loan expense has a due date', () => {
    expect(computeThisWeekActualSpend([UNDATED], ...WK)).toBeNull()
    expect(computeThisWeekActualSpend([UNDATED, LOAN], ...WK)).toBeNull() // a loan alone doesn't count
    expect(computeThisWeekActualSpend([], ...WK)).toBeNull()
  })
  it('dated bills contribute the real payment; undated contribute the averaged weekly share', () => {
    const r = computeThisWeekActualSpend([RENT, UNDATED], ...WK)
    expect(r.datedTotal).toBe(1000)   // rent really falls due 06-18
    expect(r.undatedTotal).toBe(100)  // same averaged figure computeRemainingSpend uses
    expect(r.total).toBe(1100)
    expect(r.coverage).toBe(0.5)
  })
  it('a dated bill not due this week contributes nothing (that is the point)', () => {
    const r = computeThisWeekActualSpend([{ ...RENT, dueDateAnchor: '2026-06-25' }, WEEKLY], ...WK)
    expect(r.datedTotal).toBe(500) // only the weekly bill lands in the window
  })
  it('counts every occurrence of a recurring bill and includes loans as dated', () => {
    const r = computeThisWeekActualSpend([WEEKLY, LOAN], '2026-06-15', '2026-06-21')
    expect(r.datedTotal).toBe(500 + 300)
  })
})

describe('ExpenseDueDateField (§20.A)', () => {
  it('shows "Not set" for an undated expense and saves a picked week as an anchor', () => {
    const onSave = vi.fn()
    render(<ExpenseDueDateField expense={SUPPORT} referenceIso="2026-06-10" onSave={onSave} />)
    expect(screen.getByText('Not set')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Set due date'))
    fireEvent.click(screen.getByLabelText('Save due date'))
    expect(onSave).not.toHaveBeenCalled() // nothing picked
    fireEvent.click(screen.getByText('3rd week of month'))
    fireEvent.click(screen.getByLabelText('Save due date'))
    expect(onSave).toHaveBeenCalledWith('2026-06-15')
  })
  it('shows the next due date and Clear passes null (back to no due date)', () => {
    const onSave = vi.fn()
    const dated = { ...SUPPORT, dueDateAnchor: '2026-06-18' }
    render(<ExpenseDueDateField expense={dated} referenceIso="2026-06-10" onSave={onSave} />)
    expect(screen.getByText(/Next due Jun 18/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Clear due date'))
    expect(onSave).toHaveBeenCalledWith(null)
    expect(getNextDueDate(dated, new Date('2026-06-10T12:00:00'))).not.toBeNull()
  })
})
