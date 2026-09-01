'use client'

import { useEffect, useRef } from 'react'
import { SEGMENTS, ROUTE, ROUTE_LENGTH, poseAt } from '@/lib/sim/road'
import type { MissionStateMessage } from '@/lib/link/protocol'

/**
 * Driver's-eye navigation map.
 *
 * Renders the AUTHORITATIVE vehicle state streamed from Mission Control. There
 * is no simulation here and no second clock: the phone interpolates between
 * received states for smoothness and nothing more.
 *
 * The road network itself is static shared geometry imported from lib/sim/road,
 * so the two screens draw the same map without streaming polylines every frame.
 */

export type CameraMode = 'heading-up' | 'north-up'

const DEG = 180 / Math.PI
/**
 * Metres of world visible across the shorter screen axis.
 *
 * Tight framing looks like a void: this road network is sparse, and at 260 m
 * the nearest neighbouring road is off screen, leaving the driver with a single
 * line on black and no sense of movement.
 */
const VIEW_SPAN = 430
/** Ground grid spacing, metres. Gives motion a reference to move against. */
const GRID_M = 50

export function NavMap({
  stateRef,
  cameraMode,
  follow,
}: {
  stateRef: React.RefObject<MissionStateMessage | null>
  cameraMode: CameraMode
  follow: boolean
}) {
  const worldRef = useRef<SVGGElement>(null)
  const ellipseRef = useRef<SVGEllipseElement>(null)
  const markerRef = useRef<SVGGElement>(null)
  const doneRef = useRef<SVGPolylineElement>(null)
  const boRef = useRef<SVGPolylineElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /** Interpolated pose, so discrete 20 Hz updates render as continuous motion. */
  const shown = useRef({ x: 0, y: 0, psi: 0, init: false })

  useEffect(() => {
    let raf = 0

    const tick = () => {
      const m = stateRef.current
      const wrap = wrapRef.current
      if (m && wrap) {
        const sh = shown.current

        if (!sh.init) {
          sh.x = m.veh.x
          sh.y = m.veh.y
          sh.psi = m.veh.psi
          sh.init = true
        } else {
          // Critically damped chase toward the authoritative state.
          const k = 0.22
          sh.x += (m.veh.x - sh.x) * k
          sh.y += (m.veh.y - sh.y) * k
          const dp = Math.atan2(
            Math.sin(m.veh.psi - sh.psi),
            Math.cos(m.veh.psi - sh.psi)
          )
          sh.psi += dp * k
        }

        const w = wrap.clientWidth || 360
        const h = wrap.clientHeight || 520
        const scale = Math.min(w, h) / VIEW_SPAN

        // Vehicle sits low on screen when following, the way a nav app frames
        // the road ahead rather than centring the car.
        const cx = w / 2
        const cy = follow ? h * 0.62 : h / 2

        const rot = cameraMode === 'heading-up' ? sh.psi * DEG - 90 : 0

        worldRef.current?.setAttribute(
          'transform',
          `translate(${cx} ${cy}) rotate(${rot.toFixed(2)}) scale(${scale.toFixed(4)} ${-scale.toFixed(4)}) translate(${(-sh.x).toFixed(2)} ${(-sh.y).toFixed(2)})`
        )

        // Completed route, in world space.
        if (doneRef.current) {
          const step = 6
          const pts: string[] = []
          for (let d = 0; d <= m.s; d += step) {
            const p = poseAt(d)
            pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          }
          doneRef.current.setAttribute('points', pts.join(' '))
        }

        // GNSS outage stretch.
        if (boRef.current) {
          if (m.blackoutStartS !== null) {
            const to = m.blackoutEndS ?? m.s
            const pts: string[] = []
            for (let d = m.blackoutStartS; d <= to; d += 6) {
              const p = poseAt(d)
              pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            }
            boRef.current.setAttribute('points', pts.join(' '))
          } else {
            boRef.current.setAttribute('points', '')
          }
        }

        // Uncertainty, drawn about the ESTIMATE and oriented to it.
        if (ellipseRef.current) {
          ellipseRef.current.setAttribute('rx', (2 * m.uncertainty.along).toFixed(1))
          ellipseRef.current.setAttribute('ry', (2 * m.uncertainty.cross).toFixed(1))
          ellipseRef.current.setAttribute(
            'transform',
            `translate(${m.est.x.toFixed(1)} ${m.est.y.toFixed(1)}) rotate(${(m.est.psi * DEG).toFixed(1)})`
          )
        }

        markerRef.current?.setAttribute(
          'transform',
          `translate(${sh.x.toFixed(2)} ${sh.y.toFixed(2)}) rotate(${(sh.psi * DEG).toFixed(2)})`
        )
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stateRef, cameraMode, follow])

  const dest = poseAt(ROUTE_LENGTH)

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <svg style={{ width: '100%', height: '100%', display: 'block' }}>
        <g ref={worldRef}>
          {/* ground grid — a reference so motion is legible on a sparse map */}
          <g>
            {Array.from({ length: 41 }, (_, i) => {
              const v = (i - 20) * GRID_M
              return (
                <g key={i}>
                  <line
                    x1={v}
                    y1={-1000}
                    x2={v}
                    y2={1400}
                    stroke="#0D1826"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={-400}
                    y1={v}
                    x2={1300}
                    y2={v}
                    stroke="#0D1826"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )
            })}
          </g>

          {/* road network */}
          {SEGMENTS.map((seg) => (
            <polyline
              key={seg.id}
              points={seg.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={seg.isRoute ? '#1B2C42' : '#162334'}
              strokeWidth={seg.isRoute ? 13 : 9}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* remaining route */}
          <polyline
            points={ROUTE.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#1E4A66"
            strokeWidth={7}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* completed route */}
          <polyline
            ref={doneRef}
            points=""
            fill="none"
            stroke="var(--drishti)"
            strokeWidth={7}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* stretch driven without GNSS */}
          <polyline
            ref={boRef}
            points=""
            fill="none"
            stroke="rgba(239,68,68,0.55)"
            strokeWidth={9}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* destination */}
          <g transform={`translate(${dest.x} ${dest.y})`}>
            <circle r={7} fill="none" stroke="var(--ok)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle r={2.5} fill="var(--ok)" />
          </g>

          <ellipse
            ref={ellipseRef}
            cx={0}
            cy={0}
            rx={0}
            ry={0}
            fill="rgba(56,189,248,0.13)"
            stroke="rgba(56,189,248,0.5)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* vehicle */}
          <g ref={markerRef}>
            <circle r={11} fill="rgba(56,189,248,0.16)" />
            <polygon
              points="11,0 -7,7 -4,0 -7,-7"
              fill="#EAF6FF"
              stroke="var(--drishti)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
