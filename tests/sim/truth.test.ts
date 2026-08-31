import { describe, it, expect } from 'vitest'
import { generateTruth } from '../../lib/sim/truth'
import { ROUTE_LENGTH, INTERSECTION_S } from '../../lib/sim/road'

const T = generateTruth(0.01)

describe('truth', () => {
  it('runs for roughly 110 s', () => {
    expect(T.duration).toBeGreaterThan(95)
    expect(T.duration).toBeLessThan(130)
  })

  it('reaches 14 m/s within about 8 s', () => {
    const at8 = T.samples[800]
    expect(at8.v).toBeGreaterThan(12)
    expect(at8.v).toBeLessThan(15)
  })

  it('contains one contiguous 4 s stop at the intersection', () => {
    // The vehicle is also at rest at the standing start, so assert on the
    // longest contiguous stopped run rather than on every stopped sample.
    let best = 0
    let bestStart = -1
    let run = 0
    for (let i = 0; i < T.samples.length; i++) {
      if (T.samples[i].v < 0.05) {
        run++
        if (run > best) {
          best = run
          bestStart = i - run + 1
        }
      } else {
        run = 0
      }
    }
    expect(best * 0.01).toBeGreaterThan(3.5)
    expect(best * 0.01).toBeLessThan(5.0)

    // and it happens at the intersection, not at the start line
    expect(T.samples[bestStart].s).toBeCloseTo(INTERSECTION_S, 0)
  })

  it('slows through the tight turns', () => {
    const inTurn = T.samples.filter((s) => Math.abs(s.omega) > 0.25)
    expect(inTurn.length).toBeGreaterThan(0)
    expect(Math.max(...inTurn.map((s) => s.v))).toBeLessThan(9)
  })

  it('covers the whole route', () => {
    expect(T.samples[T.samples.length - 1].s).toBeCloseTo(ROUTE_LENGTH, 0)
  })

  it('keeps omega consistent with v and curvature', () => {
    for (const s of T.samples.filter((x) => x.v > 1)) {
      expect(Number.isFinite(s.omega)).toBe(true)
      expect(Math.abs(s.omega)).toBeLessThan(1.0)
    }
  })
})
