import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwipeStack } from '../../hooks/useSwipeStack.js'

// jsdom has no IntersectionObserver — install a controllable stub so the test
// can drive visibility callbacks by hand.
class ObserverStub {
  static instances = []
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.observed = []
    this.disconnected = false
    ObserverStub.instances.push(this)
  }
  observe(target) { this.observed.push(target) }
  disconnect() { this.disconnected = true }
}

function withObserver() {
  ObserverStub.instances = []
  vi.stubGlobal('IntersectionObserver', ObserverStub)
}

function mountWithChildren(count) {
  // Mount with n=0 first: the effect deps are [count], so attaching the
  // container and then rerendering with the real count re-runs the effect
  // against a populated container (mirrors the snap children mounting).
  const { result, rerender, unmount } = renderHook(({ n }) => useSwipeStack(n), {
    initialProps: { n: 0 },
  })
  const container = document.createElement('div')
  for (let i = 0; i < count; i++) container.appendChild(document.createElement('section'))
  result.current.containerRef.current = container
  rerender({ n: count })
  return { result, container, unmount }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSwipeStack', () => {
  it('starts at index 0', () => {
    withObserver()
    const { result } = mountWithChildren(3)
    expect(result.current.activeIndex).toBe(0)
  })

  it('is safe when IntersectionObserver is unavailable (test/SSR guard)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { result } = mountWithChildren(3)
    expect(result.current.activeIndex).toBe(0)
  })

  it('observes every snap child with a 0.6 threshold rooted at the container', () => {
    withObserver()
    const { container } = mountWithChildren(3)
    const obs = ObserverStub.instances.at(-1)
    expect(obs.observed).toHaveLength(3)
    expect(obs.options).toEqual({ root: container, threshold: [0.6] })
  })

  it('reports the most-visible child as activeIndex', () => {
    withObserver()
    const { result, container } = mountWithChildren(3)
    const obs = ObserverStub.instances.at(-1)
    act(() => {
      obs.callback([
        { target: container.children[0], intersectionRatio: 0.2 },
        { target: container.children[2], intersectionRatio: 0.9 },
      ])
    })
    expect(result.current.activeIndex).toBe(2)
  })

  it('keeps the current index when no entry is visible (ratio 0)', () => {
    withObserver()
    const { result, container } = mountWithChildren(2)
    const obs = ObserverStub.instances.at(-1)
    act(() => {
      obs.callback([{ target: container.children[1], intersectionRatio: 0.8 }])
    })
    expect(result.current.activeIndex).toBe(1)
    act(() => {
      obs.callback([{ target: container.children[0], intersectionRatio: 0 }])
    })
    expect(result.current.activeIndex).toBe(1)
  })

  it('ignores entries for elements that are not container children', () => {
    withObserver()
    const { result } = mountWithChildren(2)
    const obs = ObserverStub.instances.at(-1)
    act(() => {
      obs.callback([{ target: document.createElement('div'), intersectionRatio: 1 }])
    })
    expect(result.current.activeIndex).toBe(0)
  })

  it('does nothing for a zero count', () => {
    withObserver()
    mountWithChildren(0)
    expect(ObserverStub.instances).toHaveLength(0)
  })

  it('disconnects the observer on unmount', () => {
    withObserver()
    const { unmount } = mountWithChildren(2)
    const obs = ObserverStub.instances.at(-1)
    unmount()
    expect(obs.disconnected).toBe(true)
  })
})
