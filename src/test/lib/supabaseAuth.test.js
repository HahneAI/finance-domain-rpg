import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// Mock @supabase/supabase-js so importing supabase.js gives us a client whose
// auth.getUser / auth.getSession we control. createClient is called at module
// load, and supabase.js also wires up an onAuthStateChange listener on import —
// both must be present on the mocked auth object or the import throws.
// ─────────────────────────────────────────────────────────────
const { getUser, getSession, onAuthStateChange } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser, getSession, onAuthStateChange } }),
}))

import { getCurrentUserId } from '../../lib/supabase.js'

beforeEach(() => {
  getUser.mockReset()
  getSession.mockReset()
})

describe('getCurrentUserId — deploy-reload auth-probe resilience', () => {
  it('returns the user id from getUser() on the normal path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'real-user' } } })
    await expect(getCurrentUserId()).resolves.toBe('real-user')
    // Session fallback is never consulted when getUser() succeeds.
    expect(getSession).not.toHaveBeenCalled()
  })

  // The regression: right after a deploy reload the /auth/v1/user round-trip can
  // transiently return a null user WITHOUT throwing. Trusting that null made
  // loadUserData() reset to DEFAULT_CONFIG (setupComplete:false) and reopen the
  // setup wizard for an existing, signed-in user. The persisted session still
  // proves who they are, so we must fall back to it rather than report signed-out.
  it('falls back to the persisted session when getUser() returns a null user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    getSession.mockResolvedValue({ data: { session: { user: { id: 'real-user' } } } })
    await expect(getCurrentUserId()).resolves.toBe('real-user')
  })

  it('returns null only when both getUser() and the session are genuinely empty (real sign-out)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(getCurrentUserId()).resolves.toBeNull()
  })
})
