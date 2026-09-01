'use client'

import { useEffect, useRef } from 'react'
import type { LinkStats } from '@/lib/link/useLink'

/**
 * Packet-flow visualisation.
 *
 * Dots are emitted in proportion to the ACTUAL measured receive rate, so when
 * the phone stops sending, the flow stops. Nothing animates while disconnected.
 */
export function LinkFlow({ stats, width = 250, height = 46 }: { stats: LinkStats; width?: number; height?: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const rateRef = useRef(0)
  const connectedRef = useRef(false)

  rateRef.current = stats.rxPerSec
  connectedRef.current = stats.state === 'CONNECTED'

  useEffect(() => {
    let raf = 0
    let dots: number[] = []
    let acc = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(100, now - last) / 1000
      last = now

      const g = cv.current?.getContext('2d')
      if (g && cv.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        if (cv.current.width !== width * dpr) {
          cv.current.width = width * dpr
          cv.current.height = height * dpr
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, width, height)

        const y = height / 2
        g.strokeStyle = connectedRef.current ? 'var(--border-hot)' : 'var(--border)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(8, y)
        g.lineTo(width - 8, y)
        g.stroke()

        if (connectedRef.current && rateRef.current > 0) {
          // one dot per received packet, rate-matched to the measured stream
          acc += rateRef.current * dt
          while (acc >= 1) {
            dots.push(0)
            acc -= 1
          }
          dots = dots.map((p) => p + dt * 0.85).filter((p) => p <= 1)

          for (const p of dots) {
            const x = 8 + p * (width - 16)
            g.fillStyle = '#22D3EE'
            g.globalAlpha = Math.sin(p * Math.PI) * 0.9 + 0.1
            g.beginPath()
            g.arc(x, y, 2.4, 0, Math.PI * 2)
            g.fill()
          }
          g.globalAlpha = 1
        } else {
          dots = []
        }

        // endpoints
        g.fillStyle = connectedRef.current ? '#22C55E' : '#56697F'
        g.beginPath()
        g.arc(8, y, 4, 0, Math.PI * 2)
        g.fill()
        g.beginPath()
        g.arc(width - 8, y, 4, 0, Math.PI * 2)
        g.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height])

  return (
    <div>
      <canvas ref={cv} style={{ width, height, display: 'block' }} />
      <div
        className="label"
        style={{ fontSize: 7.5, display: 'flex', justifyContent: 'space-between', marginTop: -4 }}
      >
        <span>Field unit</span>
        <span>Mission control</span>
      </div>
    </div>
  )
}
