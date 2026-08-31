import { describe, it, expect } from 'vitest'
import { nisGate } from '../../lib/sim/integrity'
import { CHI2_2DOF_99 } from '../../lib/sim/constants'

const u = { sigmaPsi: 0.02, sigmaAlong: 4, sigmaCross: 2 }

describe('integrity gate', () => {
  it('accepts a fix that agrees with the prediction', () => {
    const r = nisGate(
      { t: 1, x: 101, y: 50.5, hdop: 1.2, sigma: 3, spoofed: false },
      { x: 100, y: 50 }, 0, u
    )
    expect(r.nis).toBeLessThan(CHI2_2DOF_99)
    expect(r.accepted).toBe(true)
  })

  it('rejects a 420 m spoof with an enormous NIS', () => {
    const r = nisGate(
      { t: 1, x: 520, y: 50, hdop: 1.2, sigma: 3, spoofed: true },
      { x: 100, y: 50 }, 0, u
    )
    expect(r.nis).toBeGreaterThan(1000)
    expect(r.accepted).toBe(false)
    expect(r.threshold).toBe(CHI2_2DOF_99)
  })

  it('grows more tolerant as uncertainty grows', () => {
    const tight = nisGate(
      { t: 1, x: 112, y: 50, hdop: 1.2, sigma: 3, spoofed: false },
      { x: 100, y: 50 }, 0, { sigmaPsi: 0.02, sigmaAlong: 2, sigmaCross: 2 }
    )
    const loose = nisGate(
      { t: 1, x: 112, y: 50, hdop: 1.2, sigma: 3, spoofed: false },
      { x: 100, y: 50 }, 0, { sigmaPsi: 0.02, sigmaAlong: 40, sigmaCross: 40 }
    )
    expect(loose.nis).toBeLessThan(tight.nis)
  })
})
