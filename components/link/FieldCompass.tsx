'use client'

import { useEffect, useRef } from 'react'

/**
 * FIELD ORIENTATION LINK.
 *
 * Driven by the phone's REAL DeviceOrientationEvent, updated imperatively each
 * animation frame. Deliberately kept separate from the vehicle heading: this
 * shows where the physical sensor node is pointing, not where the simulated
 * vehicle is going.
 */
export function FieldCompass({
  orientationRef,
  live,
  size = 168,
}: {
  orientationRef: React.RefObject<{ alpha: number; beta: number; gamma: number }>
  live: boolean
  size?: number
}) {
  const needle = useRef<SVGGElement>(null)
  const horizon = useRef<SVGGElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const pitchOut = useRef<HTMLSpanElement>(null)
  const rollOut = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const o = orientationRef.current
      if (o) {
        needle.current?.setAttribute('transform', `rotate(${-o.alpha})`)
        horizon.current?.setAttribute(
          'transform',
          `rotate(${o.gamma}) translate(0 ${Math.max(-24, Math.min(24, o.beta * 0.5))})`
        )
        if (readout.current) readout.current.textContent = `${o.alpha.toFixed(1)}°`
        if (pitchOut.current) pitchOut.current.textContent = `${o.beta.toFixed(1)}°`
        if (rollOut.current) rollOut.current.textContent = `${o.gamma.toFixed(1)}°`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [orientationRef])

  const c = size / 2
  const r = c - 16

  return (
    <div>
      <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
        <defs>
          <clipPath id="compassClip">
            <circle cx={c} cy={c} r={r * 0.62} />
          </clipPath>
        </defs>

        {/* artificial horizon, tilts with pitch and roll */}
        <g clipPath="url(#compassClip)">
          <circle cx={c} cy={c} r={r * 0.62} fill="var(--bg-void)" />
          <g ref={horizon} style={{ transformOrigin: `${c}px ${c}px` }}>
            <rect x={c - r} y={c} width={r * 2} height={r} fill="rgba(56,189,248,0.10)" />
            <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="var(--drishti)" strokeWidth={1.2} />
          </g>
        </g>
        <circle cx={c} cy={c} r={r * 0.62} fill="none" stroke="var(--border)" />

        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" />
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i * 10 - 90) * (Math.PI / 180)
          const major = i % 9 === 0
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * (r - (major ? 8 : 4))}
              y1={c + Math.sin(a) * (r - (major ? 8 : 4))}
              x2={c + Math.cos(a) * r}
              y2={c + Math.sin(a) * r}
              stroke={major ? 'var(--text-mid)' : 'var(--border)'}
              strokeWidth={1}
            />
          )
        })}
        {['N', 'E', 'S', 'W'].map((d, i) => {
          const a = (i * 90 - 90) * (Math.PI / 180)
          return (
            <text
              key={d}
              x={c + Math.cos(a) * (r + 9)}
              y={c + Math.sin(a) * (r + 9) + 3.5}
              fontSize={9.5}
              fill={d === 'N' ? 'var(--text-hi)' : 'var(--text-lo)'}
              textAnchor="middle"
              className="label"
            >
              {d}
            </text>
          )
        })}

        <g ref={needle} style={{ transformOrigin: `${c}px ${c}px` }}>
          <polygon
            points={`${c},${c - r + 6} ${c - 8},${c + 10} ${c},${c + 3} ${c + 8},${c + 10}`}
            fill={live ? 'var(--accent)' : 'var(--text-lo)'}
            stroke={live ? 'var(--accent)' : 'none'}
            strokeWidth={0.5}
          />
        </g>
        <circle cx={c} cy={c} r={2.5} fill="var(--text-hi)" />
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
        {[
          ['Azimuth', readout],
          ['Pitch', pitchOut],
          ['Roll', rollOut],
        ].map(([label, ref]) => (
          <div key={label as string}>
            <div className="label" style={{ fontSize: 7.5 }}>
              {label as string}
            </div>
            <span
              ref={ref as React.RefObject<HTMLSpanElement>}
              className="mono"
              style={{ fontSize: 13, color: live ? 'var(--text-hi)' : 'var(--text-lo)' }}
            >
              —
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
