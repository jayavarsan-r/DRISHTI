'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'
import { useLink } from './useLink'
import type { CommandName, LinkMessage, SensorMessage } from './protocol'

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
        case 'FIELD_STEER_ON':
          engine.setFieldSteer(true)
          return { accepted: true }
        case 'FIELD_STEER_OFF':
          engine.setFieldSteer(false)
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
    [dispatch]
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

  // Mirror simulation state back to the phone, at a rate a human can read.
  const lastEvent = useRef<string>('')
  useEffect(() => {
    if (stats.state !== 'CONNECTED') return
    const id = setInterval(() => {
      const latestLog = snapRef.current.log[snapRef.current.log.length - 1]
      const s = snapRef.current
      send({
        type: 'event',
        event: latestLog?.message ?? 'IDLE',
        t: s.t,
        navState: s.navState,
        gnssMode: s.gnssMode,
        drishtiError: s.drishtiError,
        errorFraction: s.errorFraction,
        blackoutElapsed: s.blackoutElapsed,
        uncertainty: Math.hypot(s.uncertainty.sigmaAlong, s.uncertainty.sigmaCross),
        severity: latestLog?.severity ?? 'info',
      })
      lastEvent.current = latestLog?.message ?? ''
    }, 250)
    return () => clearInterval(id)
  }, [stats.state, send])

  const snapRef = useRef(snap)
  snapRef.current = snap

  return { stats, telemetry, orientationRef, lastCommand }
}
