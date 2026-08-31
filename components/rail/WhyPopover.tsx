'use client'

import { CHI2_2DOF_99 } from '@/lib/sim/constants'
import type { Snapshot } from '@/lib/sim/types'

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span className="label" style={{ fontSize: 9 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: color ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}

function Shell({
  title,
  onClose,
  children,
  decision,
  decisionColor,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  decision: string
  decisionColor: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 40,
        right: 0,
        top: 24,
        width: 268,
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-hot)',
        borderRadius: 4,
        padding: 12,
        boxShadow: '0 8px 26px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="panel-title" style={{ fontSize: 10.5 }}>
          {title}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-mid)', fontSize: 13 }}
        >
          ✕
        </button>
      </div>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
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
          Decision
        </span>
        <span className="mono" style={{ fontSize: 11, color: decisionColor }}>
          {decision}
        </span>
      </div>
    </div>
  )
}

/** Every value is read from live state. There are exactly two of these. */
export function WhyModePopover({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const dr = snap.navState === 'DR_ACTIVE'
  return (
    <Shell
      title={dr ? 'Why is DR active?' : `Why is the mode ${snap.navState}?`}
      onClose={onClose}
      decision={dr ? 'INERTIAL NAV' : 'FUSED NAV'}
      decisionColor={dr ? 'var(--drishti)' : 'var(--ok)'}
    >
      <Row
        k="GNSS fixes, last 3.0 s"
        v={String(snap.fixesLast3s)}
        color={snap.fixesLast3s === 0 ? 'var(--danger)' : 'var(--ok)'}
      />
      <Row
        k="IMU health"
        v={snap.shockActive ? 'SHOCK' : '✓'}
        color={snap.shockActive ? 'var(--warn)' : 'var(--ok)'}
      />
      <Row k="Speed model confidence" v={`${(snap.speed.confidence * 100).toFixed(0)}%`} />
      <Row k="Map hypotheses" v={String(snap.hypotheses.length)} />
      <Row
        k="Filter"
        v={snap.uncertainty.sigmaCross < 30 ? 'Stable' : 'Inflating'}
        color={snap.uncertainty.sigmaCross < 30 ? 'var(--ok)' : 'var(--warn)'}
      />
    </Shell>
  )
}

export function WhyRejectedPopover({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const ig = snap.lastIntegrity
  if (!ig) return null
  return (
    <Shell
      title="Why was the fix rejected?"
      onClose={onClose}
      decision={ig.accepted ? 'ACCEPT' : 'REJECT'}
      decisionColor={ig.accepted ? 'var(--ok)' : 'var(--danger)'}
    >
      <Row k="Predicted" v={`${snap.drishti.x.toFixed(0)}, ${snap.drishti.y.toFixed(0)}`} />
      <Row
        k="GNSS"
        v={`${(snap.drishti.x + ig.innovation.x).toFixed(0)}, ${(snap.drishti.y + ig.innovation.y).toFixed(0)}`}
      />
      <Row k="Innovation" v={`${ig.innovationMag.toFixed(1)} m`} />
      <Row
        k="NIS"
        v={ig.nis.toFixed(1)}
        color={ig.accepted ? 'var(--ok)' : 'var(--danger)'}
      />
      <Row k="Threshold (χ², 2 DoF)" v={CHI2_2DOF_99.toFixed(2)} />
    </Shell>
  )
}
