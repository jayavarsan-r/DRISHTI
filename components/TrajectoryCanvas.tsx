'use client'

import { useRef } from 'react'
import { ROAD_BOUNDS } from '@/lib/sim/road'
import { useFrame, useSnapshot } from './useEngine'
import { RoadLayer } from './canvas/RoadLayer'
import { BlackoutZone } from './canvas/BlackoutZone'
import { BlackoutClock } from './canvas/BlackoutClock'
import { BaselineFailureBanner } from './canvas/BaselineFailureBanner'
import { DecisionStrip } from './canvas/DecisionStrip'
import { OffMapChip } from './canvas/OffMapChip'
import { ErrorChart } from './canvas/ErrorChart'
import { GhostHypotheses } from './canvas/GhostHypotheses'

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
export function TrajectoryCanvas({
  children,
  overlay,
}: {
  children?: React.ReactNode
  /** Rendered above the scene; used for the field-orientation instrument. */
  overlay?: React.ReactNode
}) {
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

          {/* 2 · road travelled since GNSS loss */}
          <BlackoutZone snap={snap} />

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

          {/* 8 · ghost candidate roads while the match is ambiguous */}
          <GhostHypotheses snap={snap} />

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

      </svg>

      {/*
        Vignette as a CSS overlay rather than an SVG rect: preserveAspectRatio
        letterboxes the viewBox, so a rect in user space covers only the content
        box and reads as hard-edged bands against the panel.
      */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: denied
            ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(130,22,22,0.34) 100%)'
            : 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.32) 100%)',
          transition: 'background 500ms ease',
        }}
      />

      <Legend />
      {overlay}
      <BlackoutClock snap={snap} />
      <OffMapChip snap={snap} />
      <BaselineFailureBanner snap={snap} />

      {/* The 10% line is the ISRO metric, so the chart stays on the hero screen. */}
      <div style={{ position: 'absolute', right: 12, bottom: 46 }}>
        <ErrorChart snap={snap} width={220} height={120} inset />
      </div>

      <DecisionStrip snap={snap} />
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
        // clears the 36px decision strip pinned to the bottom edge
        bottom: 46,
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
