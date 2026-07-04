import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollDirection } from '../../hooks/useScrollDirection.js'

// jsdom elements don't actually scroll, so drive the hook by setting
// scrollTop directly and dispatching synthetic scroll events.
function makeScrollable() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const scrollTo = (y) => {
    Object.defineProperty(el, 'scrollTop', { value: y, configurable: true })
    el.dispatchEvent(new Event('scroll'))
  }
  return { el, scrollTo }
}

describe('useScrollDirection', () => {
  it('starts as not scrolling down', () => {
    const { el } = makeScrollable()
    const { result } = renderHook(() => useScrollDirection(el))
    expect(result.current).toBe(false)
  })

  it('returns false and stays inert when the element is null (pre-mount gate)', () => {
    const { result } = renderHook(() => useScrollDirection(null))
    expect(result.current).toBe(false)
  })

  it('flips true when scrolling down', () => {
    const { el, scrollTo } = makeScrollable()
    const { result } = renderHook(() => useScrollDirection(el))
    act(() => scrollTo(50))
    expect(result.current).toBe(true)
  })

  it('flips back false when scrolling up', () => {
    const { el, scrollTo } = makeScrollable()
    const { result } = renderHook(() => useScrollDirection(el))
    act(() => scrollTo(100))
    expect(result.current).toBe(true)
    act(() => scrollTo(60))
    expect(result.current).toBe(false)
  })

  it('always reports false at the very top, even after a downward run', () => {
    const { el, scrollTo } = makeScrollable()
    const { result } = renderHook(() => useScrollDirection(el))
    act(() => scrollTo(100))
    expect(result.current).toBe(true)
    act(() => scrollTo(0))
    expect(result.current).toBe(false)
  })

  it('attaches to a late-mounting element (null → element rerender)', () => {
    const { el, scrollTo } = makeScrollable()
    const { result, rerender } = renderHook(({ node }) => useScrollDirection(node), {
      initialProps: { node: null },
    })
    rerender({ node: el })
    act(() => scrollTo(40))
    expect(result.current).toBe(true)
  })

  it('removes the scroll listener on unmount', () => {
    const { el, scrollTo } = makeScrollable()
    const { result, unmount } = renderHook(() => useScrollDirection(el))
    unmount()
    // Dispatching after unmount must not throw (listener removed, no setState warning)
    expect(() => scrollTo(80)).not.toThrow()
    expect(result.current).toBe(false)
  })
})
