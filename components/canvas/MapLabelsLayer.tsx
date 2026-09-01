'use client'

import { memo } from 'react'
import { LANDMARKS } from '@/components/map/cityVisualConfig'

function MapLabelsLayerInner() {
  return (
    <g>
      {LANDMARKS.map((lm) => (
        <g key={lm.id} transform={`translate(${lm.x}, ${lm.y}) scale(1,-1)`}>
          <text
            x={0}
            y={0}
            fontSize={lm.tier === 'major' ? 8 : 7}
            fill={lm.tier === 'major' ? 'var(--text-mid, #8fa3bc)' : 'var(--text-lo, #56697f)'}
            textAnchor="middle"
            style={{ letterSpacing: '0.08em' }}
          >
            {lm.name}
          </text>
        </g>
      ))}
    </g>
  )
}

export const MapLabelsLayer = memo(MapLabelsLayerInner)
