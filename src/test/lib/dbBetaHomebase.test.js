// Beta Tester Homebase client functions (db.js, docs/TODO.md §12,
// database/migrations/037_add_beta_homebase.sql). Reads are direct
// RLS-scoped Supabase calls (mirrors beta_activity_events/changelog_entries);
// admin writes go through api/admin-beta-hub.js — see
// src/test/api/adminBetaHub.test.js for that route's own coverage. This file
// only exercises the db.js wrappers: request shape, gating, and error
// fallbacks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
  getCachedAuthSnapshot: vi.fn().mockReturnValue({ accessToken: 'tok-123', userId: 'test-user-id' }),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import {
  fetchPublishedChangelogEntries,
  fetchBetaChecklistItems,
  fetchBetaSuggestions,
  fetchMyChecklistCompletions,
  toggleBetaChecklistItem,
  fetchMyBetaScore,
  fetchAllBetaContentItems,
  saveBetaContentItem,
  deleteBetaContentItem,
  fetchBetaScoreboard,
  saveBetaScore,
} from '../../lib/db.js'

function chain(result) {
  const c = {}
  for (const m of ['select', 'eq', 'not', 'order', 'limit', 'delete', 'insert', 'maybeSingle']) {
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

describe('fetchPublishedChangelogEntries', () => {
  it('returns the rows, most recently published first', async () => {
    const rows = [{ id: 'e1', title: 'Latest' }, { id: 'e2', title: 'Older' }]
    supabase.from.mockReturnValue(chain({ data: rows, error: null }))
    expect(await fetchPublishedChangelogEntries()).toEqual(rows)
  })

  it('degrades to [] on error, never throws', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    expect(await fetchPublishedChangelogEntries()).toEqual([])
  })
})

describe('fetchBetaChecklistItems / fetchBetaSuggestions', () => {
  it('filters checklist items to kind=checklist', async () => {
    const items = [{ id: 'c1', title: 'Try goals' }]
    const c = chain({ data: items, error: null })
    supabase.from.mockReturnValue(c)
    const result = await fetchBetaChecklistItems()
    expect(supabase.from).toHaveBeenCalledWith('beta_content_items')
    expect(c.eq).toHaveBeenCalledWith('kind', 'checklist')
    expect(result).toEqual(items)
  })

  it('filters suggestions to kind=suggestion', async () => {
    const items = [{ id: 's1', title: 'Try dark mode toggle' }]
    const c = chain({ data: items, error: null })
    supabase.from.mockReturnValue(c)
    const result = await fetchBetaSuggestions()
    expect(c.eq).toHaveBeenCalledWith('kind', 'suggestion')
    expect(result).toEqual(items)
  })

  it('both degrade to [] on error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    expect(await fetchBetaChecklistItems()).toEqual([])
    expect(await fetchBetaSuggestions()).toEqual([])
  })
})

describe('fetchMyChecklistCompletions', () => {
  it('maps rows down to a flat array of checklist_item_id', async () => {
    supabase.from.mockReturnValue(chain({ data: [{ checklist_item_id: 'c1' }, { checklist_item_id: 'c2' }], error: null }))
    expect(await fetchMyChecklistCompletions()).toEqual(['c1', 'c2'])
  })

  it('returns [] when not signed in, without querying', async () => {
    getCurrentUserId.mockResolvedValue(null)
    expect(await fetchMyChecklistCompletions()).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('degrades to [] on error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    expect(await fetchMyChecklistCompletions()).toEqual([])
  })
})

describe('toggleBetaChecklistItem', () => {
  const trackedTester = { isTester: true, betaCodeUsed: 'clarity042' }

  it('rejects a non-tracked-tester without touching the database', async () => {
    const result = await toggleBetaChecklistItem({ isTester: false, betaCodeUsed: null, itemId: 'c1', completed: true })
    expect(result.ok).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('inserts a completion row when checking an item', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    const result = await toggleBetaChecklistItem({ ...trackedTester, itemId: 'c1', completed: true })
    expect(c.insert).toHaveBeenCalledWith({ checklist_item_id: 'c1', user_id: 'test-user-id' })
    expect(result).toEqual({ ok: true })
  })

  it('treats a duplicate-insert (already checked) as success, not an error', async () => {
    const c = chain({ error: { code: '23505', message: 'duplicate key' } })
    supabase.from.mockReturnValue(c)
    const result = await toggleBetaChecklistItem({ ...trackedTester, itemId: 'c1', completed: true })
    expect(result).toEqual({ ok: true })
  })

  it('surfaces a real insert error', async () => {
    const c = chain({ error: { code: '42501', message: 'insert rejected: not a tracked beta tester' } })
    supabase.from.mockReturnValue(c)
    const result = await toggleBetaChecklistItem({ ...trackedTester, itemId: 'c1', completed: true })
    expect(result.ok).toBe(false)
  })

  it('deletes the completion row when unchecking an item', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    const result = await toggleBetaChecklistItem({ ...trackedTester, itemId: 'c1', completed: false })
    expect(c.delete).toHaveBeenCalled()
    expect(c.eq).toHaveBeenCalledWith('checklist_item_id', 'c1')
    expect(c.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
    expect(result).toEqual({ ok: true })
  })
})

describe('fetchMyBetaScore', () => {
  it('returns the row when scored', async () => {
    const row = { usage_score: 40, feedback_score: 20, calls_score: 10, longevity_score: 10 }
    supabase.from.mockReturnValue(chain({ data: row, error: null }))
    expect(await fetchMyBetaScore()).toEqual(row)
  })

  it('returns null when not yet scored (or RLS excludes the row)', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: null }))
    expect(await fetchMyBetaScore()).toBeNull()
  })

  it('returns null when not signed in', async () => {
    getCurrentUserId.mockResolvedValue(null)
    expect(await fetchMyBetaScore()).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('admin fetch/save wrappers (api/admin-beta-hub.js)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchAllBetaContentItems GETs with the kind query param', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'c1' }] }) }))
    const result = await fetchAllBetaContentItems('checklist')
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub?entity=content&kind=checklist', expect.objectContaining({ method: 'GET' }))
    expect(result).toEqual({ ok: true, items: [{ id: 'c1' }] })
  })

  it('saveBetaContentItem POSTs entity: content with the draft fields', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ item: { id: 'c1' } }) }))
    const result = await saveBetaContentItem({ id: null, kind: 'checklist', title: 'Try goals', body: '', published: true })
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity: 'content', id: null, kind: 'checklist', title: 'Try goals', body: '', published: true }),
    }))
    expect(result).toEqual({ ok: true, item: { id: 'c1' } })
  })

  it('deleteBetaContentItem DELETEs with entity=content&id', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    const result = await deleteBetaContentItem('c1')
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub?entity=content&id=c1', expect.objectContaining({ method: 'DELETE' }))
    expect(result).toEqual({ ok: true })
  })

  it('fetchBetaScoreboard reads admin-beta-report with format=json', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [{ user_id: 'u1' }] }) }))
    const result = await fetchBetaScoreboard()
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-report?format=json', expect.objectContaining({ method: 'GET' }))
    expect(result).toEqual({ ok: true, rows: [{ user_id: 'u1' }] })
  })

  it('saveBetaScore POSTs entity: score with the four categories', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: { user_id: 'u1' } }) }))
    const result = await saveBetaScore({ userId: 'u1', usageScore: 40, feedbackScore: 20, callsScore: 10, longevityScore: 10, adminNotes: null })
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity: 'score', userId: 'u1', usageScore: 40, feedbackScore: 20, callsScore: 10, longevityScore: 10, adminNotes: null }),
    }))
    expect(result).toEqual({ ok: true, score: { user_id: 'u1' } })
  })

  it('all five return a "Not signed in" ok:false without hitting fetch when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('fetch', vi.fn())
    expect((await fetchAllBetaContentItems('checklist')).ok).toBe(false)
    expect((await saveBetaContentItem({ kind: 'checklist', title: 't' })).ok).toBe(false)
    expect((await deleteBetaContentItem('c1')).ok).toBe(false)
    expect((await fetchBetaScoreboard()).ok).toBe(false)
    expect((await saveBetaScore({ userId: 'u1' })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
