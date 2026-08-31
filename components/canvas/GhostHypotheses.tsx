'use client'

import { SEGMENTS } from '@/lib/sim/road'
import type { Snapshot } from '@/lib/sim/types'

/**
 * The 2nd and 3rd candidate roads, drawn while the match is genuinely
 * ambiguous. Beside the parallel service road these light up and a judge can
 * see the filter is entertaining more than one answer.
 */
export function GhostHypotheses({ snap }: { snap: Snapshot }) {
  const runners = snap.hypotheses.slice(1).filter((h) => h.p > 0.15)
  if (runners.length === 0) return null

  return (
    <g>
      {runners.map((h) => {
        const seg = SEGMENTS.find((s) => s.id === h.segmentId)
        if (!seg) return null
        return (
          <polyline
            key={h.segmentId}
            points={seg.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={7}
            strokeOpacity={0.3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </g>
  )
}
