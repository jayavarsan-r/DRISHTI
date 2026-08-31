/**
 * Top-K map matching.
 *
 * The important property here is what this module does NOT do: it never snaps
 * the estimate onto the winning road. Snapping is what makes a demo look good
 * and a navigation system lie — it discards the filter's own knowledge of how
 * uncertain it is, and it hides genuine ambiguity between parallel roads.
 *
 * Instead the correction is scaled by the winner's probability and by how much
 * cross-track uncertainty the filter actually has. A low-confidence match
 * barely moves the estimate, and all three candidates stay visible to the UI.
 */

import { SEGMENTS, type Segment, type Vec2 } from './road'

export interface Hypothesis {
  segmentId: string
  name: string
  /** perpendicular distance from the estimate to this segment, m */
  perpDist: number
  /** absolute heading disagreement, rad */
  headingDiff: number
  score: number
  /** normalised probability across the returned candidates */
  p: number
  /** closest point on this segment */
  proj: Vec2
}

const K = 3

/** Score weights: distance dominates, heading disambiguates, history stabilises. */
const W_DIST = 1.0
const W_HEADING = 0.6
const W_TRANSITION = 0.3

/**
 * Fraction of the offset to the winner that a fully-confident match applies in
 * one update. Strictly below 1, so the estimate approaches the road
 * asymptotically instead of being teleported onto it.
 */
const MAX_PULL = 0.35

/** Assumed accuracy of the road geometry itself, m. */
const MAP_SIGMA = 1.5

/**
 * Candidate validation gate, metres.
 *
 * A road this far from the estimate is not a candidate no matter how large the
 * filter's covariance has grown. Without this gate, a large sigma_cross flattens
 * the distance kernel to ~1 for every segment, scoring collapses to heading
 * agreement alone, and the matcher will happily select a parallel road hundreds
 * of metres away and drag the estimate onto it. This is the map-domain
 * equivalent of the chi-square gate on GNSS.
 */
const MAX_CANDIDATE_DIST = 60

/**
 * The distance kernel's sigma is clamped so it always retains discriminating
 * power between nearby roads, even when the filter is very uncertain.
 */
const KERNEL_SIGMA_MIN = 1.0
const KERNEL_SIGMA_MAX = 25

interface Projection {
  point: Vec2
  dist: number
  tangent: number
}

/** Closest point on a polyline, with the tangent heading there. */
function projectToSegment(seg: Segment, pos: Vec2): Projection {
  let best: Projection = { point: seg.points[0], dist: Infinity, tangent: 0 }

  for (let i = 1; i < seg.points.length; i++) {
    const a = seg.points[i - 1]
    const b = seg.points[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-12) continue

    let t = ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx
    const py = a.y + t * dy
    const d = Math.hypot(pos.x - px, pos.y - py)

    if (d < best.dist) {
      best = { point: { x: px, y: py }, dist: d, tangent: Math.atan2(dy, dx) }
    }
  }
  return best
}

function angleDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

export function findHypotheses(
  pos: Vec2,
  psi: number,
  sigmaCross: number,
  prevWinnerId: string | null
): Hypothesis[] {
  const sigma = Math.max(KERNEL_SIGMA_MIN, Math.min(sigmaCross, KERNEL_SIGMA_MAX))

  const scored = SEGMENTS.map((seg) => {
    const proj = projectToSegment(seg, pos)
    const headingDiff = angleDiff(psi, proj.tangent)

    // A road traversed in either direction is equally plausible, so fold the
    // heading term about 90 degrees.
    const headingScore = Math.abs(Math.cos(headingDiff))

    const distScore = Math.exp(-(proj.dist * proj.dist) / (2 * sigma * sigma))
    const transition = seg.id === prevWinnerId ? 1 : 0

    const score = W_DIST * distScore + W_HEADING * headingScore + W_TRANSITION * transition

    return {
      segmentId: seg.id,
      name: seg.name,
      perpDist: proj.dist,
      headingDiff,
      score,
      p: 0,
      proj: proj.point,
    }
  })

  // Validation gate: discard implausibly distant candidates outright.
  const gated = scored.filter((h) => h.perpDist <= MAX_CANDIDATE_DIST)
  if (gated.length === 0) return []

  gated.sort((a, b) => b.score - a.score)
  const top = gated.slice(0, K)

  const total = top.reduce((a, h) => a + h.score, 0)
  if (total > 0) for (const h of top) h.p = h.score / total

  return top
}

/**
 * Correction to apply to the estimate. Proportional to the winner's
 * probability, and scaled by how much the filter's own cross-track uncertainty
 * exceeds the map's accuracy — when the filter is already confident, the map
 * has little to add.
 */
export function mapCorrection(
  pos: Vec2,
  hyps: Hypothesis[],
  sigmaCross: number
): Vec2 {
  if (hyps.length === 0) return { x: 0, y: 0 }

  const w = hyps[0]
  const varCross = sigmaCross * sigmaCross
  const varMap = MAP_SIGMA * MAP_SIGMA

  // Kalman-style weight: 0 when the filter is far better than the map, tending
  // to 1 when the filter is far worse. Never reaches 1 in practice.
  const trust = varCross / (varCross + varMap)

  const gain = MAX_PULL * w.p * trust

  return {
    x: (w.proj.x - pos.x) * gain,
    y: (w.proj.y - pos.y) * gain,
  }
}

export { MAP_SIGMA }
