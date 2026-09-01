'use client'

import { memo } from 'react'
import { TUNNEL } from '@/components/map/cityVisualConfig'

const TUNNEL_STROKE = TUNNEL.halfWidth * 2

function TunnelLayerInner() {
  const centerPts = TUNNEL.centerline.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const leftPts = TUNNEL.leftWall.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const rightPts = TUNNEL.rightWall.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const entLabelX = TUNNEL.entrance.x
  const entLabelY = TUNNEL.entrance.y
  const exitLabelX = TUNNEL.exit.x
  const exitLabelY = TUNNEL.exit.y

  return (
    <g>
      <polyline
        points={centerPts}
        fill="none"
        stroke="rgba(239,68,68,0.28)"
        strokeWidth={TUNNEL_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <polyline
        points={centerPts}
        fill="none"
        stroke="var(--tunnel-interior, rgba(8,6,10,0.85))"
        strokeWidth={TUNNEL_STROKE - 6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <polyline
        points={leftPts}
        fill="none"
        stroke="var(--tunnel-wall, rgba(120,45,35,0.55))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={rightPts}
        fill="none"
        stroke="var(--tunnel-wall, rgba(120,45,35,0.55))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <g transform={`translate(${entLabelX}, ${entLabelY}) scale(1,-1)`}>
        <text
          x={0}
          y={-18}
          fontSize={6.5}
          fill="var(--tunnel-label, rgba(200,120,80,0.75))"
          textAnchor="middle"
          style={{ letterSpacing: '0.1em' }}
        >
          TUNNEL ENTRANCE
        </text>
      </g>

      <g transform={`translate(${exitLabelX}, ${exitLabelY}) scale(1,-1)`}>
        <text
          x={0}
          y={22}
          fontSize={6.5}
          fill="var(--tunnel-label, rgba(200,120,80,0.75))"
          textAnchor="middle"
          style={{ letterSpacing: '0.1em' }}
        >
          TUNNEL EXIT
        </text>
      </g>

      <g transform={`translate(${entLabelX + 40}, ${entLabelY + 90}) scale(1,-1)`}>
        <text
          x={0}
          y={0}
          fontSize={7}
          fill="var(--text-lo, #56697f)"
          textAnchor="middle"
          style={{ letterSpacing: '0.08em' }}
        >
          TUNNEL
        </text>
      </g>
    </g>
  )
}

export const TunnelLayer = memo(TunnelLayerInner)
