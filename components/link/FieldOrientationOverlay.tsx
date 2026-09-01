'use client'

import { FieldCompass } from './FieldCompass'

/**
 * The demo moment: a judge rotates the phone and this moves.
 *
 * It lives on the canvas rather than in the rail so it is visible without
 * scrolling in presentation mode, and it is captioned REAL PHONE SENSOR beside
 * a SIMULATED VEHICLE trajectory so the two are never confused for each other.
 */
export function FieldOrientationOverlay({
  orientationRef,
  live,
  connected,
}: {
  orientationRef: React.RefObject<{ alpha: number; beta: number; gamma: number }>
  live: boolean
  connected: boolean
}) {
  if (!connected) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: 12,
        width: 186,
        padding: 10,
        background: 'rgba(5,9,15,0.86)',
        border: `1px solid ${live ? 'var(--border-hot)' : 'var(--border)'}`,
        borderRadius: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label" style={{ fontSize: 8.5 }}>
          Field orientation
        </span>
        <span
          className="mono"
          style={{ fontSize: 9, color: live ? 'var(--ok)' : 'var(--text-lo)' }}
        >
          ● {live ? 'LIVE' : 'IDLE'}
        </span>
      </div>

      <div style={{ marginTop: 6 }}>
        <FieldCompass orientationRef={orientationRef} live={live} size={150} />
      </div>

      <div
        className="provenance"
        style={{ marginTop: 7, color: 'var(--warn)', fontSize: 8.5, lineHeight: 1.4 }}
      >
        REAL phone sensor · the vehicle below is SIMULATED and its heading is
        unaffected by this
      </div>
    </div>
  )
}
