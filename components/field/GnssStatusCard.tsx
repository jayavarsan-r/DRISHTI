'use client'

import { useEffect, useRef, useState } from 'react'
import { INTERSECTION_S } from '@/lib/sim/road'
import type { MissionEventMessage, MissionStateMessage } from '@/lib/link/protocol'

/**
 * Narrates GNSS state changes as a short sequence rather than a single flip, so
 * a viewer sees what the system did and in what order. Every step is driven by
 * the incoming mission state; nothing here is on a timer of its own except the
 * pacing between captions of one transition.
 */

interface Step {
  text: string
  sub?: string
  tone: string
  hold: number
}

const SEQ: Record<string, Step[]> = {
  BLACKOUT: [
    { text: 'GNSS SIGNAL LOST', tone: 'var(--danger)', hold: 1800 },
    { text: 'DEAD RECKONING ACTIVE', sub: 'Navigation continues on onboard motion', tone: 'var(--drishti)', hold: 2600 },
  ],
  RECOVERY: [
    { text: 'GNSS RESTORED', tone: 'var(--ok)', hold: 1300 },
    { text: 'CHECKING FIX', sub: 'Integrity gate evaluating', tone: 'var(--warn)', hold: 1300 },
    { text: 'FUSION', sub: 'Blending without position jump', tone: 'var(--accent)', hold: 1500 },
    { text: 'GNSS ACTIVE', tone: 'var(--ok)', hold: 1800 },
  ],
  SPOOF: [
    { text: 'GNSS ANOMALY', sub: 'Checking signal…', tone: 'var(--warn)', hold: 1500 },
    { text: 'GNSS FIX REJECTED', sub: 'Dead reckoning continuing', tone: 'var(--danger)', hold: 2600 },
  ],
  SHOCK: [
    { text: 'SHOCK DETECTED', sub: 'Motion model down-weighted', tone: 'var(--warn)', hold: 2400 },
  ],
  MOUNT: [
    { text: 'MOUNT CHANGE', sub: 'Re-aligning field unit', tone: 'var(--warn)', hold: 2200 },
    { text: 'ALIGNMENT RESTORED', tone: 'var(--ok)', hold: 1600 },
  ],
  STOPPED: [{ text: 'STOPPED', tone: 'var(--text-mid)', hold: 2200 }],
}

export function GnssStatusCard({
  m,
  event,
}: {
  m: MissionStateMessage | null
  /** Latest discrete engine event; the only source for shock, which has no state field. */
  event: MissionEventMessage | null
}) {
  const [seq, setSeq] = useState<{ key: string; i: number; sub?: string } | null>(null)
  const prev = useRef<{ gnss: string; nav: string; stopped: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /*
   * A stop is only worth announcing if the vehicle had actually been driving.
   * Without this the card fires at t=0, when the vehicle has simply not moved
   * yet, and then sits there reading STOPPED while the speed climbs past it.
   */
  const hasMoved = useRef(false)

  // Watch for transitions in the authoritative state and start the matching run.
  useEffect(() => {
    if (!m) return
    if (m.veh.v > 3) hasMoved.current = true
    const stopped = m.veh.v < 0.15 && m.running && hasMoved.current
    const p = prev.current
    prev.current = { gnss: m.gnssMode, nav: m.navState, stopped }
    if (!p) return

    let key: string | null = null
    let sub: string | undefined
    if (p.gnss !== 'DENIED' && m.gnssMode === 'DENIED') key = 'BLACKOUT'
    else if (m.gnssMode === 'SPOOFED' && p.gnss !== 'SPOOFED') key = 'SPOOF'
    else if (p.nav === 'REACQUIRING' && m.navState === 'GNSS_ACTIVE') key = 'RECOVERY'
    else if (p.nav !== 'MOUNT_CHANGE' && m.navState === 'MOUNT_CHANGE') key = 'MOUNT'
    else if (!p.stopped && stopped) {
      key = 'STOPPED'
      /*
       * A zero-velocity update is only meaningful where the vehicle is
       * actually held at a stop line; claiming one for any halt would be
       * describing a mechanism the run did not exercise.
       */
      if (Math.abs(m.s - INTERSECTION_S) < 25) sub = 'Zero velocity update · SIMULATED'
      hasMoved.current = false
    }

    if (key) setSeq({ key, i: 0, sub })
  }, [m])

  /*
   * Shock is a 0.18 s impulse inside the engine with no field of its own on the
   * state message, so the discrete event is the honest source for it.
   */
  const lastEvent = useRef<number | null>(null)
  useEffect(() => {
    if (!event || event.id === lastEvent.current) return
    lastEvent.current = event.id
    if (event.event.toUpperCase().includes('SHOCK')) setSeq({ key: 'SHOCK', i: 0 })
  }, [event])

  // Advance through the captions of the active sequence.
  useEffect(() => {
    if (!seq) return
    const steps = SEQ[seq.key]
    const step = steps[seq.i]
    if (!step) {
      setSeq(null)
      return
    }
    timer.current = setTimeout(() => {
      setSeq((s) => (s && s.key === seq.key ? { ...s, i: s.i + 1 } : s))
    }, step.hold)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [seq])

  if (!seq) return null
  const step = SEQ[seq.key]?.[seq.i]
  if (!step) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 256,
        padding: '11px 14px',
        background: 'rgba(11,20,32,0.95)',
        border: `1px solid ${step.tone}`,
        borderLeft: `3px solid ${step.tone}`,
        borderRadius: 6,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        animation: 'drishti-rise 260ms ease-out',
      }}
    >
      <div className="mono" style={{ fontSize: 14, color: step.tone, letterSpacing: '0.05em' }}>
        {step.text}
      </div>
      {(seq.i === 0 ? seq.sub ?? step.sub : step.sub) && (
        <div className="label" style={{ fontSize: 9, marginTop: 3 }}>
          {seq.i === 0 ? seq.sub ?? step.sub : step.sub}
        </div>
      )}
    </div>
  )
}
