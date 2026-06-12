import { describe, it, expect } from 'vitest'
import { netWorthHealthStatus, NET_WORTH_HEALTH_THRESHOLD } from '../../lib/finance.js'

describe('netWorthHealthStatus', () => {
  it('flags below threshold when savings rate < 10%', () => {
    // $4,000 saved on $50,000 income = 8% rate
    const r = netWorthHealthStatus(4000, 50000)
    expect(r.belowThreshold).toBe(true)
    expect(r.rate).toBeCloseTo(0.08, 5)
  })

  it('does not flag at or above the 10% threshold', () => {
    const at = netWorthHealthStatus(5000, 50000) // exactly 10%
    expect(at.belowThreshold).toBe(false)
    expect(at.rate).toBeCloseTo(0.1, 5)

    const above = netWorthHealthStatus(10000, 50000) // 20%
    expect(above.belowThreshold).toBe(false)
  })

  it('flags negative savings (spending more than earning)', () => {
    const r = netWorthHealthStatus(-2000, 50000)
    expect(r.belowThreshold).toBe(true)
    expect(r.rate).toBeLessThan(0)
  })

  it('returns a safe, non-flagging result when income is zero or negative', () => {
    expect(netWorthHealthStatus(1000, 0)).toEqual({ rate: null, belowThreshold: false })
    expect(netWorthHealthStatus(1000, -100)).toEqual({ rate: null, belowThreshold: false })
  })

  it('returns a safe result for non-finite inputs', () => {
    expect(netWorthHealthStatus(NaN, 50000).belowThreshold).toBe(false)
    expect(netWorthHealthStatus(1000, Infinity).belowThreshold).toBe(false)
    expect(netWorthHealthStatus(undefined, 50000).belowThreshold).toBe(false)
  })

  it('exposes the threshold constant at 10%', () => {
    expect(NET_WORTH_HEALTH_THRESHOLD).toBe(0.1)
  })
})
