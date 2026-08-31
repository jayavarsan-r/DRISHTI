'use client'

import { useRef } from 'react'
import { ROAD_BOUNDS } from '@/lib/sim/road'
import { useFrame, useSnapshot } from './useEngine'
import { RoadLayer } from './canvas/RoadLayer'

const PAD = 45

const VIEW = {
  x: ROAD_BOUNDS.minX - PAD,
  y: -(ROAD_BOUNDS.maxY + PAD),
  w: ROAD_BOUNDS.maxX - ROAD_BOUNDS.minX + PAD * 2,
  h: ROAD_BOUNDS.maxY - ROAD_BOUNDS.minY + PAD * 2,
}

/**
 * The hero panel.
 *
 * Trajectory geometry is written imperatively onto element refs inside the rAF
 * callback — 110 s of run at 20 Hz decimation is ~2200 points per trail, and
 * reconciling that through React every frame will not hold 60 fps. Only the
 * discrete overlays below re-render from the snapshot.
 *
 * The whole scene sits in a scale(1,-1) group so the simulation's metric frame
 * (y up) survives contact with SVG (y down). Text inside that group is
 * counter-flipped where it appears.
 */
export function TrajectoryCanvas({ children }: { children?: React.ReactNode }) {
  const truthRef = useRef<SVGPolylineElement>(null)
  const naiveRef = useRef<SVGPolylineElement>(null)
  const drishtiRef = useRef<SVGPolylineElement>(null)
  const vehicleRef = useRef<SVGGElement>(null)
  const ellipseRef = useRef<SVGEllipseElement>(null)
  const lastVersion = useRef(-1)

  const snap = useSnapshot()

  useFrame((engine) => {
    const t = engine.trails
    if (t.version !== lastVersion.current) {
      lastVersion.current = t.version
      truthRef.current?.setAttribute('points', t.truth)
      naiveRef.current?.setAttribute('points', t.naive)
      drishtiRef.current?.setAttribute('points', t.drishti)
    }

    const s = engine.getSnapshot()
    const deg = (s.drishti.psi * 180) / Math.PI

    vehicleRef.current?.setAttribute(
      'transform',
      `translate(${s.drishti.x.toFixed(2)}, ${s.drishti.y.toFixed(2)}) rotate(${deg.toFixed(2)})`
    )

    // Semi-axes are 2 sigma. Along-track lies down the heading, cross-track
    // across it — this is what makes the ellipse a cigar during a blackout.
    if (ellipseRef.current) {
      ellipseRef.current.setAttribute('rx', (2 * s.uncertainty.sigmaAlong).toFixed(2))
      ellipseRef.current.setAttribute('ry', (2 * s.uncertainty.sigmaCross).toFixed(2))
      ellipseRef.current.setAttribute(
        'transform',
        `translate(${s.drishti.x.toFixed(2)}, ${s.drishti.y.toFixed(2)}) rotate(${deg.toFixed(2)})`
      )
    }
  })

  const denied = snap.navState === 'DR_ACTIVE'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
            <stop offset="62%" stopColor="rgba(0,0,0,0)" />
            <stop
              offset="100%"
              stopColor={denied ? 'rgba(130,22,22,0.30)' : 'rgba(0,0,0,0.28)'}
            />
          </radialGradient>
          <filter id="naiveGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform="scale(1,-1)">
          <RoadLayer />

          {/*
            3 · ground truth. Drawn slightly wider than the DRISHTI line above
            it so that when the two agree, truth reads as a green halo rather
            than disappearing entirely under the blue.
          */}
          <polyline
            ref={truthRef}
            points=""
            fill="none"
            stroke="var(--truth)"
            strokeWidth={5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* 4 · naive INS, with a soft glow so its escape is unmissable */}
          <polyline
            ref={naiveRef}
            points=""
            fill="none"
            stroke="var(--naive)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            filter="url(#naiveGlow)"
          />

          {/* 5 · DRISHTI */}
          <polyline
            ref={drishtiRef}
            points=""
            fill="none"
            stroke="var(--drishti)"
            strokeWidth={3}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* 6 · uncertainty ellipse */}
          <ellipse
            ref={ellipseRef}
            cx={0}
            cy={0}
            rx={0}
            ry={0}
            fill="rgba(56,189,248,0.10)"
            stroke="var(--drishti)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* 7 · vehicle */}
          <g ref={vehicleRef}>
            <polygon
              points="9,0 -5,6 -5,-6"
              fill="var(--drishti)"
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </g>

        <rect
          x={VIEW.x}
          y={VIEW.y}
          width={VIEW.w}
          height={VIEW.h}
          fill="url(#vignette)"
          pointerEvents="none"
        />
      </svg>

      <Legend />
      {children}
    </div>
  )
}

function Legend() {
  const items: [string, string][] = [
    ['GROUND TRUTH', 'var(--truth)'],
    ['DRISHTI', 'var(--drishti)'],
    ['NAIVE INS', 'var(--naive)'],
  ]
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 2.5, background: color, borderRadius: 1 }} />
          <span className="label" style={{ fontSize: 9 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
