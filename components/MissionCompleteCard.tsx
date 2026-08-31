'use client'

import { JUDGE_SCRIPT } from '@/lib/sim/scenario'
import type { Snapshot } from '@/lib/sim/types'

function mmss(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t - m * 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 28,
        padding: '5px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span className="label" style={{ fontSize: 9.5 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 12.5, color: accent ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}

/** Every figure is computed. Nothing on this card is authored. */
export function MissionCompleteCard({
  snap,
  onClose,
}: {
  snap: Snapshot
  onClose: () => void
}) {
  const boFrom = JUDGE_SCRIPT.find((e) => e.kind === 'GNSS_DENIED')?.t ?? 0
  const boTo = JUDGE_SCRIPT.find((e) => e.kind === 'GNSS_RESTORE')?.t ?? 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(5,9,15,0.72)',
        zIndex: 60,
      }}
    >
      <div
        className="panel panel-hot"
        style={{ width: 520, background: 'var(--bg-panel)', padding: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="panel-title" style={{ fontSize: 15, letterSpacing: '0.1em' }}>
            Mission complete
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--warn)' }}>
            SIMULATED RUN · SEED {snap.seed}
          </span>
        </div>

        <div style={{ marginTop: 14 }}>
          <Row k="Blackout" v={`${mmss(boFrom)} → ${mmss(boTo)}`} />
          <Row k="Distance travelled" v={`${snap.distance.toFixed(0)} m`} />
          <Row
            k="DRISHTI final error"
            v={`${snap.drishtiError.toFixed(1)} m  (${(snap.errorFraction * 100).toFixed(2)} %)`}
            accent="var(--drishti)"
          />
          <Row k="Baseline (ESKF+NHC) error" v={`${snap.eskfError.toFixed(1)} m`} />
          <Row k="Naive INS final error" v={`${snap.naiveError.toFixed(0)} m`} accent="var(--naive)" />
          <Row k="GNSS anomalies" v={String(snap.anomalyCount)} />
          <Row k="Rejected fixes" v={String(snap.rejectedCount)} accent="var(--danger)" />
          <Row
            k="Recovery time"
            v={snap.recoveryTime === null ? '—' : `${snap.recoveryTime.toFixed(2)} s`}
          />
        </div>

        <div className="provenance" style={{ marginTop: 14, textAlign: 'center' }}>
          Synthetic IMU · demonstration only · not a measured benchmark
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 14,
            width: '100%',
            padding: '9px 0',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-hot)',
            borderRadius: 3,
            color: 'var(--accent)',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
