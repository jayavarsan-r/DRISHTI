/**
 * Synthetic IMU — what a dash-mounted phone actually measures.
 *
 * Every corruption here is one a real phone suffers: a constant gyro bias that
 * integrates into heading drift, constant accel biases that double-integrate
 * into runaway position error, engine vibration, road shock, and a mount
 * rotation that misaligns the sensor axes from the vehicle axes.
 *
 * These parameters are chosen so the divergence is *visible*. They are not
 * tuned toward any particular final error — whatever the equations produce is
 * what the UI reports.
 */

import type { Rng } from './rng'
import type { TruthSample } from './truth'

export interface ImuSample {
  t: number
  gyroZ: number
  accelX: number
  accelY: number
  accelZ: number
}

export interface ImuConfig {
  /** constant gyro bias, rad/s */
  bg: number
  /** constant accelerometer bias per axis, m/s^2 */
  ba: { x: number; y: number; z: number }
  mountYawDeg: number
  mountPitchDeg: number
}

const DEG = Math.PI / 180

export const DEFAULT_IMU_CONFIG: ImuConfig = {
  bg: 0.6 * DEG,
  ba: { x: 0.05, y: 0.05, z: 0.05 },
  mountYawDeg: 7,
  mountPitchDeg: 2,
}

const G = 9.81
/** Engine harmonic — a real dash mount picks this up continuously. */
const VIBRATION_AMPL = 0.12
const VIBRATION_HZ = 32
/** Pothole impulse magnitude and decay window. */
const SHOCK_G = 0.9
const SHOCK_WINDOW = 0.18
const GYRO_NOISE = 0.004
const ACCEL_NOISE_XY = 0.06
const ACCEL_NOISE_Z = 0.09
/** Bias instability: a slow random walk on top of the constant gyro bias. */
const BG_WALK = 1e-5

export class ImuSynth {
  private rng: Rng
  private cfg: ImuConfig
  private bgWalk = 0
  private shockT: number | null = null

  constructor(rng: Rng, cfg: Partial<ImuConfig> = {}) {
    this.rng = rng
    this.cfg = {
      ...DEFAULT_IMU_CONFIG,
      ...cfg,
      ba: { ...DEFAULT_IMU_CONFIG.ba, ...(cfg.ba ?? {}) },
    }
  }

  fireShock(t: number): void {
    this.shockT = t
  }

  setMount(yawDeg: number, pitchDeg: number): void {
    this.cfg.mountYawDeg = yawDeg
    this.cfg.mountPitchDeg = pitchDeg
  }

  shockActive(t: number): boolean {
    return this.shockT !== null && t >= this.shockT && t < this.shockT + SHOCK_WINDOW
  }

  private shockValue(t: number): number {
    if (!this.shockActive(t)) return 0
    const age = t - (this.shockT as number)
    // exponential decay across the 180 ms window
    return SHOCK_G * G * Math.exp(-age / (SHOCK_WINDOW / 3))
  }

  sample(truth: TruthSample, dt: number): ImuSample {
    const t = truth.t

    this.bgWalk += this.rng.gaussian(0, BG_WALK) * Math.sqrt(dt)

    const vib = VIBRATION_AMPL * Math.sin(2 * Math.PI * VIBRATION_HZ * t)
    const shock = this.shockValue(t)

    const gyroZ =
      truth.omega + this.cfg.bg + this.bgWalk + this.rng.gaussian(0, GYRO_NOISE)

    // Body-frame specific force before the mount rotation is applied.
    const ax = truth.aLong + this.cfg.ba.x + this.rng.gaussian(0, ACCEL_NOISE_XY) + vib + shock
    const ay =
      truth.v * truth.omega + this.cfg.ba.y + this.rng.gaussian(0, ACCEL_NOISE_XY) + vib + shock
    const az = G + this.cfg.ba.z + this.rng.gaussian(0, ACCEL_NOISE_Z) + vib + shock

    // Mount rotation: yaw about Z, then pitch about the new Y. Applied last, so
    // it corrupts the axes exactly as a crooked phone cradle does.
    const cy = Math.cos(this.cfg.mountYawDeg * DEG)
    const sy = Math.sin(this.cfg.mountYawDeg * DEG)
    const cp = Math.cos(this.cfg.mountPitchDeg * DEG)
    const sp = Math.sin(this.cfg.mountPitchDeg * DEG)

    const rx = cy * ax - sy * ay
    const ry = sy * ax + cy * ay
    const rz = az

    return {
      t,
      gyroZ,
      accelX: cp * rx + sp * rz,
      accelY: ry,
      accelZ: -sp * rx + cp * rz,
    }
  }
}
