'use client'

import { poseAt } from '@/lib/sim/road'
import type { Snapshot } from '@/lib/sim/types'

/**
 * Shades the stretch of road actually driven since GNSS was lost. The span is
 * tracked in arc length by the engine, so it survives pause, and it stays put
 * after recovery rather than following the vehicle.
 */
export function BlackoutZone({ snap }: { snap: Snapshot }) {
  const from = snap.blackoutStartS
  if (from === null) return null

  const to = snap.navState === 'DR_ACTIVE' ? snap.truth.s : (snap.blackoutEndS ?? snap.truth.s)
  if (to <= from) return null

  const pts: string[] = []
  for (let s = from; s <= to; s += 4) {
    const p = poseAt(s)
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }

  return (
    <polyline
      points={pts.join(' ')}
      fill="none"
      stroke="rgba(239,68,68,0.22)"
      strokeWidth={26}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  )
}
