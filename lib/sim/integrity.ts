/**
 * Receiver-autonomous integrity monitoring by normalised innovation squared.
 *
 * The filter predicts where it is and how uncertain that prediction is. A fix
 * that disagrees by far more than that uncertainty allows is not evidence the
 * filter is wrong — it is evidence the fix is. The chi-square gate makes that
 * judgement quantitatively rather than by a hand-tuned distance threshold.
 *
 * The NIS reported to the UI is always the real computed value. A spoof shows
 * an enormous number because it genuinely is enormous, not because it is
 * special-cased.
 */

import { CHI2_2DOF_99 } from './constants'
import type { GnssFix } from './gnss'
import type { UncertaintyState } from './uncertainty'
import type { Vec2 } from './road'

export interface IntegrityResult {
  nis: number
  threshold: number
  accepted: boolean
  reason: string
  /** innovation vector, world frame */
  innovation: Vec2
  /** innovation magnitude, m */
  innovationMag: number
}

export function nisGate(
  fix: GnssFix,
  pred: Vec2,
  psi: number,
  u: UncertaintyState
): IntegrityResult {
  // Innovation: what the fix says minus what the filter predicted.
  const nx = fix.x - pred.x
  const ny = fix.y - pred.y

  /*
   * Rotate the filter's along/cross covariance into the world frame.
   * P_world = R * diag(along^2, cross^2) * R^T
   */
  const c = Math.cos(psi)
  const s = Math.sin(psi)
  const va = u.sigmaAlong ** 2
  const vc = u.sigmaCross ** 2

  const pxx = c * c * va + s * s * vc
  const pyy = s * s * va + c * c * vc
  const pxy = c * s * (va - vc)

  // S = P_pred + R_gnss
  const r = fix.sigma ** 2
  const sxx = pxx + r
  const syy = pyy + r
  const sxy = pxy

  // Closed-form 2x2 inverse.
  const det = sxx * syy - sxy * sxy
  const safeDet = Math.abs(det) < 1e-12 ? 1e-12 : det

  const ixx = syy / safeDet
  const iyy = sxx / safeDet
  const ixy = -sxy / safeDet

  const nis = nx * (ixx * nx + ixy * ny) + ny * (ixy * nx + iyy * ny)

  const accepted = nis <= CHI2_2DOF_99

  return {
    nis,
    threshold: CHI2_2DOF_99,
    accepted,
    reason: accepted
      ? 'Innovation within covariance'
      : 'Innovation exceeds chi-square gate',
    innovation: { x: nx, y: ny },
    innovationMag: Math.hypot(nx, ny),
  }
}
