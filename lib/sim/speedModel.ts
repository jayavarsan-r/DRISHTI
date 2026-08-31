/**
 * SPEED MODEL (SIMULATED).
 *
 * This models what a trained 1-D CNN would realistically produce from an IMU
 * window. It is a stand-in for a TCN that has NOT been trained — never label it
 * a trained model, and never display a training accuracy for it.
 *
 * It deliberately does not return truth. The demonstrable point is not that the
 * estimate is magically perfect; it is that the estimate's error stays
 * *bounded* (AR(1), stationary) instead of *accumulating* (an integrator's
 * random walk), and that the model reports low confidence when the input is
 * corrupted by shock so the filter can down-weight it.
 */

import { Rng, makeAr1 } from './rng'

export interface SpeedEstimate {
  vHat: number
  sigmaV: number
  confidence: number
}

/** Stationary standard deviation of the model's speed error, m/s. */
const SIGMA_BASE = 0.35
/** AR(1) correlation — successive windows overlap, so errors are correlated. */
const RHO = 0.9
/** Small proportional scale error, as a real regressor has. */
const SCALE_ERROR = 0.02
/** Shock inflates the model's own reported uncertainty. */
const SHOCK_SIGMA_GAIN = 4
const SHOCK_CONFIDENCE_DROP = 0.35

export class SpeedModel {
  private ar1: () => number

  constructor(rng: Rng) {
    this.ar1 = makeAr1(rng, SIGMA_BASE, RHO)
  }

  estimate(vTrue: number, shockActive: boolean): SpeedEstimate {
    const vHat = vTrue + this.ar1() + SCALE_ERROR * vTrue

    const sigmaV = shockActive ? SIGMA_BASE * SHOCK_SIGMA_GAIN : SIGMA_BASE
    let confidence = 1 / (1 + sigmaV)
    if (shockActive) confidence -= SHOCK_CONFIDENCE_DROP

    return {
      vHat,
      sigmaV,
      confidence: Math.max(0, Math.min(1, confidence)),
    }
  }
}
