'use client'

import { TARGET_ERROR_FRACTION } from '@/lib/sim/constants'
import type { Snapshot } from '@/lib/sim/types'

/**
 * Error against distance travelled, with the TARGET line.
 *
 * The naive series is NOT clipped to keep the chart tidy — its escape off the
 * top of the axis is the entire point, so the y-axis autoscales to contain it
 * and the DRISHTI series is allowed to sit near the floor.
 */
export function ErrorChart({
  snap,
  width,
  height,
  inset = false,
}: {
  snap: Snapshot
  width: number
  height: number
  inset?: boolean
}) {
  const pad = inset ? { l: 26, r: 6, t: 14, b: 16 } : { l: 44, r: 12, t: 18, b: 28 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b

  const series = snap.errorSeries
  const maxD = Math.max(snap.distance, 100)
  const maxE = Math.max(10, ...series.map((p) => p.naive))

  const sx = (d: number) => pad.l + (d / maxD) * w
  const sy = (e: number) => pad.t + h - (e / maxE) * h

  const path = (key: 'drishti' | 'naive') =>
    series.map((p) => `${sx(p.d).toFixed(1)},${sy(p[key]).toFixed(1)}`).join(' ')

  // TARGET is a fraction of distance travelled, so it is a ray from the origin.
  const targetX = Math.min(maxD, (maxE / TARGET_ERROR_FRACTION) | 0)
  const targetY = TARGET_ERROR_FRACTION * targetX

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={inset ? 'rgba(5,9,15,0.86)' : 'var(--bg-panel)'}
        stroke="var(--border)"
        rx={3}
      />

      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + h} stroke="var(--border)" />
      <line x1={pad.l} y1={pad.t + h} x2={pad.l + w} y2={pad.t + h} stroke="var(--border)" />

      {/* TARGET ray */}
      <line
        x1={sx(0)}
        y1={sy(0)}
        x2={sx(targetX)}
        y2={sy(targetY)}
        stroke="var(--text-mid)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={pad.l + w - 2}
        y={pad.t + 8}
        fontSize={inset ? 7.5 : 9}
        fill="var(--text-mid)"
        textAnchor="end"
        className="label"
      >
        TARGET {(TARGET_ERROR_FRACTION * 100).toFixed(0)}%
      </text>

      {series.length > 1 && (
        <>
          <polyline
            points={path('naive')}
            fill="none"
            stroke="var(--naive)"
            strokeWidth={inset ? 1.4 : 2}
          />
          <polyline
            points={path('drishti')}
            fill="none"
            stroke="var(--drishti)"
            strokeWidth={inset ? 1.6 : 2.2}
          />
        </>
      )}

      <text x={3} y={pad.t + 7} fontSize={inset ? 7 : 9} fill="var(--text-lo)">
        {maxE.toFixed(0)}m
      </text>
      <text x={3} y={pad.t + h} fontSize={inset ? 7 : 9} fill="var(--text-lo)">
        0
      </text>
      <text
        x={pad.l + w}
        y={height - 4}
        fontSize={inset ? 7 : 9}
        fill="var(--text-lo)"
        textAnchor="end"
      >
        {maxD.toFixed(0)} m travelled
      </text>

      {!inset && (
        <text x={pad.l} y={height - 4} fontSize={9} fill="var(--text-lo)">
          Error vs distance · computed each 0.5 s from filter output
        </text>
      )}
    </svg>
  )
}
