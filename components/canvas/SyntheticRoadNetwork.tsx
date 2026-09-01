'use client'

import { memo } from 'react'
import { SYNTHETIC_ROADS } from '@/components/map/cityVisualConfig'

const TIER_STYLES = {
  major: { width: 7, stroke: 'var(--road-asphalt, #1a2a3d)', edge: 'var(--road-lane, #2a3f58)' },
  secondary: { width: 5, stroke: 'var(--road, #16273b)', edge: 'var(--road-center, #22344b)' },
  minor: { width: 3.5, stroke: 'var(--road, #142030)', edge: 'var(--road-center, #1e3048)' },
}

function SyntheticRoadNetworkInner({ visible = true }: { visible?: boolean }) {
  if (!visible) return null

  return (
    <g>
      {SYNTHETIC_ROADS.map((road) => {
        const pts = road.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const style = TIER_STYLES[road.tier]
        return (
          <g key={road.id}>
            <polyline
              points={pts}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={pts}
              fill="none"
              stroke={style.edge}
              strokeWidth={0.6}
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
            {road.tier === 'major' && road.points.length >= 2 && (
              <g
                transform={`translate(${road.points[Math.floor(road.points.length * 0.5)].x}, ${road.points[Math.floor(road.points.length * 0.5)].y}) scale(1,-1)`}
              >
                <text
                  x={0}
                  y={-8}
                  fontSize={7}
                  fill="var(--text-lo, #56697f)"
                  textAnchor="middle"
                  style={{ letterSpacing: '0.06em' }}
                >
                  {road.name}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

export const SyntheticRoadNetwork = memo(SyntheticRoadNetworkInner)
