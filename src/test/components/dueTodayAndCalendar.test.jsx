import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DueTodayCard } from '../../components/DueTodayCard.jsx'
import { getBillsDueOn, computeThisWeekActualSpend } from '../../lib/finance.js'
import { buildBillsIcs } from '../../lib/billsIcs.js'

// Shotgun run #3, 2026-10-02 — TODO §20.B2/B3/B4 (single-source "actual" figure), §20.C (due today), §20.D (.ics).

const hist = [{ effectiveFrom: '2026-01-01', weekly: [250, 250, 250, 250] }]
const deletedHist = [...hist, { effectiveFrom: '2026-06-01', weekly: [0, 0, 0, 0] }]
const RENT = { id: 'rent', category: 'Needs', label: 'Rent', dueDateAnchor: '2026-06-18', history: hist, billingMeta: { amount: 1000, cycle: 'every30days', effectiveFrom: '2026-01-01' } }
const SUPPORT = { id: 'sup', category: 'Needs', label: 'Child Support', dueDateAnchor: '2026-06-01', history: hist, billingMeta: { amount: 500, cycle: 'weekly', effectiveFrom: '2026-01-01' } }
const UNDATED = { id: 'misc', category: 'Needs', label: 'Misc', history: hist, billingMeta: { amount: 400, cycle: 'every30days', effectiveFrom: '2026-01-01' } }
const GHOST = { ...RENT, id: 'ghost', label: 'Old Gym', history: deletedHist }
const LOAN = { id: 'loan', type: 'loan', category: 'Loans', label: 'Car Note', history: hist, loanMeta: { paymentAmount: 300, paymentFrequency: 'monthly', firstPaymentDate: '2026-06-18' } }

describe('getBillsDueOn (§20.C definition of "due today")', () => {
  it('returns dated bills whose next due date is exactly that day, biggest first', () => {
    const r = getBillsDueOn([SUPPORT, RENT, LOAN], '2026-06-18')
    expect(r.map(b => b.label)).toEqual(['Rent', 'Car Note'])
    expect(r[0]).toMatchObject({ id: 'rent', amount: 1000, isLoan: false })
    expect(r.find(b => b.isLoan).amount).toBe(300)
  })
  it('catches a recurring bill on a later cycle (weekly from 06-01 lands on 06-15)', () => {
    expect(getBillsDueOn([SUPPORT], '2026-06-15').map(b => b.id)).toEqual(['sup'])
    expect(getBillsDueOn([SUPPORT], '2026-06-16')).toEqual([])
  })
  it('ignores undated bills, deleted bills, and a bill marked paid for that exact occurrence', () => {
    expect(getBillsDueOn([UNDATED, GHOST], '2026-06-18')).toEqual([])
    const paid = { ...RENT, newJobSeasonStatus: 'paid', newJobSeasonPaidDueDate: '2026-06-18' }
    expect(getBillsDueOn([paid], '2026-06-18')).toEqual([])
    expect(getBillsDueOn([{ ...paid, newJobSeasonPaidDueDate: '2026-05-20' }], '2026-06-18')).toHaveLength(1)
  })
})

describe('DueTodayCard (§20.C)', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* */ } })
  const bills = [{ id: 'rent', label: 'Rent', amount: 1000 }, { id: 'loan', label: 'Car Note', amount: 300 }]
  it('shows the bills and the total, and renders nothing when nothing is due', () => {
    const { container, rerender } = render(<DueTodayCard bills={bills} todayIso="2026-06-18" />)
    expect(screen.getByText(/Due today · \$1,300/)).toBeTruthy()
    expect(screen.getByText(/Rent/)).toBeTruthy()
    rerender(<DueTodayCard bills={[]} todayIso="2026-06-18" />)
    expect(container.firstChild).toBeNull()
  })
  it('dismiss hides it for the day and it returns the next day', () => {
    const { container, unmount } = render(<DueTodayCard bills={bills} todayIso="2026-06-18" />)
    fireEvent.click(screen.getByLabelText('Dismiss due today'))
    expect(container.firstChild).toBeNull()
    unmount()
    const same = render(<DueTodayCard bills={bills} todayIso="2026-06-18" />)
    expect(same.container.firstChild).toBeNull()      // same day: still dismissed
    same.unmount()
    render(<DueTodayCard bills={bills} todayIso="2026-06-19" />)
    expect(screen.getByLabelText('Bills due today')).toBeTruthy() // next day: back
  })
  it('still works when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render(<DueTodayCard bills={bills} todayIso="2026-06-18" />)
    expect(screen.getByLabelText('Bills due today')).toBeTruthy()
    spy.mockRestore()
  })
})

describe('"actual" figure stays on the shared averaged source (§20.B2–B4)', () => {
  it('its undated half equals what computeRemainingSpend uses per week; dated half is the real payment', () => {
    const r = computeThisWeekActualSpend([RENT, UNDATED], '2026-06-15', '2026-06-21')
    expect(r.undatedTotal).toBe(250)   // Misc: the averaged weekly share from history, same resolver as avgWeeklySpend
    expect(r.datedTotal).toBe(1000)    // Rent really falls due 06-18
    expect(r.total).toBe(1250)
  })
})

describe('buildBillsIcs (§20.D)', () => {
  const NOW = new Date('2026-06-10T12:00:00Z')
  it('exports dated bills and loans as recurring all-day events, skipping undated and deleted ones', () => {
    const { ics, count } = buildBillsIcs([RENT, SUPPORT, LOAN, UNDATED, GHOST], '2026-06-10', NOW)
    expect(count).toBe(3)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('SUMMARY:Rent due — $1\\,000')
    expect(ics).toContain('SUMMARY:Child Support due — $500')
    expect(ics).not.toContain('Misc')
    expect(ics).not.toContain('Old Gym')
  })
  it('uses the app\'s own recurrence: weekly exact, monthly bucket = 30-day interval, next date from today', () => {
    const { ics } = buildBillsIcs([SUPPORT, RENT], '2026-06-10', NOW)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615')           // Child Support: weekly from 06-01 → next 06-15
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261231')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260618')           // Rent
    expect(ics).toContain('RRULE:FREQ=DAILY;INTERVAL=30;UNTIL=20261231')
  })
  it('returns count 0 (button hides) when no bill has a date', () => {
    expect(buildBillsIcs([UNDATED], '2026-06-10', NOW).count).toBe(0)
  })
})
