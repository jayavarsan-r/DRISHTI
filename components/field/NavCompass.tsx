'use client'

import { useEffect, useRef } from 'react'
import { bearingFromPsi } from './nav-math'

const MARKS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/**
 * Compass for the SIMULATED vehicle heading.
 *
 * Deliberately separate from the device compass on the SENSORS tab: this needle
 * follows the simulation, that one follows the handset. Labelled so the two are
 * never read as the same thing.
 */
export function NavCompass({
  headingRef,
}: {
  headingRef: React.RefObject<{ psi: number }>
}) {
  const dial = useRef<SVGGElement>(null)
  const out = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const h = headingRef.current
      if (h) {
        const bearing = bearingFromPsi(h.psi)
        dial.current?.setAttribute('transform', `rotate(${(-bearing).toFixed(1)} 34 34)`)
        if (out.current) out.current.textContent = `${bearing.toFixed(0)}°`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [headingRef])

  return (
    <div
      style={{
        width: 68,
        padding: '6px 4px 5px',
        background: 'rgba(11,20,32,0.86)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        textAlign: 'center',
        backdropFilter: 'blur(6px)',
      }}
    >
      <svg width={68} height={68} style={{ display: 'block' }}>
        <circle cx={34} cy={34} r={28} fill="rgba(5,9,15,0.6)" stroke="var(--border)" />
        <g ref={dial}>
          {MARKS.map((m, i) => {
            const a = ((i * 45 - 90) * Math.PI) / 180
            return (
              <text
                key={m}
                x={34 + Math.cos(a) * 21}
                y={34 + Math.sin(a) * 21 + 3}
                fontSize={m.length > 1 ? 6 : 7.5}
                fill={m === 'N' ? '#EAF6FF' : 'var(--text-lo)'}
                textAnchor="middle"
                fontWeight={m === 'N' ? 700 : 400}
              >
                {m}
              </text>
            )
          })}
        </g>
        {/* fixed needle — the vehicle always points up */}
        <polygon points="34,12 29,26 34,23 39,26" fill="var(--drishti)" />
        <circle cx={34} cy={34} r={2} fill="#EAF6FF" />
      </svg>
      <span className="mono" ref={out} style={{ fontSize: 10, color: 'var(--text-hi)' }}>
        —
      </span>
      <div className="label" style={{ fontSize: 6.5, color: 'var(--warn)', marginTop: 1 }}>
        Simulated
      </div>
    </div>
  )
}
