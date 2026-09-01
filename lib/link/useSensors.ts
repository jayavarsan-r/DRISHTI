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

    if (!window.isSecureContext) {
      setStatus((s) => ({
        ...s,
        permission: 'insecure',
        reason:
          'Motion sensors require a secure context. This page was opened over plain http, so the browser will not deliver any sensor events.',
      }))
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
          return
        }
        const anyOrient = DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>
        }
        if (typeof anyOrient.requestPermission === 'function') {
          await anyOrient.requestPermission().catch(() => undefined)
        }
      } catch {
        setStatus((s) => ({
          ...s,
          permission: 'denied',
          reason: 'The permission request failed. It must be triggered by a tap.',
        }))
        return
      }
    }

    detachRef.current?.()
    detachRef.current = attach()
    setStatus((s) => ({
      ...s,
      permission: 'granted',
      motionSupported,
      orientationSupported,
      reason: null,
    }))
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

  return { status, enable, latest, drain, recent }
}
