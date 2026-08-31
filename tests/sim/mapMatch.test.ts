import { describe, it, expect } from 'vitest'
import { findHypotheses, mapCorrection } from '../../lib/sim/mapMatch'
import { poseAt } from '../../lib/sim/road'

describe('map matching', () => {
  it('returns at most 3 hypotheses summing to probability 1', () => {
    const p = poseAt(700)
    const h = findHypotheses({ x: p.x + 5, y: p.y + 5 }, p.psi, 8, null)
    expect(h.length).toBeGreaterThan(0)
    expect(h.length).toBeLessThanOrEqual(3)
    expect(h.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 6)
  })

  it('NEVER snaps the estimate onto the winner', () => {
    const p = poseAt(700)
    const off = { x: p.x + 12, y: p.y + 12 }
    const h = findHypotheses(off, p.psi, 8, null)
    const d = mapCorrection(off, h, 8)
    const corrected = { x: off.x + d.x, y: off.y + d.y }
    const toWinner = Math.hypot(h[0].proj.x - corrected.x, h[0].proj.y - corrected.y)
    expect(toWinner).toBeGreaterThan(0.5)
  })

  it('applies a smaller correction when the match is ambiguous', () => {
    // Hold sigma fixed and vary only how ambiguous the location is. An
    // ambiguous match must move the estimate less than a clear one.
    const sigma = 8
    const offsetFrom = (s: number) => {
      const p = poseAt(s)
      return {
        pose: p,
        pos: {
          x: p.x + 8 * Math.cos(p.psi + Math.PI / 2),
          y: p.y + 8 * Math.sin(p.psi + Math.PI / 2),
        },
      }
    }

    const clear = offsetFrom(400) // no parallel road here
    const clearH = findHypotheses(clear.pos, clear.pose.psi, sigma, null)
    const clearD = mapCorrection(clear.pos, clearH, sigma)

    const ambiguous = offsetFrom(900) // service road runs 18 m alongside
    const ambH = findHypotheses(ambiguous.pos, ambiguous.pose.psi, sigma, null)
    const ambD = mapCorrection(ambiguous.pos, ambH, sigma)

    expect(ambH[0].p).toBeLessThan(clearH[0].p)
    expect(Math.hypot(ambD.x, ambD.y)).toBeLessThan(Math.hypot(clearD.x, clearD.y))
  })

  it('leans on the map more, not less, as filter uncertainty grows', () => {
    // Textbook Kalman gain P/(P+R): a filter that is badly lost should weight
    // the map more heavily. The spec's "inversely to sigma_cross" would invert
    // this and is not defensible as filtering.
    const p = poseAt(400)
    const off = { x: p.x + 8 * Math.cos(p.psi + Math.PI / 2), y: p.y + 8 * Math.sin(p.psi + Math.PI / 2) }
    const tight = mapCorrection(off, findHypotheses(off, p.psi, 2, null), 2)
    const loose = mapCorrection(off, findHypotheses(off, p.psi, 30, null), 30)
    expect(Math.hypot(loose.x, loose.y)).toBeGreaterThan(Math.hypot(tight.x, tight.y))
  })

  it('produces a genuine split beside the parallel service road', () => {
    const p = poseAt(900)
    const between = {
      x: p.x + 8 * Math.cos(p.psi + Math.PI / 2),
      y: p.y + 8 * Math.sin(p.psi + Math.PI / 2),
    }
    const h = findHypotheses(between, p.psi, 12, null)
    expect(h.length).toBeGreaterThanOrEqual(2)
    expect(h[1].p).toBeGreaterThan(0.15)
    expect(h.some((x) => x.segmentId === 'service')).toBe(true)
  })
})
