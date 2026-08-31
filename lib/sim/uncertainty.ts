/**
 * Position uncertainty, propagated as two *separate* variances in the vehicle
 * frame rather than one circular blob.
 *
 * This split is the single most credible behaviour in the build. During a
 * blackout the along-track error grows from speed-estimate error, while the
 * cross-track error grows from heading error multiplied by distance — a much
 * faster process. When the map matches, it tells you which *lane* you are in,
 * not how far along it you are, so it collapses cross-track and leaves
 * along-track completely untouched. The visible result is an ellipse that
 * becomes a long thin cigar pointing down the road.
 */

export interface UncertaintyState {
  /** heading uncertainty, rad */
  sigmaPsi: number
  /** along-track position uncertainty, m */
  sigmaAlong: number
  /** cross-track position uncertainty, m */
  sigmaCross: number
}

/** Alignment leaves a small residual heading uncertainty. */
const INITIAL_SIGMA_PSI = 0.5 * (Math.PI / 180)
const INITIAL_SIGMA_POS = 1.5

/**
 * Correlation time of the speed model's error, seconds.
 *
 * The model is AR(1) with rho = 0.9 at 100 Hz, so tau = dt/(1-rho) = 0.1 s.
 * Errors within a correlation time do not average out, which is why the noise
 * term below uses 2*sigma^2*tau*dt rather than the white-noise sigma^2*dt^2.
 */
const SPEED_ERROR_TAU = 0.1

/**
 * The speed model's systematic scale error (SpeedModel.SCALE_ERROR). Unlike
 * noise this does not average out — it integrates coherently into along-track
 * position error at a rate proportional to speed, and it is the dominant term
 * over a long blackout.
 */
const SPEED_SCALE_UNCERTAINTY = 0.02

/** Ceiling on inflation when the filter admits it is lost, metres. */
const MAX_LOST_SIGMA = 250

/** Scalar Kalman variance update against a measurement of stated accuracy. */
function fuse(varPrior: number, varMeas: number): number {
  return (varPrior * varMeas) / (varPrior + varMeas)
}

export class UncertaintyTracker {
  private varPsi = INITIAL_SIGMA_PSI ** 2
  private varAlong = INITIAL_SIGMA_POS ** 2
  private varCross = INITIAL_SIGMA_POS ** 2

  get state(): UncertaintyState {
    return {
      sigmaPsi: Math.sqrt(this.varPsi),
      sigmaAlong: Math.sqrt(this.varAlong),
      sigmaCross: Math.sqrt(this.varCross),
    }
  }

  /**
   * Each axis accumulates two physically distinct contributions:
   *
   *   coherent   — driven by a persistent bias (speed scale error, heading
   *                error). Does not average out, so the *standard deviation*
   *                grows linearly with time.
   *   incoherent — driven by zero-mean noise of finite correlation time. The
   *                *variance* grows linearly with time.
   *
   * They are combined in quadrature. Treating the coherent part as white noise
   * (variance += sigma^2*dt^2) would make a 30 s blackout accumulate about a
   * centimetre of along-track uncertainty, which is not what a dead-reckoning
   * system does and would leave the ellipse invisible.
   */
  propagate(
    dt: number,
    v: number,
    sigmaV: number,
    gyroNoise: number,
    bgUncertainty: number
  ): void {
    this.varPsi += (gyroNoise ** 2 + bgUncertainty ** 2) * dt

    // Along-track: coherent scale error, plus correlated speed noise.
    const alongCoherent = Math.sqrt(this.varAlong) + SPEED_SCALE_UNCERTAINTY * Math.abs(v) * dt
    this.varAlong = alongCoherent ** 2 + 2 * sigmaV ** 2 * SPEED_ERROR_TAU * dt

    // Cross-track: heading error integrates into lateral offset at rate v*sigmaPsi.
    const sigmaPsi = Math.sqrt(this.varPsi)
    const crossCoherent = Math.sqrt(this.varCross) + Math.abs(v) * sigmaPsi * dt
    this.varCross = crossCoherent ** 2
  }

  /** A GNSS fix constrains position in both directions. */
  collapseFromGnss(sigmaGnss: number): void {
    const r = sigmaGnss ** 2
    this.varAlong = fuse(this.varAlong, r)
    this.varCross = fuse(this.varCross, r)
  }

  /**
   * A map match constrains position across the road only.
   *
   * This method must not read or write varAlong. The test asserts exact
   * equality of sigmaAlong across a call, so any shared code path fails it.
   */
  collapseCrossTrack(sigmaMap: number): void {
    this.varCross = fuse(this.varCross, sigmaMap ** 2)
  }

  inflateHeading(rad: number): void {
    this.varPsi += rad ** 2
  }

  /**
   * Widen the position covariance after persistent innovation rejections.
   *
   * A filter that keeps rejecting fixes is asserting it knows better than the
   * constellation. Past a few consecutive rejections that assertion is the less
   * likely explanation, so the filter admits it is lost and reopens the gate.
   */
  inflateForLostFilter(): void {
    // Capped: past this the filter is simply lost, and unbounded growth would
    // make the reported uncertainty meaningless rather than merely large.
    const cap = MAX_LOST_SIGMA ** 2
    this.varAlong = Math.min(this.varAlong * 4, cap)
    this.varCross = Math.min(this.varCross * 4, cap)
  }

  reset(): void {
    this.varPsi = INITIAL_SIGMA_PSI ** 2
    this.varAlong = INITIAL_SIGMA_POS ** 2
    this.varCross = INITIAL_SIGMA_POS ** 2
  }
}
