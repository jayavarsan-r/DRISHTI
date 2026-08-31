'use client'

import { PHYSICS_HZ } from '@/lib/sim/constants'
import type { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'
import { Panel } from './Panel'

/**
 * ARCHITECTURAL DEMONSTRATION.
 *
 * Changing the rate changes the physics step, so it changes the run — it is not
 * part of the seeded judge demo and the caption says so.
 */
export function EdgeEnginePanel({ engine, snap }: { engine: Engine; snap: Snapshot }) {
  return (
    <Panel
      title="Edge engine — architectural demonstration"
      provenance="Alters the physics step, so it alters the run · not part of the seeded judge demo"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="label" style={{ fontSize: 9 }}>
          Integration rate
        </span>
        <span className="mono" style={{ fontSize: 17 }}>
          {snap.rateHz.toFixed(0)}
          <span style={{ fontSize: 10, color: 'var(--text-mid)' }}> Hz</span>
        </span>
      </div>
      <input
        type="range"
        min={10}
        max={200}
        step={10}
        value={snap.rateHz}
        onChange={(e) => engine.setRateHz(Number(e.target.value))}
        style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent)' }}
      />
      <div
        className="label"
        style={{ fontSize: 8, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}
      >
        <span>10 Hz</span>
        <span>default {PHYSICS_HZ} Hz</span>
        <span>200 Hz</span>
      </div>
    </Panel>
  )
}
