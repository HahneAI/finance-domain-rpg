import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// docs/TODO.md §17.D "Disclosure guard": no UI string may reference the
// 21-day / grace / "extra week" concept — public surfaces only ever say 14
// days. Renders the actual paywall UI and asserts against what a user would
// really see (rendered text), not the source file — scanning source text
// would false-positive on legitimate internal comments/code that document
// the mechanism (e.g. this very codebase's subscription.js and App.jsx
// comments say "grace" throughout, correctly, as the technical term).
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))

const FORBIDDEN_PATTERNS = [/21[\s-]?day/i, /\bgrace\b/i, /extra week/i]

describe('disclosure guard — UpgradeModal never reveals the hidden grace window', () => {
  // UpgradeModal renders via createPortal(..., document.body) — its content
  // attaches to document.body, NOT the detached container render() returns,
  // so assertions read document.body.textContent.

  it('rendered text contains no forbidden disclosure terms', async () => {
    const { UpgradeModal } = await import('../../components/UpgradeModal.jsx')
    render(<UpgradeModal />)
    const text = document.body.textContent
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text, `rendered UpgradeModal matched forbidden pattern ${pattern}`).not.toMatch(pattern)
    }
  })

  it('sanity check: the render actually produced trial-related copy (guards against a vacuous pass above)', async () => {
    const { UpgradeModal } = await import('../../components/UpgradeModal.jsx')
    render(<UpgradeModal />)
    expect(document.body.textContent).toMatch(/trial/i)
  })
})
