'use client'

import { useEffect, useRef } from 'react'
import { SEGMENTS, ROUTE, ROUTE_LENGTH, ROAD_BOUNDS, poseAt } from '@/lib/sim/road'
import { RAD_TO_DEG as DEG, shortestAngleDelta as angleDelta } from './nav-math'
import type { MissionStateMessage } from '@/lib/link/protocol'

/**
 * Driver's-eye navigation map.
 *
 * Renders the AUTHORITATIVE vehicle state streamed from Mission Control. There
 * is no simulation here and no second clock: the phone interpolates between
 * received states for smoothness and nothing more. If the stream stops, the
 * interpolator converges on the last state received and holds it — it never
 * extrapolates motion the server did not send.
 *
 * The road network itself is static shared geometry imported from lib/sim/road,
 * so the two screens draw the same map without streaming polylines every frame.
 */

export type CameraMode = 'heading-up' | 'north-up'

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
/** Chase gain per frame for pose, and the slower one for the camera itself. */
const K_POSE = 0.22
const K_CAM = 0.1
/** Margin around the route when zoomed out to the whole drive, metres. */
const OVERVIEW_PAD = 120

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
  const tintRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /** Interpolated pose, so discrete 20 Hz updates render as continuous motion. */
  const shown = useRef({ x: 0, y: 0, psi: 0, init: false })
  /** Interpolated estimate and its covariance, chased the same way. */
  const shownEst = useRef({ x: 0, y: 0, psi: 0, along: 0, cross: 0 })
  /** Interpolated camera, so switching to the overview glides instead of cutting. */
  const cam = useRef({ fx: 0, fy: 0, scale: 0, rot: 0, cy: 0, init: false })
  /** Outage tint strength, eased so the wash fades rather than blinks. */
  const tint = useRef(0)

  // cameraMode/follow are read through refs: changing them must not restart the
  // animation loop, which would reset the interpolators and snap the vehicle.
  const modeRef = useRef({ cameraMode, follow })
  modeRef.current = { cameraMode, follow }

  useEffect(() => {
    let raf = 0

    const tick = () => {
      const m = stateRef.current
      const wrap = wrapRef.current
      if (m && wrap) {
        const sh = shown.current
        const est = shownEst.current
        const c = cam.current
        const { cameraMode: mode, follow: following } = modeRef.current

        if (!sh.init) {
          sh.x = m.veh.x
          sh.y = m.veh.y
          sh.psi = m.veh.psi
          sh.init = true
          est.x = m.est.x
          est.y = m.est.y
          est.psi = m.est.psi
          est.along = m.uncertainty.along
          est.cross = m.uncertainty.cross
        } else {
          // Critically damped chase toward the authoritative state.
          sh.x += (m.veh.x - sh.x) * K_POSE
          sh.y += (m.veh.y - sh.y) * K_POSE
          sh.psi += angleDelta(m.veh.psi, sh.psi) * K_POSE

          est.x += (m.est.x - est.x) * K_POSE
          est.y += (m.est.y - est.y) * K_POSE
          est.psi += angleDelta(m.est.psi, est.psi) * K_POSE
          // Uncertainty grows through a blackout and shrinks on recovery; both
          // read as a breathing ellipse rather than a step.
          est.along += (m.uncertainty.along - est.along) * K_POSE
          est.cross += (m.uncertainty.cross - est.cross) * K_POSE
        }

        const w = wrap.clientWidth || 360
        const h = wrap.clientHeight || 520

        // Target camera. Following frames the road ahead with the vehicle low
        // on screen; the overview fits the whole drive, north up.
        let tScale: number
        let tRot: number
        let tFx: number
        let tFy: number
        let tCy: number

        if (following) {
          tScale = Math.min(w, h) / VIEW_SPAN
          tRot = mode === 'heading-up' ? sh.psi - Math.PI / 2 : 0
          tFx = sh.x
          tFy = sh.y
          tCy = h * 0.62
        } else {
          const bw = ROAD_BOUNDS.maxX - ROAD_BOUNDS.minX + OVERVIEW_PAD
          const bh = ROAD_BOUNDS.maxY - ROAD_BOUNDS.minY + OVERVIEW_PAD
          tScale = Math.min(w / bw, h / bh)
          tRot = 0
          tFx = (ROAD_BOUNDS.minX + ROAD_BOUNDS.maxX) / 2
          tFy = (ROAD_BOUNDS.minY + ROAD_BOUNDS.maxY) / 2
          tCy = h / 2
        }

        if (!c.init) {
          c.scale = tScale
          c.rot = tRot
          c.fx = tFx
          c.fy = tFy
          c.cy = tCy
          c.init = true
        } else {
          c.scale += (tScale - c.scale) * K_CAM
          c.fx += (tFx - c.fx) * K_CAM
          c.fy += (tFy - c.fy) * K_CAM
          c.cy += (tCy - c.cy) * K_CAM
          // Shortest-angle rotation: 359° to 0° goes forward through 360°.
          c.rot += angleDelta(tRot, c.rot) * K_CAM
        }

        const s = c.scale
        worldRef.current?.setAttribute(
          'transform',
          `translate(${(w / 2).toFixed(2)} ${c.cy.toFixed(2)}) rotate(${(c.rot * DEG).toFixed(2)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)}) translate(${(-c.fx).toFixed(2)} ${(-c.fy).toFixed(2)})`
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

        // Edge wash while the fix is unusable — denied or being rejected.
        const denied = m.gnssMode === 'DENIED' || m.gnssMode === 'SPOOFED' || m.navState === 'DR_ACTIVE'
        tint.current += ((denied ? 1 : 0) - tint.current) * 0.06
        tintRef.current?.style.setProperty('opacity', tint.current.toFixed(3))

        // Uncertainty, drawn about the ESTIMATE and oriented to it.
        if (ellipseRef.current) {
          ellipseRef.current.setAttribute('rx', (2 * est.along).toFixed(1))
          ellipseRef.current.setAttribute('ry', (2 * est.cross).toFixed(1))
          ellipseRef.current.setAttribute(
            'transform',
            `translate(${est.x.toFixed(1)} ${est.y.toFixed(1)}) rotate(${(est.psi * DEG).toFixed(1)})`
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
  }, [stateRef])

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

      {/* GNSS-outage wash, opacity driven per frame */}
      <div
        ref={tintRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 62%, rgba(239,68,68,0) 42%, rgba(239,68,68,0.16) 100%)',
        }}
      />
    </div>
  )
}
