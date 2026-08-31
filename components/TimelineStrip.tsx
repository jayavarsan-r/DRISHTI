'use client'

import { JUDGE_SCRIPT } from '@/lib/sim/scenario'
import type { Snapshot } from '@/lib/sim/types'

/**
 * The scenario rail. Fills as sim time advances, with the blackout span shaded
 * and the scripted beats marked. Everything positions off snapshot.duration, so
 * the strip spans the real route length rather than an assumed 60 s.
 */
export function TimelineStrip({ snap }: { snap: Snapshot }) {
  const dur = snap.duration || 1
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / dur) * 100))}%`

  const boStart = snap.blackoutStart
  const restore = JUDGE_SCRIPT.find((e) => e.kind === 'GNSS_RESTORE')?.t ?? null
  const boFrom = JUDGE_SCRIPT.find((e) => e.kind === 'GNSS_DENIED')?.t ?? null
  const inDr = snap.navState === 'DR_ACTIVE'
  const boEnd = inDr ? snap.t : restore

  return (
    <div
      style={{
        flex: '0 0 auto',
        height: 34,
        position: 'relative',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 10,
          flex: 1,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {/* blackout span */}
        {boFrom !== null && boEnd !== null && (
          <div
            style={{
              position: 'absolute',
              left: pct(boFrom),
              width: `${Math.max(0, ((boEnd - boFrom) / dur) * 100)}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(239,68,68,0.22)',
              borderLeft: '1px dashed var(--danger)',
              borderRight: boStart === null ? '1px dashed var(--danger)' : 'none',
            }}
          />
        )}

        {/* progress */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: pct(snap.t),
            background: 'rgba(56,189,248,0.20)',
            borderRight: '1px solid var(--drishti)',
          }}
        />

        {/* scripted beats */}
        {JUDGE_SCRIPT.filter((e) => e.tick).map((e) => (
          <div
            key={e.kind}
            style={{ position: 'absolute', left: pct(e.t), top: 0, bottom: 0, width: 1, background: 'var(--text-mid)' }}
          />
        ))}
      </div>

      {/*
        Beat labels stagger across two rows. BLACKOUT and POTHOLE are three
        seconds apart, which at this scale is narrower than either word.
      */}
      <div style={{ position: 'absolute', left: 16, right: 16, top: 0, height: '100%', pointerEvents: 'none' }}>
        {JUDGE_SCRIPT.filter((e) => e.tick).map((e, i) => (
          <span
            key={e.kind}
            className="label"
            style={{
              position: 'absolute',
              left: pct(e.t),
              top: i % 2 === 0 ? 1 : 9,
              fontSize: 7.5,
              color: snap.t >= e.t ? 'var(--text-mid)' : 'var(--text-lo)',
              transform: 'translateX(3px)',
              whiteSpace: 'nowrap',
            }}
          >
            {e.label}
          </span>
        ))}
      </div>
    </div>
  )
}
