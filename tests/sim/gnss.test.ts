import { describe, it, expect } from 'vitest'
import { Rng } from '../../lib/sim/rng'
import { GnssSim } from '../../lib/sim/gnss'
import type { TruthSample } from '../../lib/sim/truth'

const tru = (t: number): TruthSample => ({
  t, s: 0, x: 100, y: 50, psi: 0, v: 14, omega: 0, aLong: 0,
})

describe('gnss', () => {
  it('emits about 1 fix per second in NOMINAL', () => {
    const g = new GnssSim(new Rng(1))
    g.mode = 'NOMINAL'
    let n = 0
    for (let i = 0; i < 1000; i++) if (g.tick(i * 0.01, tru(i * 0.01))) n++
    expect(n).toBeGreaterThanOrEqual(9)
    expect(n).toBeLessThanOrEqual(11)
  })

  it('emits nothing in DENIED', () => {
    const g = new GnssSim(new Rng(1))
    g.mode = 'DENIED'
    let n = 0
    for (let i = 0; i < 1000; i++) if (g.tick(i * 0.01, tru(i * 0.01))) n++
    expect(n).toBe(0)
  })

  it('is noisier and slower in DEGRADED', () => {
    const g = new GnssSim(new Rng(1))
    g.mode = 'DEGRADED'
    const fixes = []
    for (let i = 0; i < 2000; i++) {
      const f = g.tick(i * 0.01, tru(i * 0.01))
      if (f) fixes.push(f)
    }
    expect(fixes.length).toBeLessThan(15)
    expect(fixes[0].hdop).toBeGreaterThan(4)
  })

  it('offsets by about 420 m in SPOOFED', () => {
    const g = new GnssSim(new Rng(1))
    g.mode = 'SPOOFED'
    let f = null
    for (let i = 0; i < 300 && !f; i++) f = g.tick(i * 0.01, tru(i * 0.01))
    expect(f!.spoofed).toBe(true)
    expect(Math.hypot(f!.x - 100, f!.y - 50)).toBeGreaterThan(380)
  })
})
