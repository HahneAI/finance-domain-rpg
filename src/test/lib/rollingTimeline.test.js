import { describe, it, expect } from 'vitest'
import {
  deriveRollingIncomeWeeks,
  deriveRollingTimelineMonths,
  progressiveScale,
} from '../../lib/rollingTimeline.js'

const makeWeek = (idx, dateIso, active = true) => ({
  idx,
  active,
  weekEnd: new Date(`${dateIso}T12:00:00Z`),
})

describe('deriveRollingIncomeWeeks', () => {
  it('keeps the last completedWeeksToKeep past weeks plus all future weeks visible', () => {
    const weeks = Array.from({ length: 7 }, (_, idx) =>
      makeWeek(idx, `2026-01-0${idx + 1}`)
    )

    const result = deriveRollingIncomeWeeks(weeks, '2026-01-05', 2)
    expect(result.visibleWeeks.map((w) => w.idx)).toEqual([2, 3, 4, 5, 6])
    expect(result.hiddenWeeks.map((w) => w.idx)).toEqual([0, 1])
    expect(result.scaleProgress).toBeCloseTo(0.4)
  })

  it('filters inactive or invalid weeks and clamps scale progress at 1', () => {
    const weeks = [
      makeWeek(0, '2026-01-01'),
      { ...makeWeek(1, '2026-01-08'), active: false },
      { idx: 2, active: true, weekEnd: 'not-a-date' },
      makeWeek(3, '2026-02-01'),
      makeWeek(4, '2026-03-01'),
      makeWeek(5, '2026-04-01'),
      makeWeek(6, '2026-05-01'),
      makeWeek(7, '2026-06-01'),
    ]

    const result = deriveRollingIncomeWeeks(weeks, '2026-12-01', 1)
    expect(result.visibleWeeks.map((w) => w.idx)).toEqual([7])
    expect(result.hiddenWeeks.map((w) => w.idx)).toEqual([0, 3, 4, 5, 6])
    expect(result.scaleProgress).toBe(1)
  })
})

describe('deriveRollingTimelineMonths', () => {
  it('exposes lookback months plus current/future months as visible', () => {
    const segments = [
      { key: '2025-12', total: 100 },
      { key: '2026-01', total: 110 },
      { key: '2026-02', total: 120 },
      { key: '2026-03', total: 130 },
    ]
    const result = deriveRollingTimelineMonths(segments, '2026-02-15', 1)

    expect(result.visibleMonths.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.hiddenMonths.map((m) => m.key)).toEqual(['2025-12'])
    expect(result.scaleProgress).toBeCloseTo(0.5)
  })

  it('drops invalid month keys and saturates the scale when all earlier months are hidden', () => {
    const segments = [
      { key: '2025-10', total: 95 },
      { key: 'bad-key', total: 0 },
      { key: '2025-11', total: 100 },
      { key: '2025-12', total: 105 },
      { key: '2026-01', total: 110 },
      { key: '2026-02', total: 115 },
      { key: '2026-03', total: 120 },
      { key: '2026-04', total: 125 },
    ]

    const result = deriveRollingTimelineMonths(segments, '2026-04-02', 0)
    expect(result.visibleMonths.map((m) => m.key)).toEqual(['2026-04'])
    expect(result.hiddenMonths.map((m) => m.key)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    expect(result.scaleProgress).toBe(1)
  })
})

describe('progressiveScale', () => {
  it('returns the base scale when progress is zero or negative', () => {
    expect(progressiveScale(0)).toBe(1)
    expect(progressiveScale(-0.25, 0.2)).toBe(1)
  })

  it('scales proportionally up to the configured max increase', () => {
    expect(progressiveScale(0.5, 0.2)).toBeCloseTo(1.1)
    expect(progressiveScale(5, 0.3)).toBe(1.3)
  })
})
