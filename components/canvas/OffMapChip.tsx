'use client'

import type { Snapshot } from '@/lib/sim/types'

/**
 * When the naive estimate leaves the drawn area its polyline simply clips, and
 * a judge cannot tell whether it stopped or left. This chip says which.
 */
export function OffMapChip({ snap }: { snap: Snapshot }) {
  if (!snap.naiveOffMap) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        padding: '5px 10px',
        background: 'rgba(5,9,15,0.9)',
        border: '1px solid var(--naive)',
        borderRadius: 3,
        pointerEvents: 'none',
      }}
    >
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--naive)' }}>
        NAIVE INS · OFF-MAP · {snap.naiveError.toFixed(0)} m
      </span>
    </div>
  )
}
