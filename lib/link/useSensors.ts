'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SensorSample } from './protocol'

export type PermissionState = 'unsupported' | 'insecure' | 'prompt' | 'granted' | 'denied'

export interface SensorStatus {
  permission: PermissionState
  /** true only while events are actually arriving */
  live: boolean
  /** measured from real event timestamps — never assumed */
  hz: number
  motionSupported: boolean
  orientationSupported: boolean
  /** why sensors are unavailable, shown verbatim to the user */
  reason: string | null
}

/**
 * Everything needed to work out why sensors are or are not delivering, shown
 * on the phone itself. Diagnosing this remotely is otherwise guesswork: the
 * failure is silent and looks identical to a dead button.
 */
export interface SensorDiagnostics {
  protocol: string
  host: string
  isSecureContext: boolean | null
  hasDeviceMotion: boolean
  hasDeviceOrientation: boolean
  needsPermissionCall: boolean
  /** raw count of events seen since load, regardless of permission state */
  motionEvents: number
  orientationEvents: number
  /** what the last enable() attempt actually did */
  lastAction: string
}

/**
 * iOS 13+ gates these behind an explicit user-gesture permission call. Android
 * Chrome does not, but BOTH require a secure context: over plain http on a LAN
 * address no events are delivered at all, silently. That is the single most
 * common reason a phone shows nothing, so it is detected and reported rather
 * than left to look like a bug.
 */
function needsPermissionCall(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown })
      ?.requestPermission === 'function'
  )
}

const RING = 512

export function useSensors() {
  const [status, setStatus] = useState<SensorStatus>({
    permission: 'prompt',
    live: false,
    hz: 0,
    motionSupported: false,
    orientationSupported: false,
    reason: null,
  })

  const [diag, setDiag] = useState<SensorDiagnostics>({
    protocol: '',
    host: '',
    isSecureContext: null,
    hasDeviceMotion: false,
    hasDeviceOrientation: false,
    needsPermissionCall: false,
    motionEvents: 0,
    orientationEvents: 0,
    lastAction: 'not attempted',
  })

  const rawCounts = useRef({ motion: 0, orientation: 0 })

  /** Latest sample, written on every event. Never triggers a render. */
  const latest = useRef<SensorSample>({
    timestamp: 0,
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    interval: 0,
  })

  /** Ring buffer for the scrolling graphs and for batched transmission. */
  const ring = useRef<SensorSample[]>([])
  const drainMark = useRef(0)
  const eventTimes = useRef<number[]>([])
  const lastEventAt = useRef(0)

  const push = useCallback((s: SensorSample) => {
    latest.current = s
    ring.current.push(s)
    if (ring.current.length > RING) ring.current.splice(0, ring.current.length - RING)
    const now = performance.now()
    lastEventAt.current = now
    eventTimes.current.push(now)
    if (eventTimes.current.length > 120) eventTimes.current.shift()
  }, [])

  /** Samples accumulated since the previous drain. Used for batched TX. */
  const drain = useCallback((): SensorSample[] => {
    const out = ring.current.slice(drainMark.current)
    drainMark.current = ring.current.length
    if (drainMark.current > RING) drainMark.current = ring.current.length
    return out
  }, [])

  const recent = useCallback((n: number): SensorSample[] => ring.current.slice(-n), [])

  const attach = useCallback(() => {
    const onMotion = (e: DeviceMotionEvent) => {
      rawCounts.current.motion++
      const a = e.accelerationIncludingGravity ?? e.acceleration
      const r = e.rotationRate
      push({
        timestamp: performance.now(),
        accel: { x: a?.x ?? 0, y: a?.y ?? 0, z: a?.z ?? 0 },
        gyro: { x: r?.beta ?? 0, y: r?.gamma ?? 0, z: r?.alpha ?? 0 },
        orientation: latest.current.orientation,
        interval: e.interval ?? 0,
      })
    }

    const onOrientation = (e: DeviceOrientationEvent) => {
      rawCounts.current.orientation++
      latest.current = {
        ...latest.current,
        orientation: { alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0 },
      }
    }

    window.addEventListener('devicemotion', onMotion)
    window.addEventListener('deviceorientation', onOrientation)
    return () => {
      window.removeEventListener('devicemotion', onMotion)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [push])

  const detachRef = useRef<null | (() => void)>(null)

  const enable = useCallback(async () => {
    if (typeof window === 'undefined') return

    setDiag((d) => ({ ...d, lastAction: 'tapped — checking' }))

    /*
     * A non-secure context is reported, NOT treated as fatal: if the browser is
     * already delivering events (some do), refusing to continue would disable a
     * working sensor stream over a technicality.
     */
    if (!window.isSecureContext && rawCounts.current.motion === 0) {
      setStatus((s) => ({
        ...s,
        permission: 'insecure',
        reason:
          'This page is not a secure context and no motion events have arrived. Browsers only deliver motion sensors over https with a trusted certificate, or to an origin explicitly allowlisted in chrome://flags.',
      }))
      setDiag((d) => ({ ...d, lastAction: 'blocked: insecure context, 0 events seen' }))
      return
    }

    const motionSupported = typeof window.DeviceMotionEvent !== 'undefined'
    const orientationSupported = typeof window.DeviceOrientationEvent !== 'undefined'

    if (!motionSupported && !orientationSupported) {
      setStatus((s) => ({
        ...s,
        permission: 'unsupported',
        motionSupported,
        orientationSupported,
        reason: 'This browser exposes no motion or orientation sensor APIs.',
      }))
      return
    }

    if (needsPermissionCall()) {
      try {
        const res = await (
          DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission()
        if (res !== 'granted') {
          setStatus((s) => ({
            ...s,
            permission: 'denied',
            reason: 'Motion access was denied. Grant it in browser settings and retry.',
          }))
          setDiag((d) => ({ ...d, lastAction: `requestPermission returned "${res}"` }))
          return
        }
        const anyOrient = DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>
        }
        if (typeof anyOrient.requestPermission === 'function') {
          await anyOrient.requestPermission().catch(() => undefined)
        }
      } catch (err) {
        setStatus((s) => ({
          ...s,
          permission: 'denied',
          reason: 'The permission request failed. It must be triggered by a tap.',
        }))
        setDiag((d) => ({ ...d, lastAction: `requestPermission threw: ${String(err)}` }))
        return
      }
    }

    // Keep the probe listeners; attaching a second set would double-count.
    if (!detachRef.current) detachRef.current = attach()
    setStatus((s) => ({
      ...s,
      permission: 'granted',
      motionSupported,
      orientationSupported,
      reason: null,
    }))
    setDiag((d) => ({ ...d, lastAction: 'granted — listeners attached' }))
  }, [attach])

  // Liveness and measured rate. Polled, so sensor events never cause renders.
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now()
      const times = eventTimes.current.filter((t) => now - t < 1000)
      eventTimes.current = times
      const live = now - lastEventAt.current < 500 && times.length > 0
      setStatus((s) =>
        s.live === live && Math.abs(s.hz - times.length) < 0.5
          ? s
          : { ...s, live, hz: times.length }
      )
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => detachRef.current?.(), [])

  /*
   * Probe on mount. Android Chrome requires no permission call, so attaching
   * immediately reveals whether events flow at all — which distinguishes a
   * blocked permission from a non-secure context from a device with no sensors,
   * without the user having to tap anything.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const probeDetach = attach()
    setDiag((d) => ({
      ...d,
      protocol: window.location.protocol,
      host: window.location.host,
      isSecureContext: window.isSecureContext,
      hasDeviceMotion: typeof window.DeviceMotionEvent !== 'undefined',
      hasDeviceOrientation: typeof window.DeviceOrientationEvent !== 'undefined',
      needsPermissionCall: needsPermissionCall(),
    }))
    return probeDetach
  }, [attach])

  useEffect(() => {
    const id = setInterval(() => {
      setDiag((d) =>
        d.motionEvents === rawCounts.current.motion &&
        d.orientationEvents === rawCounts.current.orientation
          ? d
          : {
              ...d,
              motionEvents: rawCounts.current.motion,
              orientationEvents: rawCounts.current.orientation,
            }
      )

      /*
       * Auto-advance. If the probe is already receiving events there is nothing
       * left to ask permission for, and holding the user behind a consent gate
       * they cannot satisfy is how the phone ends up connected but streaming
       * nothing but heartbeats. Android reaches here; iOS still needs the tap,
       * and falls through to the button.
       */
      if (rawCounts.current.motion + rawCounts.current.orientation > 0) {
        setStatus((st) =>
          st.permission === 'granted'
            ? st
            : {
                ...st,
                permission: 'granted',
                motionSupported: true,
                orientationSupported: true,
                reason: null,
              }
        )
        setDiag((d) =>
          d.lastAction === 'auto: events detected, gate skipped'
            ? d
            : { ...d, lastAction: 'auto: events detected, gate skipped' }
        )
      }
    }, 300)
    return () => clearInterval(id)
  }, [])

  return { status, diag, enable, latest, drain, recent }
}
