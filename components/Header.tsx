'use client'

/**
 * Header (56px) carrying the non-negotiable RUNTIME provenance block.
 *
 * Constraint 1: the RUNTIME block is never hidden and never dismissible.
 * Constraint 3: DATA SOURCE offers three options, two of them disabled with
 *               RESULTS PENDING — DATASET INGESTION.
 */

export interface HeaderProps {
  /** Simulation time in seconds. */
  t: number
  /** Physics rate actually being stepped. */
  rateHz: number
  /** True while the engine is stepping. */
  running: boolean
  /** Flashes once on entry to DR_ACTIVE. */
  flashing: boolean
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `T+${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

export function Header({ t, rateHz, running, flashing }: HeaderProps) {
  return (
    <header
      className={flashing ? 'flash-danger' : undefined}
      style={{
        flex: '0 0 auto',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
      }}
    >
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'var(--text-hi)',
          }}
        >
          DRISHTI
        </span>
        <span style={{ color: 'var(--border-hot)' }}>▏</span>
        <span className="label" style={{ fontSize: 10.5 }}>
          Intelligent Dead Reckoning
        </span>
      </div>

      <div className="label" style={{ color: 'var(--text-lo)', fontSize: 9.5 }}>
        SIH26168 · ISRO
      </div>

      {/* Data source — constraint 3 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="label" style={{ fontSize: 9 }}>
          Data source
        </span>
        <select
          defaultValue="synthetic"
          className="mono"
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text-hi)',
            fontSize: 10.5,
            padding: '3px 6px',
            letterSpacing: '0.04em',
          }}
        >
          <option value="synthetic">SYNTHETIC SIMULATOR</option>
          <option value="iovnbd" disabled title="RESULTS PENDING — DATASET INGESTION">
            IO-VNBD REPLAY — RESULTS PENDING
          </option>
          <option value="field" disabled title="RESULTS PENDING — DATASET INGESTION">
            FIELD REPLAY — RESULTS PENDING
          </option>
        </select>
      </label>

      <div style={{ flex: 1 }} />

      {/* Clock + rate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="mono" style={{ fontSize: 15, color: 'var(--text-hi)' }}>
          {formatClock(t)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: running ? 'var(--ok)' : 'var(--text-lo)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          {rateHz.toFixed(1)} Hz
        </span>
      </div>

      {/* RUNTIME provenance — constraint 1, never hidden */}
      <div
        style={{
          borderLeft: '1px solid var(--border)',
          paddingLeft: 14,
          minWidth: 210,
          lineHeight: 1.25,
        }}
      >
        <div className="label" style={{ fontSize: 8.5, color: 'var(--text-lo)' }}>
          Runtime
        </div>
        <div
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--warn)', letterSpacing: '0.03em' }}
        >
          SIMULATION · SYNTHETIC IMU
        </div>
        <div className="label" style={{ fontSize: 8.5, color: 'var(--text-lo)', marginTop: 2 }}>
          Target runtime
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-lo)' }}>
          Android on-device / edge C++
        </div>
      </div>
    </header>
  )
}
