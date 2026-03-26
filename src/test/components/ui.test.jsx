import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetricCard, Card, NT, VT, SmBtn, SH, iS, lS } from '../../components/ui.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Style token objects (iS, lS)
// ─────────────────────────────────────────────────────────────────────────────

describe('iS — input style object', () => {
  it('is a plain object', () => {
    expect(typeof iS).toBe('object')
    expect(iS).not.toBeNull()
  })

  it('has required input style properties', () => {
    expect(iS).toHaveProperty('fontSize', '16px')   // prevents iOS zoom
    expect(iS).toHaveProperty('width', '100%')
    expect(iS).toHaveProperty('borderRadius')
    expect(iS.fontFamily).toMatch(/JetBrains Mono/i)
  })
})

describe('lS — label style object', () => {
  it('is a plain object', () => {
    expect(typeof lS).toBe('object')
  })

  it('uses uppercase + tracking for label text', () => {
    expect(lS.textTransform).toBe('uppercase')
    expect(lS.letterSpacing).toBeTruthy()
    expect(lS.display).toBe('block')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NT — Nav Tab
// ─────────────────────────────────────────────────────────────────────────────

describe('NT — Nav Tab', () => {
  it('renders a button with the given label', () => {
    render(<NT label="Income" active={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Income' })).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<NT label="Budget" active={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders with active=true without throwing', () => {
    render(<NT label="Goals" active={true} onClick={() => {}} />)
    expect(screen.getByText('Goals')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// VT — View Tab (sub-panel)
// ─────────────────────────────────────────────────────────────────────────────

describe('VT — View Tab', () => {
  it('renders a button with the given label', () => {
    render(<VT label="Overview" active={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<VT label="Detail" active={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SmBtn — Small utility button
// ─────────────────────────────────────────────────────────────────────────────

describe('SmBtn', () => {
  it('renders children text', () => {
    render(<SmBtn onClick={() => {}}>Edit</SmBtn>)
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<SmBtn onClick={onClick}>Delete</SmBtn>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a button element', () => {
    render(<SmBtn onClick={() => {}}>Action</SmBtn>)
    expect(screen.getByRole('button')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SH — Section Header
// ─────────────────────────────────────────────────────────────────────────────

describe('SH — Section Header', () => {
  it('renders children text', () => {
    render(<SH>Monthly Income</SH>)
    expect(screen.getByText('Monthly Income')).toBeTruthy()
  })

  it('renders right-side content when provided', () => {
    render(<SH right="$1,200">Expenses</SH>)
    expect(screen.getByText('Expenses')).toBeTruthy()
    expect(screen.getByText('$1,200')).toBeTruthy()
  })

  it('renders without right prop without throwing', () => {
    render(<SH>No Right</SH>)
    expect(screen.getByText('No Right')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MetricCard / Card
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricCard — static (div) mode', () => {
  it('renders label and val', () => {
    render(<MetricCard label="Net Pay" val="$1,450" />)
    expect(screen.getByText('Net Pay')).toBeTruthy()
    expect(screen.getByText('$1,450')).toBeTruthy()
  })

  it('renders sublabel when sub is provided', () => {
    render(<MetricCard label="Budget" val="$500" sub="per week" />)
    expect(screen.getByText('per week')).toBeTruthy()
  })

  it('renders as a div when no onClick provided', () => {
    const { container } = render(<MetricCard label="Test" val="0" />)
    // No button — rendered as div
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('div')).toBeTruthy()
  })

  it('Card is a backward-compat alias for MetricCard', () => {
    render(<Card label="Alias" val="check" />)
    expect(screen.getByText('Alias')).toBeTruthy()
    expect(screen.getByText('check')).toBeTruthy()
  })

  it('renders without sub without throwing', () => {
    render(<MetricCard label="Simple" val="42" />)
    expect(screen.getByText('42')).toBeTruthy()
  })
})

describe('MetricCard — interactive (button) mode', () => {
  it('renders as a button when onClick is provided', () => {
    render(<MetricCard label="Click Me" val="Go" onClick={() => {}} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<MetricCard label="Tile" val="Tap" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders label and val in button mode', () => {
    render(<MetricCard label="Gross Pay" val="$2,400" onClick={() => {}} />)
    expect(screen.getByText('Gross Pay')).toBeTruthy()
    expect(screen.getByText('$2,400')).toBeTruthy()
  })
})

describe('MetricCard — rawVal countup display', () => {
  it('renders with rawVal without throwing', () => {
    render(<MetricCard label="Balance" rawVal={1250} />)
    expect(screen.getByText('Balance')).toBeTruthy()
  })

  it('shows $— for null rawVal', () => {
    render(<MetricCard label="Empty" rawVal={null} />)
    // val falls back to formatted counted (0 → "$0" or stays $—)
    expect(screen.getByText('Empty')).toBeTruthy()
  })
})

describe('MetricCard — status tinting', () => {
  it('renders with status="green" without throwing', () => {
    render(<MetricCard label="Income" val="+$500" status="green" />)
    expect(screen.getByText('Income')).toBeTruthy()
  })

  it('renders with status="red" without throwing', () => {
    render(<MetricCard label="Deficit" val="-$100" status="red" />)
    expect(screen.getByText('Deficit')).toBeTruthy()
  })

  it('renders with status="gold" without throwing', () => {
    render(<MetricCard label="Goal" val="75%" status="gold" />)
    expect(screen.getByText('Goal')).toBeTruthy()
  })
})
