import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// Mock Supabase — chainable per-table builders. Each chain is thenable so
// `await supabase.from(t).insert(...)` and terminal .single()/.maybeSingle()
// both resolve to the queued result.
// ─────────────────────────────────────────────────────────────
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { signUp: vi.fn() },
  },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import {
  createInvestorAccount,
  saveInvestorActiveAccount,
  fetchAllInvestorCodes,
  fetchAllInvestorUsers,
  setInvestorCodeActive,
  createInvestorCode,
  loadDemoAccount,
  saveDemoAccount,
} from '../../lib/db.js'

function chain(result) {
  const c = {}
  for (const m of ['select', 'eq', 'order', 'update', 'insert', 'upsert', 'delete']) {
    c[m] = vi.fn(() => c)
  }
  c.single = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  c.then = (res, rej) => Promise.resolve(result).then(res, rej)
  return c
}

/** Route supabase.from(table) to per-table chains; unrouted tables get an ok chain. */
function routeTables(map) {
  supabase.from.mockImplementation(table => map[table] ?? chain({ data: null, error: null }))
  return map
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue('test-user-id')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────
// createInvestorAccount
// ─────────────────────────────────────────────────────────────

describe('createInvestorAccount', () => {
  const args = { name: 'Ada', email: 'ada@vc.com', password: 'pw123456', company: 'Ada Capital', city: 'Austin', codeUsed: 'alpha' }

  it('creates auth user, investor profile, and seeded user_data row', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u9' }, session: { access_token: 't' } }, error: null })
    const tables = routeTables({
      investor_users: chain({ error: null }),
      user_data: chain({ error: null }),
    })

    const result = await createInvestorAccount(args)
    expect(result).toEqual({ session: { access_token: 't' }, error: null, needsConfirmation: false })
    expect(tables.investor_users.insert).toHaveBeenCalledWith(expect.objectContaining({
      auth_user_id: 'u9',
      investor_name: 'Ada',
      company_name: 'Ada Capital',
      code_used: 'alpha',
      active_account: 1,
    }))
    const [payload, opts] = tables.user_data.upsert.mock.calls[0]
    expect(payload).toMatchObject({ user_id: 'u9' })
    expect(payload.is_investor).toBeUndefined()
    expect(payload.config).toMatchObject({ isInvestor: true, investorName: 'Ada', setupComplete: false })
    expect(opts).toEqual({ onConflict: 'user_id' })
    // is_investor itself is granted via the service-role seed route (type:
    // "investor"), not the client upsert above (migration 019 revokes that
    // column grant).
    expect(fetch).toHaveBeenCalledWith('/api/seed', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer t' }),
      body: JSON.stringify({ type: 'investor', code: 'alpha' }),
    }))
  })

  it('skips the seed-investor call when no session exists yet (email confirm pending)', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u9' }, session: null }, error: null })
    routeTables({ investor_users: chain({ error: null }), user_data: chain({ error: null }) })
    await createInvestorAccount(args)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces an error when the seed-investor route rejects the code', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u9' }, session: { access_token: 't' } }, error: null })
    routeTables({ investor_users: chain({ error: null }), user_data: chain({ error: null }) })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid or inactive investor code' }) })
    const result = await createInvestorAccount(args)
    expect(result.error).toBe('Invalid or inactive investor code')
  })

  it('flags needsConfirmation when signUp returns no session (email confirm flow)', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u9' }, session: null }, error: null })
    routeTables({ investor_users: chain({ error: null }), user_data: chain({ error: null }) })
    const result = await createInvestorAccount(args)
    expect(result.needsConfirmation).toBe(true)
    expect(result.error).toBeNull()
  })

  it('returns the auth error without touching the database', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: { message: 'email taken' } })
    routeTables({})
    const result = await createInvestorAccount(args)
    expect(result).toEqual({ session: null, error: 'email taken', needsConfirmation: false })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('errors when signUp returns no user', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const result = await createInvestorAccount(args)
    expect(result.error).toMatch(/no user returned/i)
  })

  it('rolls back the investor profile when the user_data seed fails', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u9' }, session: {} }, error: null })
    const tables = routeTables({
      investor_users: chain({ error: null }),
      user_data: chain({ error: { message: 'rls denied' } }),
    })
    const result = await createInvestorAccount(args)
    expect(result.error).toBe('rls denied')
    expect(tables.investor_users.delete).toHaveBeenCalled()
    expect(tables.investor_users.eq).toHaveBeenCalledWith('auth_user_id', 'u9')
  })
})

// ─────────────────────────────────────────────────────────────
// saveInvestorActiveAccount
// ─────────────────────────────────────────────────────────────

describe('saveInvestorActiveAccount', () => {
  it('updates active_account for the signed-in investor', async () => {
    const tables = routeTables({ investor_users: chain({ error: null }) })
    await saveInvestorActiveAccount(2)
    expect(tables.investor_users.update).toHaveBeenCalledWith({ active_account: 2 })
    expect(tables.investor_users.eq).toHaveBeenCalledWith('auth_user_id', 'test-user-id')
  })

  it('no-ops when no user is signed in', async () => {
    getCurrentUserId.mockResolvedValue(null)
    routeTables({})
    await saveInvestorActiveAccount(2)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────
// Admin code management
// ─────────────────────────────────────────────────────────────

describe('fetchAllInvestorCodes / fetchAllInvestorUsers', () => {
  it('returns rows ordered newest-first', async () => {
    const rows = [{ id: 1, code: 'alpha' }]
    const tables = routeTables({ investor_codes: chain({ data: rows, error: null }) })
    expect(await fetchAllInvestorCodes()).toEqual(rows)
    expect(tables.investor_codes.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns an empty array when data is null', async () => {
    routeTables({ investor_users: chain({ data: null, error: null }) })
    expect(await fetchAllInvestorUsers()).toEqual([])
  })

  it('throws on a database error', async () => {
    routeTables({ investor_codes: chain({ data: null, error: { message: 'denied' } }) })
    await expect(fetchAllInvestorCodes()).rejects.toThrow('denied')
  })
})

describe('setInvestorCodeActive', () => {
  it('toggles is_active on the target row', async () => {
    const tables = routeTables({ investor_codes: chain({ error: null }) })
    await setInvestorCodeActive(7, false)
    expect(tables.investor_codes.update).toHaveBeenCalledWith({ is_active: false })
    expect(tables.investor_codes.eq).toHaveBeenCalledWith('id', 7)
  })

  it('throws on error', async () => {
    routeTables({ investor_codes: chain({ error: { message: 'nope' } }) })
    await expect(setInvestorCodeActive(7, true)).rejects.toThrow('nope')
  })
})

describe('createInvestorCode', () => {
  it('stores the code trimmed + lowercased and blanks as null', async () => {
    const row = { id: 3, code: 'beta' }
    const tables = routeTables({ investor_codes: chain({ data: row, error: null }) })
    expect(await createInvestorCode({ code: '  BETA ', label: '  ', notes: '' })).toEqual(row)
    expect(tables.investor_codes.insert).toHaveBeenCalledWith({ code: 'beta', label: null, notes: null })
  })

  it('throws on error', async () => {
    routeTables({ investor_codes: chain({ data: null, error: { message: 'duplicate' } }) })
    await expect(createInvestorCode({ code: 'x', label: '', notes: '' })).rejects.toThrow('duplicate')
  })
})

// ─────────────────────────────────────────────────────────────
// Demo accounts
// ─────────────────────────────────────────────────────────────

describe('loadDemoAccount / saveDemoAccount', () => {
  it('returns the demo row when present', async () => {
    const row = { config: { a: 1 }, expenses: [], goals: [], logs: [], meta: {} }
    const tables = routeTables({ demo_accounts: chain({ data: row, error: null }) })
    expect(await loadDemoAccount(2)).toEqual(row)
    expect(tables.demo_accounts.eq).toHaveBeenCalledWith('account_number', 2)
  })

  it('returns null for a missing row or an error (caller falls back to fixture)', async () => {
    routeTables({ demo_accounts: chain({ data: null, error: null }) })
    expect(await loadDemoAccount(2)).toBeNull()
    routeTables({ demo_accounts: chain({ data: null, error: { message: 'boom' } }) })
    expect(await loadDemoAccount(2)).toBeNull()
  })

  it('upserts with defaults for missing fields, keyed on account_number', async () => {
    const tables = routeTables({ demo_accounts: chain({ error: null }) })
    await saveDemoAccount(1, {})
    const [payload, opts] = tables.demo_accounts.upsert.mock.calls[0]
    expect(payload).toMatchObject({ account_number: 1, config: {}, expenses: [], goals: [], logs: [], meta: {} })
    expect(opts).toEqual({ onConflict: 'account_number' })
  })

  it('throws when the upsert is rejected (RLS non-admin)', async () => {
    routeTables({ demo_accounts: chain({ error: { message: 'rls' } }) })
    await expect(saveDemoAccount(1, {})).rejects.toThrow('rls')
  })
})
