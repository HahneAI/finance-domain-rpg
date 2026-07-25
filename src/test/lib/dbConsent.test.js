import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../../lib/supabase.js'
import { recordConsent, fetchLatestConsent } from '../../lib/db.js'

function chain(result) {
  const c = {}
  for (const m of ['select', 'eq', 'order', 'limit']) {
    c[m] = vi.fn(() => c)
  }
  c.maybeSingle = vi.fn(async () => result)
  return c
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────
// recordConsent — direct client insert, RLS-scoped to auth.uid() = user_id
// (database/migrations/033). consented_at is never sent from the client —
// the DB trigger forces it server-side.
// ─────────────────────────────────────────────────────────────

describe('recordConsent', () => {
  it('inserts user_id + policy_version only (no client-side timestamp)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    supabase.from.mockReturnValue({ insert })

    const result = await recordConsent('u1', '0.1-placeholder')

    expect(supabase.from).toHaveBeenCalledWith('consent_records')
    expect(insert).toHaveBeenCalledWith({ user_id: 'u1', policy_version: '0.1-placeholder' })
    expect(result).toEqual({ ok: true })
  })

  it('returns an error without throwing on a database error', async () => {
    supabase.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: 'rls denied' } }) })
    const result = await recordConsent('u1', '0.1-placeholder')
    expect(result).toEqual({ ok: false, error: 'rls denied' })
  })

  it('short-circuits on a missing userId or policyVersion without touching supabase', async () => {
    expect(await recordConsent(null, '0.1-placeholder')).toEqual({ ok: false, error: 'Missing userId or policyVersion' })
    expect(await recordConsent('u1', null)).toEqual({ ok: false, error: 'Missing userId or policyVersion' })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// fetchLatestConsent — most recent row for the caller's own account
// ─────────────────────────────────────────────────────────────

describe('fetchLatestConsent', () => {
  it('returns the most recent consent record for the user', async () => {
    const row = { policy_version: '0.1-placeholder', consented_at: '2026-07-26T00:00:00Z' }
    const c = chain({ data: row, error: null })
    supabase.from.mockReturnValue(c)

    const result = await fetchLatestConsent('u1')

    expect(supabase.from).toHaveBeenCalledWith('consent_records')
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(c.order).toHaveBeenCalledWith('consented_at', { ascending: false })
    expect(c.limit).toHaveBeenCalledWith(1)
    expect(result).toEqual(row)
  })

  it('returns null when the user has never consented', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: null }))
    expect(await fetchLatestConsent('u1')).toBeNull()
  })

  it('returns null (never throws) on a query error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await fetchLatestConsent('u1')).toBeNull()
  })
})
