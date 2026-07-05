import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// docs/TODO.md §17.D "Disclosure guard" — same rationale as UpgradeModal.test.jsx.
// UpgradePanel is the full-panel replacement now used for Income/Log.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))

const FORBIDDEN_PATTERNS = [/21[\s-]?day/i, /\bgrace\b/i, /extra week/i]

describe('disclosure guard — UpgradePanel never reveals the hidden grace window', () => {
  it('rendered text contains no forbidden disclosure terms', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { container } = render(<UpgradePanel />)
    const text = container.textContent
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text, `rendered UpgradePanel matched forbidden pattern ${pattern}`).not.toMatch(pattern)
    }
  })

  it('sanity check: the render actually produced trial-related copy', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { container } = render(<UpgradePanel />)
    expect(container.textContent).toMatch(/trial/i)
  })

  it('renders with no dismiss control — nothing to close back to', async () => {
    const { UpgradePanel } = await import('../../components/UpgradePanel.jsx')
    const { queryByLabelText } = render(<UpgradePanel />)
    expect(queryByLabelText('Dismiss')).toBeNull()
  })
})
