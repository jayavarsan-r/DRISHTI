/**
 * Three navigation estimators consuming the same IMU stream.
 *
 * The entire thesis of the project lives in the difference between B and C:
 * the baseline obtains forward speed by INTEGRATING longitudinal acceleration,
 * so any accelerometer bias becomes a velocity ramp and then a quadratic
 * position error. DRISHTI ESTIMATES speed per window instead, so its speed
 * error stays bounded and position error grows linearly at worst.
 *
 * The naive integrator is deliberately not sharing code with the other two: it
 * must genuinely double-integrate world-frame acceleration with no bias
 * correction and no constraints, because that is the failure being shown.
 */

import type { ImuSample } from './imu'
import type { SpeedEstimate } from './speedModel'
import type { Vec2 } from './road'

export interface EstimatorState {
  x: number
  y: number
  psi: number
  v: number
}

export interface Ablation {
  aiSpeed: boolean
  nhc: boolean
  map: boolean
}

export const FULL_ABLATION: Ablation = { aiSpeed: true, nhc: true, map: true }

const G = 9.81
/*
 * Gains of the ZUPT-driven bias estimators.
 *
 * These drive a first-order convergence onto the residual, `b += k*(measured -
 * b)`, NOT a bare integration of the measurement. Integrating the measurement
 * (`b += k*measured`) has no fixed point: across the 400 samples of a 4 s stop
 * it drives the estimate to many times the true bias and heading then drifts
 * the opposite way, worse than doing nothing.
 */
const BG_LEARN_RATE = 0.02
const BA_LEARN_RATE = 0.02

/**
 * Gains for the GNSS course-over-ground heading aid — a PI complementary
 * filter on heading, with the integral term estimating gyro bias.
 *
 * Ki is set near Kp^2/4, which is critical damping for a PI loop closed at the
 * 1 Hz fix rate. The integral term multiplies by the fix interval (a rate error
 * accumulated over dt); dividing by dt instead over-corrects by roughly the
 * loop's settling factor and the bias estimate then oscillates across zero
 * instead of converging.
 */
const HEADING_AID_GAIN = 0.35
const BG_AID_GAIN = 0.031

/**
 * A. Naive strapdown INS.
 *
 * No bias correction, no motion constraints, no zero-velocity updates. Heading
 * comes from raw gyro integration and position from double-integrating
 * world-frame specific force. This is what "just use the IMU" actually does.
 */
export class NaiveIns {
  readonly state: EstimatorState = { x: 0, y: 0, psi: 0, v: 0 }
  private vx = 0
  private vy = 0

  reset(psi0: number): void {
    this.state.x = 0
    this.state.y = 0
    this.state.psi = psi0
    this.state.v = 0
    this.vx = 0
    this.vy = 0
  }

  step(imu: ImuSample, dt: number): void {
    this.state.psi += imu.gyroZ * dt

    const c = Math.cos(this.state.psi)
    const s = Math.sin(this.state.psi)

    // Rotate body specific force into the world frame. Gravity is nominally
    // carried on Z, so the horizontal channels are used directly — any mount
    // tilt leaks gravity into them, which is exactly the real failure mode.
    const ax = c * imu.accelX - s * imu.accelY
    const ay = s * imu.accelX + c * imu.accelY

    this.vx += ax * dt
    this.vy += ay * dt

    this.state.x += this.vx * dt
    this.state.y += this.vy * dt
    this.state.v = Math.hypot(this.vx, this.vy)
  }
}

/**
 * B. ESKF + non-holonomic constraint baseline.
 *
 * Heading from bias-corrected gyro, forward speed from INTEGRATED longitudinal
 * acceleration, lateral velocity forced to zero (a car cannot slide sideways),
 * and zero-velocity updates while stationary to re-learn the biases.
 *
 * This is a genuinely competent dead-reckoning system. It is included so the
 * demonstration is not a straw man: DRISHTI has to beat this, not just the
 * naive integrator.
 */
export class EskfNhc {
  readonly state: EstimatorState = { x: 0, y: 0, psi: 0, v: 0 }
  private bgHat = 0
  private baHat = 0

  reset(psi0: number): void {
    this.state.x = 0
    this.state.y = 0
    this.state.psi = psi0
    this.state.v = 0
    this.bgHat = 0
    this.baHat = 0
  }

  step(imu: ImuSample, dt: number, stationary: boolean): void {
    this.state.psi += (imu.gyroZ - this.bgHat) * dt
    this.state.v += (imu.accelX - this.baHat) * dt

    if (stationary) {
      // ZUPT: the vehicle is known to be still, so whatever the sensors report
      // is bias, and whatever speed has accumulated is error.
      this.state.v = 0
      this.bgHat += BG_LEARN_RATE * (imu.gyroZ - this.bgHat)
      this.baHat += BA_LEARN_RATE * (imu.accelX - this.baHat)
    }

    // Non-holonomic constraint: motion is along the heading only.
    this.state.x += this.state.v * Math.cos(this.state.psi) * dt
    this.state.y += this.state.v * Math.sin(this.state.psi) * dt
  }

  /**
   * Loosely-coupled heading aid from GNSS course over ground.
   *
   * While fixes are healthy and the vehicle is moving fast enough for course to
   * be meaningful, the difference between the filter's heading and the observed
   * track direction is an observation of accumulated heading error. Feeding a
   * fraction of it back — and attributing part of it to the gyro bias — is what
   * a real GNSS/INS does, and it is why the bias is already largely calibrated
   * by the time a blackout starts.
   */
  aidHeading(course: number, dtSinceLast: number, quality: number): void {
    const err = Math.atan2(
      Math.sin(course - this.state.psi),
      Math.cos(course - this.state.psi)
    )
    this.state.psi += HEADING_AID_GAIN * quality * err

    /*
     * Sign: heading propagates as psi += (gyro_z - bg_hat)*dt. A bg_hat that is
     * too LOW makes psi run ahead of the true course, which shows up as a
     * NEGATIVE err. Correcting that requires raising bg_hat, so the update
     * subtracts the residual rate. Adding it instead compounds the drift —
     * measured at 1.32 deg/s of heading error against a 0.6 deg/s raw bias,
     * i.e. the aid more than doubled the very error it exists to remove.
     */
    this.bgHat -= BG_AID_GAIN * quality * err * Math.max(dtSinceLast, 0.2)
  }
}

/**
 * C. DRISHTI.
 *
 * Identical to B in every respect except one: forward speed comes from the
 * speed model rather than from integrating acceleration. Map correction is
 * applied externally by the engine via applyDelta, and GNSS recovery via
 * blendTo, so this class stays a pure stepper.
 */
export class Drishti {
  readonly state: EstimatorState = { x: 0, y: 0, psi: 0, v: 0 }
  private bgHat = 0
  private baHat = 0
  /** integrated speed, maintained for the AI-SPEED-off ablation path */
  private vIntegrated = 0

  reset(psi0: number): void {
    this.state.x = 0
    this.state.y = 0
    this.state.psi = psi0
    this.state.v = 0
    this.bgHat = 0
    this.baHat = 0
    this.vIntegrated = 0
  }

  step(
    imu: ImuSample,
    dt: number,
    speed: SpeedEstimate,
    stationary: boolean,
    ab: Ablation
  ): void {
    this.state.psi += (imu.gyroZ - this.bgHat) * dt

    // The integrated channel is always maintained so that toggling AI SPEED
    // mid-run switches to a live value rather than a stale one.
    this.vIntegrated += (imu.accelX - this.baHat) * dt

    // THE THESIS: estimate speed per window, or integrate it and accumulate.
    this.state.v = ab.aiSpeed ? speed.vHat : this.vIntegrated

    if (stationary) {
      this.state.v = 0
      this.vIntegrated = 0
      this.bgHat += BG_LEARN_RATE * (imu.gyroZ - this.bgHat)
      this.baHat += BA_LEARN_RATE * (imu.accelX - this.baHat)
    }

    if (ab.nhc) {
      // Non-holonomic: velocity is along the heading, lateral component zero.
      this.state.x += this.state.v * Math.cos(this.state.psi) * dt
      this.state.y += this.state.v * Math.sin(this.state.psi) * dt
    } else {
      // Without the constraint, the lateral accelerometer channel is allowed to
      // push the estimate sideways.
      const c = Math.cos(this.state.psi)
      const s = Math.sin(this.state.psi)
      const lateral = imu.accelY * dt * dt
      this.state.x += this.state.v * c * dt - lateral * s
      this.state.y += this.state.v * s * dt + lateral * c
    }
  }


  /**
   * Loosely-coupled heading aid from GNSS course over ground.
   *
   * While fixes are healthy and the vehicle is moving fast enough for course to
   * be meaningful, the difference between the filter's heading and the observed
   * track direction is an observation of accumulated heading error. Feeding a
   * fraction of it back — and attributing part of it to the gyro bias — is what
   * a real GNSS/INS does, and it is why the bias is already largely calibrated
   * by the time a blackout starts.
   */
  aidHeading(course: number, dtSinceLast: number, quality: number): void {
    const err = Math.atan2(
      Math.sin(course - this.state.psi),
      Math.cos(course - this.state.psi)
    )
    this.state.psi += HEADING_AID_GAIN * quality * err

    /*
     * Sign: heading propagates as psi += (gyro_z - bg_hat)*dt. A bg_hat that is
     * too LOW makes psi run ahead of the true course, which shows up as a
     * NEGATIVE err. Correcting that requires raising bg_hat, so the update
     * subtracts the residual rate. Adding it instead compounds the drift —
     * measured at 1.32 deg/s of heading error against a 0.6 deg/s raw bias,
     * i.e. the aid more than doubled the very error it exists to remove.
     */
    this.bgHat -= BG_AID_GAIN * quality * err * Math.max(dtSinceLast, 0.2)
  }

  /** Map correction, applied by the engine. */
  applyDelta(d: Vec2): void {
    this.state.x += d.x
    this.state.y += d.y
  }

  /** GNSS recovery blend. alpha in [0,1]; never a position assignment. */
  blendTo(target: Vec2, alpha: number): void {
    this.state.x += (target.x - this.state.x) * alpha
    this.state.y += (target.y - this.state.y) * alpha
  }
}
