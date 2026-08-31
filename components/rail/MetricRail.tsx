'use client'

import { TARGET_ERROR_FRACTION } from '@/lib/sim/constants'
import type { NavState, Snapshot } from '@/lib/sim/types'
import type { UiMode } from '../AppShell'

const STATE_LABEL: Record<NavState, string> = {
  BOOT: 'BOOT',
  ALIGNING: 'ALIGNING',
  GNSS_ACTIVE: 'GNSS + DR',
  GNSS_DEGRADED: 'DEGRADED',
  DR_ACTIVE: 'DR ACTIVE',
  REACQUIRING: 'REACQUIRING',
  MOUNT_CHANGE: 'RE-ALIGNING',
}

const STATE_COLOR: Record<NavState, string> = {
  BOOT: 'var(--text-mid)',
  ALIGNING: 'var(--warn)',
  GNSS_ACTIVE: 'var(--ok)',
  GNSS_DEGRADED: 'var(--warn)',
  DR_ACTIVE: 'var(--drishti)',
  REACQUIRING: 'var(--accent)',
  MOUNT_CHANGE: 'var(--warn)',
}

const GNSS_COLOR: Record<string, string> = {
  NOMINAL: 'var(--ok)',
  DEGRADED: 'var(--warn)',
  DENIED: 'var(--danger)',
  SPOOFED: 'var(--danger)',
}

function Metric({
  label,
  provenance,
  children,
  size,
  why,
}: {
  label: string
  provenance: string
  children: React.ReactNode
  size: number
  why?: React.ReactNode
}) {
  return (
    <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="label">{label}</span>
        {why}
      </div>
      <div className="mono" style={{ fontSize: size, lineHeight: 1.15, marginTop: 3 }}>
        {children}
      </div>
      <div className="provenance" style={{ marginTop: 3 }}>
        {provenance}
      </div>
    </div>
  )
}

/**
 * Six values in presentation mode. ERROR / DISTANCE carries the most visual
 * weight because it is the ISRO metric.
 */
export function MetricRail({
  snap,
  uiMode,
  scale = 1,
  whyMode,
}: {
  snap: Snapshot
  uiMode: UiMode
  scale?: number
  whyMode?: React.ReactNode
}) {
  const big = (uiMode === 'presentation' ? 34 : 24) * scale
  const mid = (uiMode === 'presentation' ? 26 : 20) * scale

  const pct = snap.errorFraction * 100
  const overTarget = snap.errorFraction > TARGET_ERROR_FRACTION

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Metric label="Mode" provenance="Filter state machine" size={big} why={whyMode}>
        <span style={{ color: STATE_COLOR[snap.navState] }}>{STATE_LABEL[snap.navState]}</span>
      </Metric>

      <Metric
        label="Error / distance"
        provenance="DRISHTI error over distance travelled"
        size={big}
      >
        <span style={{ color: overTarget ? 'var(--warn)' : 'var(--text-hi)' }}>
          {pct.toFixed(2)}
          <span style={{ fontSize: big * 0.5, color: 'var(--text-mid)' }}> %</span>
        </span>
        <TargetBar fraction={snap.errorFraction} />
      </Metric>

      <Metric
        label="Speed"
        provenance="SPEED MODEL (SIMULATED) · per-window estimate"
        size={mid}
      >
        {(snap.speed.vHat * 3.6).toFixed(1)}
        <span style={{ fontSize: mid * 0.5, color: 'var(--text-mid)' }}> km/h</span>
      </Metric>

      <Metric
        label="Confidence"
        provenance="Derived from speed model sigma"
        size={mid}
      >
        <ConfidenceBar value={snap.speed.confidence} />
      </Metric>

      <Metric
        label="Uncertainty"
        provenance="Derived from filter covariance"
        size={mid}
      >
        {Math.hypot(snap.uncertainty.sigmaAlong, snap.uncertainty.sigmaCross).toFixed(1)}
        <span style={{ fontSize: mid * 0.5, color: 'var(--text-mid)' }}> m</span>
      </Metric>

      <Metric label="GNSS" provenance="Synthetic constellation, 1 Hz" size={mid}>
        <span style={{ color: GNSS_COLOR[snap.gnssMode] ?? 'var(--text-hi)' }}>
          {snap.gnssMode}
        </span>
      </Metric>
    </div>
  )
}

/**
 * The bar is NOT clamped. If a run exceeds TARGET the fill runs past the marker
 * and turns amber — hiding that would be the one dishonest thing this panel
 * could do.
 */
function TargetBar({ fraction }: { fraction: number }) {
  const full = TARGET_ERROR_FRACTION * 2 // TARGET sits at the midpoint
  const pos = Math.min(1, fraction / full)
  const over = fraction > TARGET_ERROR_FRACTION

  return (
    <div style={{ marginTop: 7 }}>
      <div
        style={{
          position: 'relative',
          height: 6,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${pos * 100}%`,
            background: over ? 'var(--warn)' : 'var(--drishti)',
            borderRadius: 1,
            transition: 'width 120ms linear',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -3,
            bottom: -3,
            width: 1,
            background: 'var(--text-mid)',
          }}
        />
      </div>
      <div
        className="label"
        style={{ fontSize: 8.5, marginTop: 3, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>0</span>
        <span style={{ color: 'var(--text-mid)' }}>
          TARGET {(TARGET_ERROR_FRACTION * 100).toFixed(0)}%
        </span>
        <span>{(full * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const cells = 10
  const on = Math.round(value * cells)
  const color = value > 0.6 ? 'var(--ok)' : value > 0.35 ? 'var(--warn)' : 'var(--danger)'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 15,
              background: i < on ? color : 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 1,
            }}
          />
        ))}
      </span>
      <span>{(value * 100).toFixed(0)}%</span>
    </span>
  )
}
