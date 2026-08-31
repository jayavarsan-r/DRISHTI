'use client'

import type { Snapshot } from '@/lib/sim/types'
import { Panel, Bar } from './Panel'

export function UncertaintyPanel({ snap }: { snap: Snapshot }) {
  const u = snap.uncertainty
  const ratio = u.sigmaCross > 0.01 ? u.sigmaAlong / u.sigmaCross : 0

  return (
    <Panel
      title="Uncertainty"
      provenance="Derived from filter covariance · Cross-track collapses on map match; along-track does not"
    >
      <Bar label="along" value={u.sigmaAlong} max={60} color="var(--drishti)" unit="m" />
      <Bar label="cross" value={u.sigmaCross} max={60} color="var(--accent)" unit="m" />
      <Bar
        label="heading"
        value={(u.sigmaPsi * 180) / Math.PI}
        max={15}
        color="var(--warn)"
        unit="°"
      />
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span className="label" style={{ fontSize: 9 }}>
          Axis ratio (along : cross)
        </span>
        <span
          className="mono"
          style={{ fontSize: 13, color: ratio > 2 ? 'var(--accent)' : 'var(--text-mid)' }}
        >
          {ratio.toFixed(2)} : 1
        </span>
      </div>
    </Panel>
  )
}
