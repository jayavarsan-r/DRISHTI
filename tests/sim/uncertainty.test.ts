import { describe, it, expect } from 'vitest'
import { UncertaintyTracker } from '../../lib/sim/uncertainty'

describe('uncertainty', () => {
  it('grows all three variances during dead reckoning', () => {
    const u = new UncertaintyTracker()
    const before = { ...u.state }
    for (let i = 0; i < 1000; i++) u.propagate(0.01, 14, 0.35, 0.004, 0.001)
    expect(u.state.sigmaAlong).toBeGreaterThan(before.sigmaAlong)
    expect(u.state.sigmaCross).toBeGreaterThan(before.sigmaCross)
    expect(u.state.sigmaPsi).toBeGreaterThan(before.sigmaPsi)
  })

  it('MAP MATCH COLLAPSES CROSS-TRACK ONLY — never along-track', () => {
    const u = new UncertaintyTracker()
    for (let i = 0; i < 3000; i++) u.propagate(0.01, 14, 0.35, 0.004, 0.001)
    const alongBefore = u.state.sigmaAlong
    const crossBefore = u.state.sigmaCross
    u.collapseCrossTrack(1.5)
    expect(u.state.sigmaCross).toBeLessThan(crossBefore)
    expect(u.state.sigmaAlong).toBe(alongBefore)
  })

  it('produces a long thin cigar during blackout, not a circle', () => {
    const u = new UncertaintyTracker()
    for (let i = 0; i < 2000; i++) {
      u.propagate(0.01, 14, 0.35, 0.004, 0.001)
      if (i % 100 === 0) u.collapseCrossTrack(1.5)
    }
    expect(u.state.sigmaAlong / u.state.sigmaCross).toBeGreaterThan(2)
  })

  it('a GNSS fix collapses both axes', () => {
    const u = new UncertaintyTracker()
    for (let i = 0; i < 3000; i++) u.propagate(0.01, 14, 0.35, 0.004, 0.001)
    u.collapseFromGnss(3.0)
    expect(u.state.sigmaAlong).toBeLessThan(4)
    expect(u.state.sigmaCross).toBeLessThan(4)
  })
})
