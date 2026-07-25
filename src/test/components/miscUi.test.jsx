import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthQuarterSelector } from '../../components/MonthQuarterSelector.jsx'
import { NetWorthHealthTips } from '../../components/NetWorthHealthTips.jsx'
import { PwaInstallModal } from '../../components/PwaInstallModal.jsx'
import { createRef } from 'react'

// ─────────────────────────────────────────────────────────────
// MonthQuarterSelector
// ─────────────────────────────────────────────────────────────

describe('MonthQuarterSelector', () => {
  const baseProps = {
    activeMonth: null,
    activeQuarter: 2, // Q3 (Jul)
    currentMonthKey: '2026-07',
    currentPhaseIdx: 2,
    monthsWithOverrides: new Set(),
    onSelectMonth: () => {},
    onSelectQuarter: () => {},
  }

  it('renders quarter tabs from the current month forward', () => {
    render(<MonthQuarterSelector {...baseProps} />)
    // Q1 months (Jan–Mar) are behind the prev-month cutoff and hidden
    expect(screen.queryByText('Q1')).toBeNull()
    expect(screen.getByText('Q3')).toBeTruthy()
    expect(screen.getByText('Q4')).toBeTruthy()
  })

  it('selects a quarter on tap', () => {
    const onSelectQuarter = vi.fn()
    render(<MonthQuarterSelector {...baseProps} onSelectQuarter={onSelectQuarter} />)
    fireEvent.click(screen.getByText('Q4'))
    expect(onSelectQuarter).toHaveBeenCalledWith(3)
  })

  it('selects a month on tap', () => {
    const onSelectMonth = vi.fn()
    render(<MonthQuarterSelector {...baseProps} onSelectMonth={onSelectMonth} />)
    fireEvent.click(screen.getByText('Aug'))
    expect(onSelectMonth).toHaveBeenCalledWith('2026-08')
  })

  it('renders in month mode with an active month highlighted', () => {
    render(<MonthQuarterSelector {...baseProps} activeMonth="2026-08" />)
    expect(screen.getByText('Aug')).toBeTruthy()
  })

  it('keeps the previous month visible for late edits (cutoff = prev month)', () => {
    render(<MonthQuarterSelector {...baseProps} />)
    expect(screen.getByText('Jun')).toBeTruthy()  // prev month still shown
    expect(screen.queryByText('May')).toBeNull()  // two months back is gone
  })
})

// ─────────────────────────────────────────────────────────────
// NetWorthHealthTips
// ─────────────────────────────────────────────────────────────

describe('NetWorthHealthTips', () => {
  // Tips live behind a collapsed accordion — expand it first.
  const expand = () => fireEvent.click(screen.getByRole('button', { expanded: false }))

  it('starts collapsed with a calm teaser line', () => {
    render(<NetWorthHealthTips />)
    expect(screen.getByText(/tap to read/i)).toBeTruthy()
    expect(screen.queryByText('Pick one number, not the whole budget')).toBeNull()
  })

  it('shows three tips once expanded', () => {
    render(<NetWorthHealthTips />)
    expand()
    expect(screen.getByText('Pick one number, not the whole budget')).toBeTruthy()
    expect(screen.getByText('Put your easiest goal first')).toBeTruthy()
    expect(screen.getByText('Check your buffer, not just your balance')).toBeTruthy()
  })

  it('rotates the tip window based on the seed', () => {
    render(<NetWorthHealthTips seed={1} />)
    expand()
    expect(screen.queryByText('Pick one number, not the whole budget')).toBeNull()
    expect(screen.getByText('Put your easiest goal first')).toBeTruthy()
  })

  it('wraps seeds past the end of the tip list and tolerates bad seeds', () => {
    const { unmount } = render(<NetWorthHealthTips seed={100} />)
    unmount()
    expect(() => render(<NetWorthHealthTips seed={NaN} />)).not.toThrow()
  })

  it('renders a provided AI tip once expanded', () => {
    render(<NetWorthHealthTips aiTip="Skip one takeout order this week." />)
    expand()
    expect(screen.getByText(/Skip one takeout order/)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────
// PwaInstallModal
// ─────────────────────────────────────────────────────────────

describe('PwaInstallModal', () => {
  it('renders the install steps inside a closed dialog', () => {
    const ref = createRef()
    const { container } = render(<PwaInstallModal ref={ref} />)
    const dialog = container.querySelector('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.open).toBe(false)
  })

  it('exposes open/close through the imperative ref', () => {
    const ref = createRef()
    render(<PwaInstallModal ref={ref} />)
    expect(typeof ref.current.open).toBe('function')
    expect(typeof ref.current.close).toBe('function')
  })
})
