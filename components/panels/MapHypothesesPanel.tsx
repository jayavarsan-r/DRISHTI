'use client'

import type { Snapshot } from '@/lib/sim/types'
import { Panel } from './Panel'

/**
 * The parallel service road is what makes this panel produce a genuine split
 * rather than a decorative one — beside it, the runner-up is a real contender.
 */
export function MapHypothesesPanel({ snap }: { snap: Snapshot }) {
  return (
    <Panel
      title="Map hypotheses"
      provenance="Top-3 by distance, heading agreement and transition plausibility · correction is proportional, never a snap"
    >
      {snap.hypotheses.length === 0 && (
        <span className="provenance">No candidate road within the validation gate</span>
      )}
      {snap.hypotheses.map((h, i) => (
        <div key={h.segmentId} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span
              className="mono"
              style={{ fontSize: 9.5, color: i === 0 ? 'var(--text-hi)' : 'var(--text-mid)' }}
            >
              {h.name}
            </span>
            <span
              className="mono"
              style={{ fontSize: 10.5, color: i === 0 ? 'var(--accent)' : 'var(--text-mid)' }}
            >
              {(h.p * 100).toFixed(1)}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              marginTop: 3,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${h.p * 100}%`,
                height: '100%',
                background: i === 0 ? 'var(--accent)' : 'var(--border-hot)',
                transition: 'width 140ms ease',
              }}
            />
          </div>
          <div className="provenance" style={{ marginTop: 2 }}>
            perp {h.perpDist.toFixed(1)} m · Δheading {((h.headingDiff * 180) / Math.PI).toFixed(0)}°
          </div>
        </div>
      ))}
    </Panel>
  )
}
