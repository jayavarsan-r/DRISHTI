'use client'

import { useEffect, useRef, useState } from 'react'
import { curvatureAt, segmentAt, INTERSECTION_S, ROUTE_LENGTH } from '@/lib/sim/road'
import { mapTop } from './NavHud'
import type { MissionStateMessage } from '@/lib/link/protocol'

/**
 * Turn-by-turn guidance derived from the EXISTING route geometry.
 *
 * Read-only: this looks ahead along the same road module Mission Control uses
 * and reports what is coming. It computes no position and no trajectory of its
 * own — the vehicle's whereabouts always come from mission state.
 */

export interface Guidance {
  kind: 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'INTERSECTION' | 'ARRIVAL'
  /** metres until the manoeuvre */
  distance: number
  label: string
  road: string
}

/** Curvature past which a bend counts as a turn (radius under ~125 m). */
const TURN_K = 0.008
const LOOK_AHEAD = 320
const ARRIVAL_WITHIN = 90

export function guidanceAt(s: number): Guidance {
  const remaining = ROUTE_LENGTH - s

  if (remaining < ARRIVAL_WITHIN) {
    return { kind: 'ARRIVAL', distance: Math.max(0, remaining), label: 'Arriving at destination', road: 'ISTRAC APPROACH' }
  }

  // A stop line takes priority over a bend beyond it.
  const toIntersection = INTERSECTION_S - s
  if (toIntersection > 0 && toIntersection < 160) {
    return {
      kind: 'INTERSECTION',
      distance: toIntersection,
      label: 'Approaching intersection',
      road: segmentAt(Math.min(INTERSECTION_S + 5, ROUTE_LENGTH - 1)).name,
    }
  }

  for (let d = 8; d < LOOK_AHEAD; d += 4) {
    const at = s + d
    if (at >= ROUTE_LENGTH) break
    const k = curvatureAt(at)
    if (Math.abs(k) > TURN_K) {
      const left = k > 0
      return {
        kind: left ? 'LEFT' : 'RIGHT',
        distance: d,
        label: left ? 'Turn left' : 'Turn right',
        road: segmentAt(Math.min(at + 30, ROUTE_LENGTH - 1)).name,
      }
    }
  }

  return {
    kind: 'STRAIGHT',
    distance: Math.min(LOOK_AHEAD, remaining),
    label: 'Continue straight',
    road: segmentAt(Math.min(s, ROUTE_LENGTH - 1)).name,
  }
}

const GLYPH: Record<Guidance['kind'], string> = {
  STRAIGHT: '↑',
  LEFT: '↰',
  RIGHT: '↱',
  INTERSECTION: '⊣⊢',
  ARRIVAL: '◎',
}

const TONE: Record<Guidance['kind'], string> = {
  STRAIGHT: 'var(--text-mid)',
  LEFT: 'var(--accent)',
  RIGHT: 'var(--accent)',
  INTERSECTION: 'var(--warn)',
  ARRIVAL: 'var(--ok)',
}

/** Manoeuvre card. Hidden while merely continuing straight with nothing close. */
export function TurnCard({ m }: { m: MissionStateMessage | null }) {
  if (!m) return null
  const g = guidanceAt(m.s)
  if (g.kind === 'STRAIGHT' && g.distance > 200) return null

  const imminent = g.distance < 60

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 13px',
        background: 'rgba(11,20,32,0.93)',
        border: `1px solid ${imminent ? TONE[g.kind] : 'var(--border)'}`,
        borderRadius: 7,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 26, color: TONE[g.kind], lineHeight: 1, minWidth: 30, textAlign: 'center' }}
      >
        {GLYPH[g.kind]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 15, color: 'var(--text-hi)' }}>
          {g.kind === 'ARRIVAL' ? g.label : `${g.label} · ${g.distance.toFixed(0)} m`}
        </div>
        <div
          className="label"
          style={{ fontSize: 8.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {g.kind === 'ARRIVAL' ? 'Destination' : `then ${g.road}`}
        </div>
      </div>
      <span className="label" style={{ fontSize: 7, color: 'var(--warn)' }}>
        SIM
      </span>
    </div>
  )
}

const BANNER: Record<Guidance['kind'], string> = {
  STRAIGHT: 'CONTINUE STRAIGHT',
  LEFT: 'TURN LEFT',
  RIGHT: 'TURN RIGHT',
  INTERSECTION: 'APPROACHING INTERSECTION',
  ARRIVAL: 'ARRIVAL',
}

const BANNER_MS = 3200

/**
 * Transient announcement of a change in manoeuvre.
 *
 * Fires on the transition, not on a timer, and clears itself afterwards so the
 * map is not permanently carrying a caption. The manoeuvre is read from route
 * geometry at the position mission state reports — no path of its own.
 */
export function InstructionBanner({ m }: { m: MissionStateMessage | null }) {
  const [shown, setShown] = useState<Guidance['kind'] | null>(null)
  const prev = useRef<Guidance['kind'] | null>(null)

  const kind = m ? guidanceAt(m.s).kind : null
  /*
   * A reset rewinds route position, so the next manoeuvre would otherwise be
   * suppressed as "unchanged" for the whole of the second run.
   */
  const rewound = !!m && m.t < 0.4

  useEffect(() => {
    if (rewound) {
      prev.current = null
      setShown(null)
      return
    }
    if (!kind || kind === prev.current) return
    prev.current = kind
    setShown(kind)
    const id = setTimeout(() => setShown(null), BANNER_MS)
    return () => clearTimeout(id)
  }, [kind, rewound])

  if (!shown) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        top: mapTop(96),
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 13px',
        background: 'rgba(11,20,32,0.94)',
        border: `1px solid ${TONE[shown]}`,
        borderLeft: `3px solid ${TONE[shown]}`,
        borderRadius: 7,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        animation: 'drishti-rise 240ms ease-out',
      }}
    >
      <span className="mono" style={{ fontSize: 18, color: TONE[shown], lineHeight: 1 }}>
        {GLYPH[shown]}
      </span>
      <span
        className="mono"
        style={{ flex: 1, fontSize: 12.5, color: 'var(--text-hi)', letterSpacing: '0.06em' }}
      >
        {BANNER[shown]}
      </span>
      <span className="label" style={{ fontSize: 7, color: 'var(--warn)' }}>
        SIMULATED
      </span>
    </div>
  )
}
