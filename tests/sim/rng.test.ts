import { describe, it, expect } from 'vitest'
import { Rng, makeAr1 } from '../../lib/sim/rng'

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(26168)
    const b = new Rng(26168)
    const ra = Array.from({ length: 500 }, () => a.next())
    const rb = Array.from({ length: 500 }, () => b.next())
    expect(ra).toEqual(rb)
  })

  it('differs across seeds', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next())
  })

  it('stays in [0,1)', () => {
    const r = new Rng(7)
    for (let i = 0; i < 10000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('produces gaussians with the requested moments', () => {
    const r = new Rng(3)
    const n = 200000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const v = r.gaussian(2, 3)
      sum += v
      sumSq += v * v
    }
    const mean = sum / n
    const sd = Math.sqrt(sumSq / n - mean * mean)
    expect(mean).toBeCloseTo(2, 1)
    expect(sd).toBeCloseTo(3, 1)
  })

  it('AR(1) is correlated and bounded', () => {
    const step = makeAr1(new Rng(11), 0.35, 0.9)
    const xs = Array.from({ length: 5000 }, step)
    const sd = Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
    expect(sd).toBeGreaterThan(0.2)
    expect(sd).toBeLessThan(0.55)
    let num = 0
    for (let i = 1; i < xs.length; i++) num += xs[i] * xs[i - 1]
    expect(num / (xs.length * sd * sd)).toBeGreaterThan(0.7)
  })
})
