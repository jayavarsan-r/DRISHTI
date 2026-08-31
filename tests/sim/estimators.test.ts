import { describe, it, expect } from 'vitest'
import { Rng } from '../../lib/sim/rng'
import { ImuSynth } from '../../lib/sim/imu'
import { SpeedModel } from '../../lib/sim/speedModel'
import { generateTruth } from '../../lib/sim/truth'
import { NaiveIns, EskfNhc, Drishti, FULL_ABLATION, type Ablation } from '../../lib/sim/estimators'

function run(ab: Ablation = FULL_ABLATION) {
  const T = generateTruth(0.01)
  const rng = new Rng(26168)
  const imu = new ImuSynth(rng)
  const sm = new SpeedModel(rng)
  const naive = new NaiveIns()
  const eskf = new EskfNhc()
  const drishti = new Drishti()
  const psi0 = T.samples[0].psi
  naive.reset(psi0)
  eskf.reset(psi0)
  drishti.reset(psi0)

  for (const s of T.samples) {
    const m = imu.sample(s, 0.01)
    const stationary = s.v < 0.05
    naive.step(m, 0.01)
    eskf.step(m, 0.01, stationary)
    drishti.step(m, 0.01, sm.estimate(s.v, false), stationary, ab)
  }

  const last = T.samples[T.samples.length - 1]
  const err = (e: { state: { x: number; y: number } }) =>
    Math.hypot(e.state.x - last.x, e.state.y - last.y)
  return {
    naiveErr: err(naive),
    eskfErr: err(eskf),
    drishtiErr: err(drishti),
    length: T.length,
  }
}

describe('estimators', () => {
  it('naive INS diverges catastrophically', () => {
    expect(run().naiveErr).toBeGreaterThan(200)
  })

  it('DRISHTI stays far closer than naive over the same IMU stream', () => {
    const r = run()
    expect(r.drishtiErr).toBeLessThan(r.naiveErr / 5)
  })

  it('DRISHTI beats the integrating ESKF baseline', () => {
    const r = run()
    expect(r.drishtiErr).toBeLessThan(r.eskfErr)
  })

  it('disabling AI SPEED collapses DRISHTI onto the integrating baseline', () => {
    const withAi = run({ aiSpeed: true, nhc: true, map: true })
    const without = run({ aiSpeed: false, nhc: true, map: true })

    // Substantially worse than with the speed model...
    expect(without.drishtiErr).toBeGreaterThan(withAi.drishtiErr * 1.5)

    // ...and specifically, it becomes the ESKF baseline, because with the
    // speed model off the two algorithms are identical. This is the whole
    // point of the ablation: the speed model is the only difference.
    expect(without.drishtiErr).toBeCloseTo(without.eskfErr, 6)
  })

  it('is deterministic', () => {
    expect(run()).toEqual(run())
  })
})
