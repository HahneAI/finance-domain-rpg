import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase } from '../../lib/supabase.js'
import {
  fetchLatestPublishedChangelog,
  fetchAllChangelogEntries,
  saveChangelogEntry,
  deleteChangelogEntry,
} from '../../lib/db.js'

function chain(result) {
  const c = {}
  for (const m of ['select', 'not', 'order', 'limit']) {
    c[m] = vi.fn(() => c)
  }
  c.maybeSingle = vi.fn(async () => result)
  return c
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────
// fetchLatestPublishedChangelog — direct client read, RLS-scoped to
// published_at IS NOT NULL (database/migrations/032)
// ─────────────────────────────────────────────────────────────

describe('fetchLatestPublishedChangelog', () => {
  it('returns the most recent published entry', async () => {
    const row = { id: 'e1', version_label: '2026.07.26', title: 'Faster goals', body: 'Hi', published_at: '2026-07-26T00:00:00Z' }
    const c = chain({ data: row, error: null })
    supabase.from.mockReturnValue(c)

    const result = await fetchLatestPublishedChangelog()

    expect(supabase.from).toHaveBeenCalledWith('changelog_entries')
    expect(c.not).toHaveBeenCalledWith('published_at', 'is', null)
    expect(c.order).toHaveBeenCalledWith('published_at', { ascending: false })
    expect(c.limit).toHaveBeenCalledWith(1)
    expect(result).toEqual(row)
  })

  it('returns null when there are no published entries', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: null }))
    expect(await fetchLatestPublishedChangelog()).toBeNull()
  })

  it('returns null (never throws) on a query error', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await fetchLatestPublishedChangelog()).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// Admin authoring functions — all go through api/admin-changelog.js with a
// bearer token from the current session.
// ─────────────────────────────────────────────────────────────

describe('fetchAllChangelogEntries', () => {
  it('fetches with the session bearer token and returns entries', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    const entries = [{ id: 'e1', title: 'Draft', published_at: null }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries }) }))

    const result = await fetchAllChangelogEntries()

    expect(fetch).toHaveBeenCalledWith('/api/admin-changelog', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
    }))
    expect(result).toEqual({ ok: true, entries })
  })

  it('short-circuits without a session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('fetch', vi.fn())
    const result = await fetchAllChangelogEntries()
    expect(result).toEqual({ ok: false, error: 'Not signed in', entries: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces a server error without throwing', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Admin only' }) }))
    const result = await fetchAllChangelogEntries()
    expect(result).toEqual({ ok: false, error: 'Admin only', entries: [] })
  })
})

describe('saveChangelogEntry', () => {
  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  })

  it('POSTs the full draft shape, id included for an update', async () => {
    const entry = { id: 'e1', title: 'Updated title' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entry }) }))

    const result = await saveChangelogEntry({ id: 'e1', versionLabel: '2026.07.26', title: 'Updated title', body: 'Body text', published: true })

    expect(fetch).toHaveBeenCalledWith('/api/admin-changelog', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: 'e1', versionLabel: '2026.07.26', title: 'Updated title', body: 'Body text', published: true }),
    }))
    expect(result).toEqual({ ok: true, entry })
  })

  it('returns the server validation error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Title is required' }) }))
    const result = await saveChangelogEntry({ id: null, versionLabel: '', title: '', body: '', published: false })
    expect(result).toEqual({ ok: false, error: 'Title is required' })
  })

  it('short-circuits without a session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('fetch', vi.fn())
    const result = await saveChangelogEntry({ id: null, title: 't', body: 'b', published: false })
    expect(result).toEqual({ ok: false, error: 'Not signed in' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('deleteChangelogEntry', () => {
  it('DELETEs with the id in the query string', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))

    const result = await deleteChangelogEntry('e1')

    expect(fetch).toHaveBeenCalledWith('/api/admin-changelog?id=e1', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
    }))
    expect(result).toEqual({ ok: true })
  })

  it('surfaces a server error without throwing', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Failed to delete entry' }) }))
    const result = await deleteChangelogEntry('e1')
    expect(result).toEqual({ ok: false, error: 'Failed to delete entry' })
  })
})
