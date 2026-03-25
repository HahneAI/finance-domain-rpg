import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../../hooks/useLocalStorage.js'

// ─────────────────────────────────────────────────────────────────────────────
// useLocalStorage — jsdom provides a real localStorage implementation
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('useLocalStorage — initial value', () => {
  it('returns initialValue when key does not exist in localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 42))
    const [value] = result.current
    expect(value).toBe(42)
  })

  it('returns stored value when key exists in localStorage', () => {
    localStorage.setItem('test-key', JSON.stringify(99))
    const { result } = renderHook(() => useLocalStorage('test-key', 0))
    const [value] = result.current
    expect(value).toBe(99)
  })

  it('returns stored object from localStorage', () => {
    const obj = { name: 'Anthony', level: 5 }
    localStorage.setItem('profile', JSON.stringify(obj))
    const { result } = renderHook(() => useLocalStorage('profile', {}))
    const [value] = result.current
    expect(value).toEqual(obj)
  })

  it('returns initialValue (not null) when key is missing', () => {
    const { result } = renderHook(() => useLocalStorage('missing', 'default'))
    const [value] = result.current
    expect(value).toBe('default')
  })

  it('handles array initial values', () => {
    const { result } = renderHook(() => useLocalStorage('list', [1, 2, 3]))
    const [value] = result.current
    expect(value).toEqual([1, 2, 3])
  })
})

describe('useLocalStorage — persistence', () => {
  it('writes to localStorage when setValue is called', () => {
    const { result } = renderHook(() => useLocalStorage('counter', 0))
    act(() => {
      const [, setValue] = result.current
      setValue(7)
    })
    const stored = JSON.parse(localStorage.getItem('counter'))
    expect(stored).toBe(7)
  })

  it('returns updated value after setValue', () => {
    const { result } = renderHook(() => useLocalStorage('name', 'initial'))
    act(() => {
      const [, setValue] = result.current
      setValue('updated')
    })
    const [value] = result.current
    expect(value).toBe('updated')
  })

  it('overwrites existing stored value on setValue', () => {
    localStorage.setItem('score', JSON.stringify(10))
    const { result } = renderHook(() => useLocalStorage('score', 0))
    act(() => {
      const [, setValue] = result.current
      setValue(99)
    })
    expect(JSON.parse(localStorage.getItem('score'))).toBe(99)
  })
})

describe('useLocalStorage — error resilience', () => {
  it('returns initialValue when localStorage contains malformed JSON', () => {
    localStorage.setItem('bad-key', 'not-json{{{')
    const { result } = renderHook(() => useLocalStorage('bad-key', 'fallback'))
    const [value] = result.current
    expect(value).toBe('fallback')
  })

  it('does not throw when localStorage.setItem fails', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useLocalStorage('quota-key', 0))
    expect(() => {
      act(() => {
        const [, setValue] = result.current
        setValue(1)
      })
    }).not.toThrow()
    setItemSpy.mockRestore()
  })
})
