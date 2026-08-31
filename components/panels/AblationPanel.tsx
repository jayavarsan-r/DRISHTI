'use client'

import type { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'
import { Panel } from './Panel'

const ITEMS: { key: 'aiSpeed' | 'nhc' | 'map'; label: string; effect: string }[] = [
  {
    key: 'aiSpeed',
    label: 'AI Speed',
    effect: 'Falls back to integrated acceleration — becomes the ESKF baseline',
  },
  { key: 'nhc', label: 'NHC', effect: 'Lateral velocity no longer forced to zero' },
  { key: 'map', label: 'Map', effect: 'No cross-track collapse — ellipse fattens sideways' },
]

/**
 * These toggles change which terms run inside the estimator, not what is drawn.
 * With AI Speed off, DRISHTI is bit-identical to the ESKF baseline, because the
 * speed model is the only difference between them.
 */
export function AblationPanel({ engine, snap }: { engine: Engine; snap: Snapshot }) {
  return (
    <Panel
      title="Why does DRISHTI work?"
      provenance="Disable a component to see its contribution · toggles alter the estimator, not the display"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {ITEMS.map((it) => {
          const on = snap.ablation[it.key]
          return (
            <div key={it.key}>
              <button
                onClick={() => engine.setAblation({ [it.key]: !on })}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 9px',
                  background: on ? 'var(--bg-raised)' : 'transparent',
                  border: `1px solid ${on ? 'var(--border-hot)' : 'var(--border)'}`,
                  borderRadius: 3,
                  color: on ? 'var(--text-hi)' : 'var(--text-lo)',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: on ? 'var(--ok)' : 'var(--danger)',
                    flex: '0 0 auto',
                  }}
                />
                <span className="label" style={{ fontSize: 10, color: 'inherit' }}>
                  {it.label}
                </span>
                <span style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 9.5 }}>
                  {on ? 'ON' : 'OFF'}
                </span>
              </button>
              {!on && (
                <div className="provenance" style={{ marginTop: 3, color: 'var(--warn)' }}>
                  {it.effect}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span className="label" style={{ fontSize: 9 }}>
          DRISHTI vs baseline
        </span>
        <span className="mono" style={{ fontSize: 10.5 }}>
          {snap.drishtiError.toFixed(1)} m / {snap.eskfError.toFixed(1)} m
        </span>
      </div>
    </Panel>
  )
}
