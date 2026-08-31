/**
 * Seeded pseudo-random number generation.
 *
 * Every stochastic value in the simulator comes from here. Math.random() is
 * banned across lib/sim (enforced by tests/sim/hygiene.test.ts) because a judge
 * will press RESET and watch the run a second time — different numbers on the
 * second run destroys the demonstration.
 */

export class Rng {
  private s: number

  constructor(seed: number) {
    // Force to uint32. A zero state is degenerate for mulberry32, so nudge it.
    this.s = seed >>> 0 || 1
  }

  /** Uniform in [0, 1). mulberry32. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * Box-Muller. Generates one pair and discards the second value.
   *
   * Caching the spare would make the stream depend on how many times gaussian()
   * has been called, so toggling an estimator off and on via the ablation
   * controls would silently shift every later draw. Burning one extra uniform
   * per call is the cost of that independence.
   */
  gaussian(mu = 0, sigma = 1): number {
    let u = this.next()
    const v = this.next()
    // guard log(0)
    if (u < Number.EPSILON) u = Number.EPSILON
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

/**
 * First-order autoregressive noise: x_k = rho*x_{k-1} + sqrt(1-rho^2)*N(0,sigma).
 *
 * The scaling keeps the stationary standard deviation at `sigma` regardless of
 * `rho`, which is what makes the speed model's error *bounded* rather than a
 * random walk — the whole point of estimating speed instead of integrating it.
 */
export function makeAr1(rng: Rng, sigma: number, rho: number): () => number {
  let x = 0
  const drive = Math.sqrt(1 - rho * rho)
  return () => {
    x = rho * x + drive * rng.gaussian(0, sigma)
    return x
  }
}
