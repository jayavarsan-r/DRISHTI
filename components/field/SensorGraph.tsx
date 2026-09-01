'use client'

import { useEffect, useRef } from 'react'
import type { SensorSample } from '@/lib/link/protocol'

/**
 * Scrolling sensor trace on a canvas, redrawn from the ring buffer once per
 * animation frame. Nothing here passes through React state.
 */
export function SensorGraph({
  recent,
  pick,
  label,
  color,
  scale,
  height = 44,
}: {
  recent: (n: number) => SensorSample[]
  pick: (s: SensorSample) => number
  label: string
  color: string
  scale: number
  height?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const cv = ref.current
      if (cv) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = cv.clientWidth
        if (cv.width !== w * dpr || cv.height !== height * dpr) {
          cv.width = w * dpr
          cv.height = height * dpr
        }
        const g = cv.getContext('2d')
        if (g) {
          g.setTransform(dpr, 0, 0, dpr, 0, 0)
          g.clearRect(0, 0, w, height)

          g.strokeStyle = 'rgba(143,163,188,0.22)'
          g.lineWidth = 1
          g.beginPath()
          g.moveTo(0, height / 2)
          g.lineTo(w, height / 2)
          g.stroke()

          const pts = recent(180)
          if (pts.length > 1) {
            g.strokeStyle = color
            g.lineWidth = 1.4
            g.beginPath()
            pts.forEach((s, i) => {
              const x = (i / (pts.length - 1)) * w
              const v = Math.max(-1, Math.min(1, pick(s) / scale))
              const y = height / 2 - v * (height / 2 - 3)
              i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
            })
            g.stroke()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [recent, pick, color, scale, height])

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        className="label"
        style={{ fontSize: 8, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--text-lo)' }}>±{scale}</span>
      </div>
      <canvas
        ref={ref}
        style={{
          width: '100%',
          height,
          display: 'block',
          background: 'var(--bg-void)',
          border: '1px solid var(--border)',
          borderRadius: 2,
        }}
      />
    </div>
  )
}
