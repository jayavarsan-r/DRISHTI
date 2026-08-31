'use client'

import type { Snapshot } from '@/lib/sim/types'

function mmss(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * The panel that makes "navigating 30 seconds without GNSS" land. Both figures
 * come from the engine's blackout tracking, not from a UI timer.
 */
export function BlackoutClock({ snap }: { snap: Snapshot }) {
  if (snap.navState !== 'DR_ACTIVE' || snap.blackoutStart === null) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        padding: '10px 22px',
        background: 'rgba(5,9,15,0.82)',
        border: '1px solid var(--danger)',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      <div
        className="label"
        style={{ color: 'var(--danger)', fontSize: 10, letterSpacing: '0.16em' }}
      >
        GNSS Denied
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
      <div className="mono" style={{ fontSize: 30, color: 'var(--danger)', lineHeight: 1.05 }}>
        {mmss(snap.blackoutElapsed)}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 3 }}>
        DISTANCE {snap.blackoutDistance.toFixed(0)} m
      </div>
    </div>
  )
}
