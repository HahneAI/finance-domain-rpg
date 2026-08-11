// §2.E1 — resume_profile persistence (migration 036_add_resume_profile.sql,
// extended by 041_add_resume_profile_storage.sql for v2's file-upload columns).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

import { supabase, getCurrentUserId } from '../../lib/supabase.js'
import {
  loadResumeProfile, saveResumeProfile,
  uploadResumeFile, getResumeFileUrl, deleteResumeFile,
} from '../../lib/db.js'

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
      storagePath: null,
      originalFilename: null,
      mimeType: null,
      fileSizeBytes: null,
    })
  })

  it('maps the v2 file-metadata columns when a file has been uploaded', async () => {
    const row = {
      resume_text: 'Warehouse lead, 5 years...',
      target_role: 'Operations Manager',
      last_reviewed_at: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-08-11T00:00:00Z',
      storage_path: 'test-user-id/resume.pdf',
      original_filename: 'resume.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 204800,
    }
    supabase.from.mockReturnValue(chain({ data: row, error: null }))

    const result = await loadResumeProfile()

    expect(result.storagePath).toBe('test-user-id/resume.pdf')
    expect(result.originalFilename).toBe('resume.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileSizeBytes).toBe(204800)
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

  // §2.E1 v2 — file-metadata columns must only be written when the caller
  // explicitly passes that key, so a plain text/target-role edit (v1's call
  // shape) can never null out a previously uploaded file's metadata.
  it('omits file-metadata columns entirely on a plain text/target-role save', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await saveResumeProfile({ resumeText: 'hi', targetRole: 'Ops Manager' })

    const payload = c.upsert.mock.calls[0][0]
    expect('storage_path' in payload).toBe(false)
    expect('original_filename' in payload).toBe(false)
    expect('mime_type' in payload).toBe(false)
    expect('file_size_bytes' in payload).toBe(false)
  })

  it('writes file-metadata columns when the caller passes them (upload)', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await saveResumeProfile({
      resumeText: 'hi', targetRole: 'Ops Manager',
      storagePath: 'test-user-id/resume.pdf', originalFilename: 'resume.pdf',
      mimeType: 'application/pdf', fileSizeBytes: 204800,
    })

    const payload = c.upsert.mock.calls[0][0]
    expect(payload.storage_path).toBe('test-user-id/resume.pdf')
    expect(payload.original_filename).toBe('resume.pdf')
    expect(payload.mime_type).toBe('application/pdf')
    expect(payload.file_size_bytes).toBe(204800)
  })

  it('writes explicit nulls for file-metadata columns when the caller clears them (remove)', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockReturnValue(c)

    await saveResumeProfile({
      resumeText: 'hi', targetRole: 'Ops Manager',
      storagePath: null, originalFilename: null, mimeType: null, fileSizeBytes: null,
    })

    const payload = c.upsert.mock.calls[0][0]
    expect(payload.storage_path).toBeNull()
    expect(payload.original_filename).toBeNull()
    expect(payload.mime_type).toBeNull()
    expect(payload.file_size_bytes).toBeNull()
  })
})

// §2.E1 v2 — Supabase Storage helpers for the private 'resumes' bucket
// (migration 041_add_resume_profile_storage.sql).
function storageChain(result) {
  return {
    upload: vi.fn().mockResolvedValue(result),
    createSignedUrl: vi.fn().mockResolvedValue(result),
    remove: vi.fn().mockResolvedValue(result),
  }
}

describe('uploadResumeFile', () => {
  it('returns null storagePath with an error when not signed in', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await uploadResumeFile({ name: 'resume.pdf', size: 100, type: 'application/pdf' })
    expect(result.storagePath).toBeNull()
    expect(result.error).toBeTruthy()
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })

  it('uploads to a fixed per-user path derived from the file extension, overwriting on conflict', async () => {
    const bucket = storageChain({ data: {}, error: null })
    supabase.storage.from.mockReturnValue(bucket)

    const result = await uploadResumeFile({ name: 'My Resume.PDF', size: 100, type: 'application/pdf' })

    expect(supabase.storage.from).toHaveBeenCalledWith('resumes')
    expect(bucket.upload).toHaveBeenCalledWith(
      'test-user-id/resume.pdf',
      expect.anything(),
      expect.objectContaining({ upsert: true })
    )
    expect(result.storagePath).toBe('test-user-id/resume.pdf')
    expect(result.error).toBeNull()
  })

  it('returns null storagePath and the error message on upload failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.storage.from.mockReturnValue(storageChain({ data: null, error: { message: 'bucket not found' } }))

    const result = await uploadResumeFile({ name: 'resume.pdf', size: 100, type: 'application/pdf' })

    expect(result.storagePath).toBeNull()
    expect(result.error).toBe('bucket not found')
    errorSpy.mockRestore()
  })
})

describe('getResumeFileUrl', () => {
  it('returns null without querying Storage when storagePath is falsy', async () => {
    const result = await getResumeFileUrl(null)
    expect(result).toBeNull()
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })

  it('returns the signed URL on success', async () => {
    supabase.storage.from.mockReturnValue(storageChain({ data: { signedUrl: 'https://signed.example/resume.pdf' }, error: null }))
    const result = await getResumeFileUrl('test-user-id/resume.pdf')
    expect(result).toBe('https://signed.example/resume.pdf')
  })

  it('returns null and warns on a signing error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.storage.from.mockReturnValue(storageChain({ data: null, error: { message: 'not found' } }))
    const result = await getResumeFileUrl('test-user-id/resume.pdf')
    expect(result).toBeNull()
    warnSpy.mockRestore()
  })
})

describe('deleteResumeFile', () => {
  it('returns true without querying Storage when storagePath is falsy', async () => {
    const result = await deleteResumeFile(null)
    expect(result).toBe(true)
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })

  it('removes the object and returns true on success', async () => {
    const bucket = storageChain({ data: {}, error: null })
    supabase.storage.from.mockReturnValue(bucket)
    const result = await deleteResumeFile('test-user-id/resume.pdf')
    expect(bucket.remove).toHaveBeenCalledWith(['test-user-id/resume.pdf'])
    expect(result).toBe(true)
  })

  it('returns false and logs on a delete error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.storage.from.mockReturnValue(storageChain({ data: null, error: { message: 'boom' } }))
    const result = await deleteResumeFile('test-user-id/resume.pdf')
    expect(result).toBe(false)
    errorSpy.mockRestore()
  })
})
