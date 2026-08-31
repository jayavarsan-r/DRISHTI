'use client'

import type { Snapshot } from '@/lib/sim/types'

function Verdict({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span className="label" style={{ fontSize: 9.5, color: 'var(--text-mid)' }}>
        {label}
      </span>
      <span
        className="mono"
        style={{ fontSize: 13, color: ok ? 'var(--ok)' : 'var(--danger)', lineHeight: 1 }}
      >
        {ok ? '✓' : '✕'}
      </span>
    </span>
  )
}

const STATE_TEXT: Record<string, string> = {
  BOOT: 'BOOT',
  ALIGNING: 'SOLVING MOUNT ROTATION',
  GNSS_ACTIVE: 'GNSS + DR FUSED',
  GNSS_DEGRADED: 'DEGRADED GEOMETRY',
  DR_ACTIVE: 'DR COASTING',
  REACQUIRING: 'BLENDING',
  MOUNT_CHANGE: 'RE-ALIGNING MOUNT',
}

/** For judges who do not read covariance. Every tick reads live state. */
export function DecisionStrip({ snap }: { snap: Snapshot }) {
  const trustImu = !snap.shockActive
  const trustMap = (snap.hypotheses[0]?.p ?? 0) > 0.5
  const trustGnss =
    snap.gnssMode !== 'DENIED' && (snap.lastIntegrity?.accepted ?? false)

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 14px',
        background: 'rgba(5,9,15,0.85)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <span className="label" style={{ fontSize: 9.5, color: 'var(--text-lo)' }}>
        DRISHTI decision
      </span>
      <Verdict label="Trust IMU" ok={trustImu} />
      <Verdict label="Trust map" ok={trustMap} />
      <Verdict label="Trust GNSS" ok={trustGnss} />
      <span style={{ flex: 1 }} />
      <span className="label" style={{ fontSize: 9.5 }}>
        State
      </span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
        {STATE_TEXT[snap.navState] ?? snap.navState}
      </span>
      {snap.navState === 'REACQUIRING' && (
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--accent)',
            border: '1px solid var(--border-hot)',
            borderRadius: 2,
            padding: '2px 7px',
          }}
        >
          BLENDING {(snap.blendProgress * 100).toFixed(0)}%
        </span>
      )}
    </div>
  )
}
