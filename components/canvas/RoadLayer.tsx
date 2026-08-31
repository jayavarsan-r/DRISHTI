'use client'

import { SEGMENTS, ROAD_BOUNDS } from '@/lib/sim/road'

const GRID_M = 25

/** Static road network. Rendered once — nothing here changes during a run. */
export function RoadLayer() {
  const gridLines: React.ReactElement[] = []
  const x0 = Math.floor((ROAD_BOUNDS.minX - 60) / GRID_M) * GRID_M
  const x1 = ROAD_BOUNDS.maxX + 60
  const y0 = Math.floor((ROAD_BOUNDS.minY - 60) / GRID_M) * GRID_M
  const y1 = ROAD_BOUNDS.maxY + 60

  for (let x = x0; x <= x1; x += GRID_M) {
    gridLines.push(
      <line key={`gx${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke="var(--grid)" strokeWidth={1}
        vectorEffect="non-scaling-stroke" />
    )
  }
  for (let y = y0; y <= y1; y += GRID_M) {
    gridLines.push(
      <line key={`gy${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke="var(--grid)" strokeWidth={1}
        vectorEffect="non-scaling-stroke" />
    )
  }

  return (
    <g>
      <g>{gridLines}</g>

      {SEGMENTS.map((seg) => {
        const pts = seg.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        return (
          <g key={seg.id}>
            <polyline
              points={pts}
              fill="none"
              stroke="var(--road)"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={pts}
              fill="none"
              stroke="var(--road-center)"
              strokeWidth={1}
              strokeDasharray="6 8"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {/*
        Segment names, counter-flipped so they read upright inside the y-flipped
        group, and pushed off the carriageway along the local normal so they do
        not sit on the road they label. Short connector segments are left
        unlabelled — at this scale their names collide with their neighbours'.
      */}
      {SEGMENTS.map((seg) => {
        const n = seg.points.length
        if (n < 3) return null

        let len = 0
        for (let i = 1; i < n; i++) {
          len += Math.hypot(seg.points[i].x - seg.points[i - 1].x, seg.points[i].y - seg.points[i - 1].y)
        }
        if (len < 100) return null

        const i = Math.floor(n * 0.45)
        const a = seg.points[i]
        const b = seg.points[Math.min(i + 1, n - 1)]
        const tang = Math.atan2(b.y - a.y, b.x - a.x)
        const off = seg.id === 'service' ? 15 : -15
        const cx = a.x + off * Math.cos(tang + Math.PI / 2)
        const cy = a.y + off * Math.sin(tang + Math.PI / 2)

        return (
          <g key={`lbl-${seg.id}`} transform={`translate(${cx}, ${cy}) scale(1,-1)`}>
            <text
              x={0}
              y={3}
              fontSize={8.5}
              fill="var(--text-lo)"
              textAnchor="middle"
              style={{ letterSpacing: '0.06em' }}
            >
              {seg.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
