'use client'

import { ROUTE_LENGTH } from '@/lib/sim/road'
import type { MissionStateMessage } from '@/lib/link/protocol'

/**
 * Where the drive is up to, and where the notable events happened along it.
 * Positioned by route progress, which comes from mission state.
 */
export interface TimelineMark {
  s: number
  label: string
  tone: string
}

export function MissionTimeline({
  m,
  marks,
}: {
  m: MissionStateMessage | null
  marks: TimelineMark[]
}) {
  if (!m) return null
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / ROUTE_LENGTH) * 100))}%`

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 178,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 5,
          background: 'rgba(11,20,32,0.9)',
          border: '1px solid var(--border)',
          borderRadius: 3,
        }}
      >
        {/* blackout stretch */}
        {m.blackoutStartS !== null && (
          <div
            style={{
              position: 'absolute',
              left: pct(m.blackoutStartS),
              width: `${Math.max(1, (((m.blackoutEndS ?? m.s) - m.blackoutStartS) / ROUTE_LENGTH) * 100)}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(239,68,68,0.5)',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: pct(m.s),
            background: 'rgba(56,189,248,0.35)',
          }}
        />
        {marks.map((k, i) => (
          <div
            key={`${k.label}-${i}`}
            style={{
              position: 'absolute',
              left: pct(k.s),
              top: -3,
              bottom: -3,
              width: 2,
              background: k.tone,
              borderRadius: 1,
            }}
          />
        ))}
        {/* current position */}
        <div
          style={{
            position: 'absolute',
            left: pct(m.s),
            top: -4,
            width: 8,
            height: 11,
            marginLeft: -4,
            background: 'var(--drishti)',
            borderRadius: 2,
            border: '1px solid #EAF6FF',
          }}
        />
      </div>
      <div style={{ position: 'relative', height: 10, marginTop: 2 }}>
        {marks.map((k, i) => (
          <span
            key={`l-${k.label}-${i}`}
            className="label"
            style={{
              position: 'absolute',
              left: pct(k.s),
              fontSize: 6.5,
              color: k.tone,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {k.label}
          </span>
        ))}
      </div>
    </div>
  )
}
