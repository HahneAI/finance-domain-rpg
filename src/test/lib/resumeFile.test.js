// §2.E1 v2 — client-side résumé file validation + text extraction.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateResumeFile, extractResumeText, formatFileSize, RESUME_MAX_FILE_BYTES } from '../../lib/resumeFile.js'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getDocument: vi.fn(),
    extractRawText: vi.fn(),
  },
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}))
vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: 'blob:worker-url' }))
vi.mock('mammoth', () => ({ extractRawText: mocks.extractRawText }))

function makeFile({ name, type, size = 100, text = '' }) {
  return {
    name,
    type,
    size,
    text: vi.fn().mockResolvedValue(text),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateResumeFile', () => {
  it('rejects a missing file', () => {
    const { valid, error } = validateResumeFile(null)
    expect(valid).toBe(false)
    expect(error).toBeTruthy()
  })

  it('accepts any mime type under the size cap', () => {
    const { valid } = validateResumeFile(makeFile({ name: 'weird.xyz', type: 'application/x-unknown', size: 1024 }))
    expect(valid).toBe(true)
  })

  it('rejects a file over the size cap', () => {
    const { valid, error } = validateResumeFile(makeFile({ name: 'huge.pdf', type: 'application/pdf', size: RESUME_MAX_FILE_BYTES + 1 }))
    expect(valid).toBe(false)
    expect(error).toMatch(/too large/)
  })
})

describe('extractResumeText', () => {
  it('extracts plain text files directly, no library involved', async () => {
    const file = makeFile({ name: 'resume.txt', type: 'text/plain', text: '  Warehouse lead, 5 years.  ' })
    const result = await extractResumeText(file)
    expect(result).toEqual({ text: 'Warehouse lead, 5 years.', extractable: true, error: null })
  })

  it('falls back to the file extension when the mime type is generic/empty', async () => {
    const file = makeFile({ name: 'resume.txt', type: '', text: 'Some resume text' })
    const result = await extractResumeText(file)
    expect(result.extractable).toBe(true)
    expect(result.text).toBe('Some resume text')
  })

  it('extracts PDF text via pdfjs-dist, joining page text content', async () => {
    const page = {
      getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Warehouse' }, { str: 'Lead' }] }),
    }
    const pdf = { numPages: 1, getPage: vi.fn().mockResolvedValue(page) }
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf) })

    const file = makeFile({ name: 'resume.pdf', type: 'application/pdf' })
    const result = await extractResumeText(file)

    expect(result).toEqual({ text: 'Warehouse Lead', extractable: true, error: null })
  })

  it('extracts DOCX text via mammoth', async () => {
    mocks.extractRawText.mockResolvedValue({ value: '  Warehouse lead, 5 years.  ' })
    const file = makeFile({
      name: 'resume.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const result = await extractResumeText(file)
    expect(result).toEqual({ text: 'Warehouse lead, 5 years.', extractable: true, error: null })
  })

  it('reports extractable: false with no error for a file type it does not parse', async () => {
    const file = makeFile({ name: 'photo.jpg', type: 'image/jpeg' })
    const result = await extractResumeText(file)
    expect(result).toEqual({ text: '', extractable: false, error: null })
  })

  it('reports extractable: false with an error message when a recognized format fails to parse', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF structure')) })
    const file = makeFile({ name: 'corrupt.pdf', type: 'application/pdf' })
    const result = await extractResumeText(file)
    expect(result.extractable).toBe(false)
    expect(result.error).toBe('Invalid PDF structure')
  })
})

describe('formatFileSize', () => {
  it('formats bytes, KB, and MB at the expected thresholds', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('returns an empty string for a missing size', () => {
    expect(formatFileSize(null)).toBe('')
    expect(formatFileSize(undefined)).toBe('')
  })
})
