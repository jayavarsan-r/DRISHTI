/**
 * Rendering bridge — converts simulation snapshots into drawable geometry
 * without importing lib/sim inside NavigationMap.
 */

import { poseAt, SEGMENTS } from '@/lib/sim/road'
import type { Snapshot } from '@/lib/sim/types'

export interface ArcSpan {
  fromS: number
  toS: number
}

/** Blackout arc length is already metres, matching poseAt(s) and route world coordinates. */
export function resolveBlackoutSpan(snap: Snapshot): ArcSpan | null {
  const fromS = snap.blackoutStartS
  if (fromS === null) return null

  const toS =
    snap.navState === 'DR_ACTIVE' ? snap.truth.s : (snap.blackoutEndS ?? snap.truth.s)
  if (toS <= fromS) return null
  return { fromS, toS }
}

export function sampleArcSpan(
  span: ArcSpan,
  step = 4
): { x: number; y: number; psi: number; s: number }[] {
  const points: { x: number; y: number; psi: number; s: number }[] = []
  for (let s = span.fromS; s < span.toS; s += step) {
    const p = poseAt(s)
    points.push({ x: p.x, y: p.y, psi: p.psi, s })
  }
  const end = poseAt(span.toS)
  points.push({ x: end.x, y: end.y, psi: end.psi, s: span.toS })
  return points
}

export function buildBlackoutPoints(snap: Snapshot, step = 4): { x: number; y: number }[] {
  const span = resolveBlackoutSpan(snap)
  if (!span) return []
  return sampleArcSpan(span, step).map(({ x, y }) => ({ x, y }))
}

export interface GhostSegment {
  segmentId: string
  points: { x: number; y: number }[]
  opacity: number
}

export function buildGhostSegments(snap: Snapshot): GhostSegment[] {
  const runners = snap.hypotheses.slice(1).filter((h) => h.p > 0.15)
  return runners
    .map((h) => {
      const seg = SEGMENTS.find((s) => s.id === h.segmentId)
      if (!seg) return null
      return {
        segmentId: h.segmentId,
        points: seg.points.map((p) => ({ x: p.x, y: p.y })),
        opacity: 0.3,
      }
    })
    .filter((g): g is GhostSegment => g !== null)
}
