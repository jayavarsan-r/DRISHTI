'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'
import { useLink } from './useLink'
import type { CommandName, LinkMessage, MissionPhase, SensorMessage } from './protocol'

/** Maps the engine's filter state onto the mission phase the phone displays. */
function phaseOf(s: Snapshot): MissionPhase {
  if (s.finished) return 'COMPLETE'
  if (!s.running && s.t === 0) return 'STANDBY'
  switch (s.navState) {
    case 'ALIGNING':
      return 'ALIGNING'
    case 'DR_ACTIVE':
      return 'DR COASTING'
    case 'REACQUIRING':
      return 'RECOVERY'
    case 'MOUNT_CHANGE':
      return 'REALIGNING'
    case 'GNSS_DEGRADED':
      return 'GNSS DEGRADED'
    default:
      return 'NORMAL NAVIGATION'
  }
}

export interface FieldTelemetry {
  nodeId: string
  sensorHz: number
  sensorsLive: boolean
  sequence: number
  accel: { x: number; y: number; z: number }
  gyro: { x: number; y: number; z: number }
  orientation: { alpha: number; beta: number; gamma: number }
  /** derived from real accelerometer values — phone motion, not vehicle dynamics */
  motionEnergy: number
  lastPacketAt: number
}

/**
 * Mission Control side of the field link.
 *
 * Commands from the phone are dispatched into the EXISTING engine — no
 * simulation logic is duplicated here. Phone orientation is stored for
 * visualisation only and is never handed to the estimator: the vehicle's
 * heading remains entirely the simulation's own.
 */
export function useMissionLink({
  engine,
  snap,
  onCommand,
}: {
  engine: Engine
  snap: Snapshot
  onCommand?: (c: CommandName) => void
}) {
  const [telemetry, setTelemetry] = useState<FieldTelemetry | null>(null)
  const [lastCommand, setLastCommand] = useState<{ cmd: CommandName; at: number } | null>(null)

  /** Written on every packet; read by the compass in its animation frame. */
  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0 })
  const pending = useRef<SensorMessage | null>(null)
  const onCommandRef = useRef(onCommand)
  onCommandRef.current = onCommand

  const dispatch = useCallback(
    (cmd: CommandName): { accepted: boolean; reason?: string } => {
      switch (cmd) {
        case 'START_MISSION':
          engine.runJudgeDemo()
          return { accepted: true }
        case 'PAUSE_MISSION':
          engine.pause()
          return { accepted: true }
        case 'RESET_MISSION':
          engine.reset()
          return { accepted: true }
        case 'GNSS_ACTIVE':
        case 'GNSS_RECOVERY':
          engine.setGnssMode('NOMINAL')
          return { accepted: true }
        case 'GNSS_DEGRADED':
          engine.setGnssMode('DEGRADED')
          return { accepted: true }
        case 'GNSS_DENIED':
          engine.setGnssMode('DENIED')
          return { accepted: true }
        case 'GNSS_SPOOFED':
          engine.setGnssMode('SPOOFED')
          return { accepted: true }
        case 'POTHOLE':
          engine.firePothole()
          return { accepted: true }
        case 'PHONE_SLIP':
          engine.firePhoneSlip()
          return { accepted: true }
        default:
          return { accepted: false, reason: 'Unknown command' }
      }
    },
    [engine]
  )

  const onMessage = useCallback(
    (m: LinkMessage) => {
      if (m.type === 'sensor') {
        // Buffer only; the throttled effect below turns this into state.
        pending.current = m
        orientationRef.current = m.latest.orientation
        return
      }
      if (m.type === 'command') {
        const res = dispatch(m.command)
        setLastCommand({ cmd: m.command, at: Date.now() })
        onCommandRef.current?.(m.command)
        sendRef.current?.({
          type: 'command_ack',
          command: m.command,
          timestamp: m.timestamp,
          accepted: res.accepted,
          reason: res.reason,
        })
      }
    },
    [dispatch, engine]
  )

  const { stats, send } = useLink({ role: 'control', nodeId: 'MISSION-CONTROL', onMessage })
  const sendRef = useRef(send)
  sendRef.current = send

  // Sensor packets arrive at ~20 Hz; render the numeric panel at 10 Hz.
  useEffect(() => {
    const id = setInterval(() => {
      const m = pending.current
      if (!m) return
      /*
       * Same guard as the field unit: |a| - g only means anything when gravity
       * is actually in the reading. Without it, a phone reporting zeros pegs
       * the meter at maximum while sending no real data.
       */
      const g = 9.81
      const usable = m.sensorsLive
        ? m.batch.filter((s) => Math.hypot(s.accel.x, s.accel.y, s.accel.z) > 1)
        : []
      const energy =
        usable.length > 0
          ? Math.min(
              1,
              usable.reduce(
                (a, s) => a + Math.abs(Math.hypot(s.accel.x, s.accel.y, s.accel.z) - g),
                0
              ) /
                usable.length /
                6
            )
          : 0
      setTelemetry({
        nodeId: m.nodeId,
        sensorHz: m.sensorHz,
        sensorsLive: m.sensorsLive,
        sequence: m.sequence,
        accel: m.latest.accel,
        gyro: m.latest.gyro,
        orientation: m.latest.orientation,
        motionEnergy: energy,
        lastPacketAt: Date.now(),
      })
    }, 100)
    return () => clearInterval(id)
  }, [])

  /**
   * Stream the authoritative mission state to the phone at 20 Hz, and emit
   * discrete events exactly once each. The phone interpolates between these
   * states; it never simulates.
   */
  const lastEventId = useRef<number>(-1)
  useEffect(() => {
    if (stats.state !== 'CONNECTED') return

    const id = setInterval(() => {
      const s = snapRef.current
      send({
        type: 'mission',
        t: s.t,
        running: s.running,
        finished: s.finished,
        phase: phaseOf(s),
        navState: s.navState,
        gnssMode: s.gnssMode,
        veh: { x: s.truth.x, y: s.truth.y, psi: s.truth.psi, v: s.truth.v },
        est: { x: s.drishti.x, y: s.drishti.y, psi: s.drishti.psi },
        s: s.truth.s,
        distance: s.distance,
        drishtiError: s.drishtiError,
        errorFraction: s.errorFraction,
        uncertainty: {
          along: s.uncertainty.sigmaAlong,
          cross: s.uncertainty.sigmaCross,
          psi: s.uncertainty.sigmaPsi,
        },
        speedConfidence: s.speed.confidence,
        blackoutElapsed: s.blackoutElapsed,
        blackoutDistance: s.blackoutDistance,
        blackoutStartS: s.blackoutStartS,
        blackoutEndS: s.blackoutEndS,
        rejectedCount: s.rejectedCount,
        anomalyCount: s.anomalyCount,
        recoveryTime: s.recoveryTime,
        nis: s.lastIntegrity?.nis ?? null,
        nisAccepted: s.lastIntegrity?.accepted ?? null,
        ablation: s.ablation,
      })

      // New log entries become one-shot overlay events on the phone.
      const latest = s.log[s.log.length - 1]
      if (latest && latest.id !== lastEventId.current) {
        lastEventId.current = latest.id
        send({
          type: 'event',
          event: latest.message,
          t: latest.t,
          severity: latest.severity,
          id: latest.id,
        })
      }
    }, 50)
    return () => clearInterval(id)
  }, [stats.state, send])

  const snapRef = useRef(snap)
  snapRef.current = snap

  return { stats, telemetry, orientationRef, lastCommand }
}
