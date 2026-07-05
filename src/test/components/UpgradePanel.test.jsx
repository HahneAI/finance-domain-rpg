import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// docs/TODO.md §17.D "Disclosure guard" — same rationale as UpgradeModal.test.jsx.
// UpgradePanel is the full-panel replacement now used for Income/Log.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))

const FORBIDDEN_PATTERNS = [/21[\s-]?day/i, /\bgrace\b/i, /extra week/i]

describe.each([undefined, 'income', 'log'])('disclosure guard — UpgradePanel tab=%s never reveals the hidden grace window', (tab) => {
  it('rendered text contains no forbidden disclosure terms', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { container } = render(<UpgradePanel tab={tab} />)
    const text = container.textContent
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text, `rendered UpgradePanel matched forbidden pattern ${pattern}`).not.toMatch(pattern)
    }
  })

  it('sanity check: the render actually produced trial-related copy', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { container } = render(<UpgradePanel tab={tab} />)
    expect(container.textContent).toMatch(/trial/i)
  })

  it('renders with no dismiss control — nothing to close back to', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { queryByLabelText } = render(<UpgradePanel tab={tab} />)
    expect(queryByLabelText('Dismiss')).toBeNull()
  })
})

describe('UpgradePanel per-tab tagline', () => {
  it('shows an income-specific tagline on the income tab', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { getByText } = render(<UpgradePanel tab="income" />)
    expect(getByText(/tracking your income/i)).toBeTruthy()
  })

  it('shows a log-specific tagline on the log tab', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { getByText } = render(<UpgradePanel tab="log" />)
    expect(getByText(/logging your cashflow/i)).toBeTruthy()
  })

  it('shows no tagline when no tab is specified', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { queryByText } = render(<UpgradePanel />)
    expect(queryByText(/tracking your income/i)).toBeNull()
    expect(queryByText(/logging your cashflow/i)).toBeNull()
  })
})
