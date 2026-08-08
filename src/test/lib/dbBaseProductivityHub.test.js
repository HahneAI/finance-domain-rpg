// Base-user Productivity Hub client functions (db.js, "Money Moves",
// database/migrations/039_add_base_productivity_hub.sql). Mirrors
// dbBetaHomebase.test.js's structure — same fetcher shapes, minus any
// isTrackedBetaTester/isTester gating (this surface is for every signed-in
// user) and minus a scoring equivalent (deliberately not ported). Admin
// writes go through api/admin-beta-hub.js's entity: "base_content" — see
// src/test/api/adminBetaHub.test.js for that route's own coverage.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
  getCachedAuthSnapshot: vi.fn().mockReturnValue({ accessToken: 'tok-123', userId: 'test-user-id' }),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import {
  fetchBaseChecklistItems,
  fetchBaseSuggestions,
  fetchMyBaseChecklistCompletions,
  toggleBaseChecklistItem,
  logBaseFeedback,
  fetchAllBaseContentItems,
  saveBaseContentItem,
  deleteBaseContentItem,
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

describe('fetchBaseChecklistItems / fetchBaseSuggestions', () => {
  it('filters checklist items to kind=checklist against base_content_items', async () => {
    const items = [{ id: 'c1', title: 'Add your first goal' }]
    const c = chain({ data: items, error: null })
    supabase.from.mockReturnValue(c)
    const result = await fetchBaseChecklistItems()
    expect(supabase.from).toHaveBeenCalledWith('base_content_items')
    expect(c.eq).toHaveBeenCalledWith('kind', 'checklist')
    expect(result).toEqual(items)
  })

  it('filters suggestions to kind=suggestion', async () => {
    const items = [{ id: 's1', title: 'Try the Tax Plan' }]
    const c = chain({ data: items, error: null })
    supabase.from.mockReturnValue(c)
    const result = await fetchBaseSuggestions()
    expect(c.eq).toHaveBeenCalledWith('kind', 'suggestion')
    expect(result).toEqual(items)
  })

  it('both degrade to [] on error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }))
    expect(await fetchBaseChecklistItems()).toEqual([])
    expect(await fetchBaseSuggestions()).toEqual([])
  })
})

describe('fetchMyBaseChecklistCompletions', () => {
  it('maps rows down to a flat array of checklist_item_id', async () => {
    supabase.from.mockReturnValue(chain({ data: [{ checklist_item_id: 'c1' }, { checklist_item_id: 'c2' }], error: null }))
    expect(await fetchMyBaseChecklistCompletions()).toEqual(['c1', 'c2'])
  })

  it('returns [] when not signed in, without querying', async () => {
    getCurrentUserId.mockResolvedValue(null)
    expect(await fetchMyBaseChecklistCompletions()).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('toggleBaseChecklistItem', () => {
  it('inserts a completion row when checking an item — no tracked-tester gate required', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    const result = await toggleBaseChecklistItem({ itemId: 'c1', completed: true })
    expect(supabase.from).toHaveBeenCalledWith('base_checklist_completions')
    expect(c.insert).toHaveBeenCalledWith({ checklist_item_id: 'c1', user_id: 'test-user-id' })
    expect(result).toEqual({ ok: true })
  })

  it('treats a duplicate-insert (already checked) as success, not an error', async () => {
    const c = chain({ error: { code: '23505', message: 'duplicate key' } })
    supabase.from.mockReturnValue(c)
    const result = await toggleBaseChecklistItem({ itemId: 'c1', completed: true })
    expect(result).toEqual({ ok: true })
  })

  it('deletes the completion row when unchecking an item', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    const result = await toggleBaseChecklistItem({ itemId: 'c1', completed: false })
    expect(c.delete).toHaveBeenCalled()
    expect(c.eq).toHaveBeenCalledWith('checklist_item_id', 'c1')
    expect(c.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
    expect(result).toEqual({ ok: true })
  })

  it('returns "Not signed in" without querying when there is no user', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await toggleBaseChecklistItem({ itemId: 'c1', completed: true })
    expect(result.ok).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('logBaseFeedback', () => {
  it('inserts into base_feedback_events, not beta_activity_events', async () => {
    const c = chain({ error: null })
    supabase.from.mockReturnValue(c)
    const result = await logBaseFeedback({ note: '  Love the new checklist!  ' })
    expect(supabase.from).toHaveBeenCalledWith('base_feedback_events')
    expect(c.insert).toHaveBeenCalledWith({ user_id: 'test-user-id', note: 'Love the new checklist!' })
    expect(result).toEqual({ ok: true })
  })

  it('rejects empty/whitespace-only feedback without querying', async () => {
    const result = await logBaseFeedback({ note: '   ' })
    expect(result.ok).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns "Not signed in" without querying when there is no user', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await logBaseFeedback({ note: 'hello' })
    expect(result.ok).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('admin fetch/save wrappers (api/admin-beta-hub.js entity: base_content)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchAllBaseContentItems GETs entity=base_content with the kind query param', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'c1' }] }) }))
    const result = await fetchAllBaseContentItems('checklist')
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub?entity=base_content&kind=checklist', expect.objectContaining({ method: 'GET' }))
    expect(result).toEqual({ ok: true, items: [{ id: 'c1' }] })
  })

  it('saveBaseContentItem POSTs entity: base_content with the draft fields', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ item: { id: 'c1' } }) }))
    const result = await saveBaseContentItem({ id: null, kind: 'checklist', title: 'Add your first goal', body: '', published: true })
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity: 'base_content', id: null, kind: 'checklist', title: 'Add your first goal', body: '', published: true }),
    }))
    expect(result).toEqual({ ok: true, item: { id: 'c1' } })
  })

  it('deleteBaseContentItem DELETEs with entity=base_content&id', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
    const result = await deleteBaseContentItem('c1')
    expect(fetch).toHaveBeenCalledWith('/api/admin-beta-hub?entity=base_content&id=c1', expect.objectContaining({ method: 'DELETE' }))
    expect(result).toEqual({ ok: true })
  })

  it('all three return a "Not signed in" ok:false without hitting fetch when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('fetch', vi.fn())
    expect((await fetchAllBaseContentItems('checklist')).ok).toBe(false)
    expect((await saveBaseContentItem({ kind: 'checklist', title: 't' })).ok).toBe(false)
    expect((await deleteBaseContentItem('c1')).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
