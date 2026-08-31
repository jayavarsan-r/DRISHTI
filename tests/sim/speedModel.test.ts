import { describe, it, expect } from 'vitest'
import { Rng } from '../../lib/sim/rng'
import { SpeedModel } from '../../lib/sim/speedModel'

describe('speed model (simulated)', () => {
  it('does not return truth', () => {
    const m = new SpeedModel(new Rng(1))
    const errs = Array.from({ length: 1000 }, () => m.estimate(14, false).vHat - 14)
    expect(errs.every((e) => e === 0)).toBe(false)
  })

  it('keeps error bounded rather than accumulating', () => {
    const m = new SpeedModel(new Rng(2))
    let maxErr = 0
    for (let i = 0; i < 20000; i++) {
      maxErr = Math.max(maxErr, Math.abs(m.estimate(14, false).vHat - 14))
    }
    expect(maxErr).toBeLessThan(3)
  })

  it('inflates sigma and drops confidence during a shock', () => {
    const m = new SpeedModel(new Rng(3))
    const calm = m.estimate(14, false)
    const hit = m.estimate(14, true)
    expect(hit.sigmaV).toBeGreaterThan(calm.sigmaV * 3)
    expect(hit.confidence).toBeLessThan(calm.confidence)
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const m = new SpeedModel(new Rng(26168))
      return Array.from({ length: 200 }, () => m.estimate(9, false).vHat)
    }
    expect(run()).toEqual(run())
  })
})
