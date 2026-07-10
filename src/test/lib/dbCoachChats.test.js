// §18.H2 — coach_chats persistence (migration 022_add_coach_chats.sql).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import { loadCoachChats, saveCoachChat, deleteCoachChat } from '../../lib/db.js'

// Chainable mock: every method returns the chain itself so `.select().eq()...`
// keeps building, and it's thenable so `await` resolves to the queued result.
function chain(result) {
  const c = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'upsert', 'delete']) {
    c[m] = vi.fn(() => c)
  }
  c.single = vi.fn(async () => result)
  c.then = (res, rej) => Promise.resolve(result).then(res, rej)
  return c
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue('test-user-id')
})

describe('loadCoachChats', () => {
  it('returns [] when not signed in, without querying Supabase', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await loadCoachChats()
    expect(result).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('maps snake_case rows to the camelCase shape the app uses', async () => {
    const row = {
      id: 'chat-1',
      chat_type: 'ask_coach',
      title: 'Budget question',
      messages: [{ role: 'user', content: 'hi' }],
      summary: 'Discussed budget',
      insights: { key: 'value' },
      search_params: null,
      search_results: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
    }
    supabase.from.mockReturnValue(chain({ data: [row], error: null }))

    const result = await loadCoachChats()

    expect(result).toEqual([{
      id: 'chat-1',
      chatType: 'ask_coach',
      title: 'Budget question',
      messages: [{ role: 'user', content: 'hi' }],
      summary: 'Discussed budget',
      insights: { key: 'value' },
      searchParams: null,
      searchResults: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
    }])
  })

  it('passes the limit through to the query', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockReturnValue(c)

    await loadCoachChats(5)

    expect(c.limit).toHaveBeenCalledWith(5)
  })

  it('defaults messages to [] when the column is null', async () => {
    supabase.from.mockReturnValue(chain({
      data: [{ id: 'c1', chat_type: 'ask_coach', messages: null }],
      error: null,
    }))
    const result = await loadCoachChats()
    expect(result[0].messages).toEqual([])
  })

  it('returns [] and does not throw on a query error (e.g. migration not yet run)', async () => {
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'relation "coach_chats" does not exist' } }))
    const result = await loadCoachChats()
    expect(result).toEqual([])
  })
})

describe('saveCoachChat', () => {
  it('returns null when not signed in, without querying Supabase', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await saveCoachChat({ chatType: 'ask_coach' })
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('omits id from the upsert payload for a brand-new chat (lets the DB default generate one)', async () => {
    const c = chain({ data: { id: 'generated-id' }, error: null })
    supabase.from.mockReturnValue(c)

    const result = await saveCoachChat({ chatType: 'ask_coach', title: 'New chat', messages: [] })

    const payload = c.upsert.mock.calls[0][0]
    expect(payload).not.toHaveProperty('id')
    expect(payload.user_id).toBe('test-user-id')
    expect(payload.chat_type).toBe('ask_coach')
    expect(result).toBe('generated-id')
  })

  it('includes id in the payload when updating an existing chat', async () => {
    const c = chain({ data: { id: 'chat-1' }, error: null })
    supabase.from.mockReturnValue(c)

    await saveCoachChat({ id: 'chat-1', chatType: 'ask_coach', messages: [{ role: 'user', content: 'hi' }] })

    const payload = c.upsert.mock.calls[0][0]
    expect(payload.id).toBe('chat-1')
    expect(payload.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('always writes user_id from the session, ignoring any stray field on the input', async () => {
    const c = chain({ data: { id: 'chat-1' }, error: null })
    supabase.from.mockReturnValue(c)

    await saveCoachChat({ chatType: 'ask_coach', user_id: 'someone-elses-id', userId: 'also-not-this' })

    expect(c.upsert.mock.calls[0][0].user_id).toBe('test-user-id')
  })

  it('returns null and logs on a save error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))

    const result = await saveCoachChat({ chatType: 'ask_coach' })

    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('deleteCoachChat', () => {
  it('does nothing when not signed in', async () => {
    getCurrentUserId.mockResolvedValue(null)
    await deleteCoachChat('chat-1')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('filters by both id and the session user_id (defense-in-depth on top of RLS)', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await deleteCoachChat('chat-1')

    expect(c.delete).toHaveBeenCalled()
    expect(c.eq).toHaveBeenCalledWith('id', 'chat-1')
    expect(c.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
  })

  it('logs on a delete error without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))

    await expect(deleteCoachChat('chat-1')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
