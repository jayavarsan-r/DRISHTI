import { describe, it, expect } from 'vitest'
import { Rng } from '../../lib/sim/rng'
import { ImuSynth, DEFAULT_IMU_CONFIG } from '../../lib/sim/imu'
import type { TruthSample } from '../../lib/sim/truth'

const still = (t: number): TruthSample => ({
  t, s: 0, x: 0, y: 0, psi: 0, v: 0, omega: 0, aLong: 0,
})

describe('imu', () => {
  it('carries a constant gyro bias when the vehicle is not turning', () => {
    const imu = new ImuSynth(new Rng(1))
    let sum = 0
    for (let i = 0; i < 20000; i++) sum += imu.sample(still(i * 0.01), 0.01).gyroZ
    expect(sum / 20000).toBeCloseTo(DEFAULT_IMU_CONFIG.bg, 2)
  })

  it('measures ~9.81 on Z at rest, plus bias', () => {
    const imu = new ImuSynth(new Rng(2))
    let sum = 0
    for (let i = 0; i < 20000; i++) sum += imu.sample(still(i * 0.01), 0.01).accelZ
    expect(sum / 20000).toBeGreaterThan(9.6)
    expect(sum / 20000).toBeLessThan(10.0)
  })

  it('fires a shock that decays within 180 ms', () => {
    const imu = new ImuSynth(new Rng(3))
    imu.fireShock(1.0)
    expect(imu.shockActive(1.05)).toBe(true)
    expect(imu.shockActive(1.3)).toBe(false)
    const during = imu.sample(still(1.02), 0.01)
    const after = imu.sample(still(1.5), 0.01)
    expect(Math.abs(during.accelZ - 9.81)).toBeGreaterThan(Math.abs(after.accelZ - 9.81) + 2)
  })

  it('is deterministic for a given seed', () => {
    const run = () => {
      const imu = new ImuSynth(new Rng(26168))
      return Array.from({ length: 300 }, (_, i) => imu.sample(still(i * 0.01), 0.01).accelX)
    }
    expect(run()).toEqual(run())
  })

  it('leaks lateral acceleration into accel_y when turning', () => {
    const imu = new ImuSynth(new Rng(5))
    const turning: TruthSample = { t: 0, s: 0, x: 0, y: 0, psi: 0, v: 10, omega: 0.4, aLong: 0 }
    let sum = 0
    for (let i = 0; i < 5000; i++) sum += imu.sample({ ...turning, t: i * 0.01 }, 0.01).accelY
    expect(sum / 5000).toBeGreaterThan(3)
  })
})
