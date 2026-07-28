// §18.E1 — resume_profile persistence (migration 036_add_resume_profile.sql).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import { loadResumeProfile, saveResumeProfile } from '../../lib/db.js'

// Chainable mock: every method returns the chain itself so `.select().eq()...`
// keeps building, and it's thenable so `await` resolves to the queued result.
function chain(result) {
  const c = {}
  for (const m of ['select', 'eq', 'upsert']) {
    c[m] = vi.fn(() => c)
  }
  c.maybeSingle = vi.fn(async () => result)
  c.then = (res, rej) => Promise.resolve(result).then(res, rej)
  return c
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue('test-user-id')
})

describe('loadResumeProfile', () => {
  it('returns null when not signed in, without querying Supabase', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await loadResumeProfile()
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns null when no profile row exists yet', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: null }))
    const result = await loadResumeProfile()
    expect(result).toBeNull()
  })

  it('maps snake_case columns to the camelCase shape the app uses', async () => {
    const row = {
      resume_text: 'Warehouse lead, 5 years...',
      target_role: 'Operations Manager',
      last_reviewed_at: '2026-07-20T00:00:00Z',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-20T00:00:00Z',
    }
    supabase.from.mockReturnValue(chain({ data: row, error: null }))

    const result = await loadResumeProfile()

    expect(result).toEqual({
      resumeText: 'Warehouse lead, 5 years...',
      targetRole: 'Operations Manager',
      lastReviewedAt: '2026-07-20T00:00:00Z',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-20T00:00:00Z',
    })
  })

  it('defaults resumeText/targetRole to empty strings when the columns are null', async () => {
    supabase.from.mockReturnValue(chain({
      data: { resume_text: null, target_role: null, last_reviewed_at: null, created_at: 'x', updated_at: 'x' },
      error: null,
    }))
    const result = await loadResumeProfile()
    expect(result.resumeText).toBe('')
    expect(result.targetRole).toBe('')
  })

  it('returns null and does not throw on a query error (e.g. migration not yet run)', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'relation "resume_profile" does not exist' } }))
    const result = await loadResumeProfile()
    expect(result).toBeNull()
  })
})

describe('saveResumeProfile', () => {
  it('returns false when not signed in, without querying Supabase', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await saveResumeProfile({ resumeText: 'hi' })
    expect(result).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('upserts by user_id so the same account never gets a second row', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await saveResumeProfile({ resumeText: 'Warehouse lead...', targetRole: 'Ops Manager' })

    expect(c.upsert).toHaveBeenCalled()
    const [payload, opts] = c.upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'user_id' })
    expect(payload.user_id).toBe('test-user-id')
    expect(payload.resume_text).toBe('Warehouse lead...')
    expect(payload.target_role).toBe('Ops Manager')
  })

  it('always writes user_id from the session, ignoring any stray field on the input', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await saveResumeProfile({ resumeText: 'hi', user_id: 'someone-elses-id' })

    expect(c.upsert.mock.calls[0][0].user_id).toBe('test-user-id')
  })

  it('returns false and logs on a save error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))

    const result = await saveResumeProfile({ resumeText: 'hi' })

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
