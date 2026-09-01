'use client'

import { memo } from 'react'
import { CITY_BOUNDS, PARKS } from '@/components/map/cityVisualConfig'
import { ROAD_BOUNDS } from '@/lib/sim/road'

const ROUTE_CX = (ROAD_BOUNDS.minX + ROAD_BOUNDS.maxX) / 2
const ROUTE_CY = (ROAD_BOUNDS.minY + ROAD_BOUNDS.maxY) / 2

function ParkTrees({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const trees = [
    { tx: x + w * 0.25, ty: y + h * 0.4, r: 3 },
    { tx: x + w * 0.55, ty: y + h * 0.35, r: 3.5 },
    { tx: x + w * 0.75, ty: y + h * 0.55, r: 2.8 },
    { tx: x + w * 0.4, ty: y + h * 0.65, r: 3 },
    { tx: x + w * 0.65, ty: y + h * 0.7, r: 2.5 },
  ]
  return (
    <g>
      {trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.tx} cy={t.ty - 1} r={t.r} fill="#0c1618" opacity={0.9} />
          <polygon
            points={`${t.tx},${t.ty + t.r + 2} ${t.tx - 1.2},${t.ty} ${t.tx + 1.2},${t.ty}`}
            fill="#0a1214"
            opacity={0.7}
          />
        </g>
      ))}
    </g>
  )
}

function CityBaseLayerInner() {
  return (
    <g>
      <defs>
        <radialGradient id="cityGroundGrad" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#0a1018" />
          <stop offset="55%" stopColor="#070b10" />
          <stop offset="100%" stopColor="#030508" />
        </radialGradient>
      </defs>

      <rect
        x={CITY_BOUNDS.minX}
        y={CITY_BOUNDS.minY}
        width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX}
        height={CITY_BOUNDS.maxY - CITY_BOUNDS.minY}
        fill="url(#cityGroundGrad)"
      />

      <ellipse
        cx={ROUTE_CX}
        cy={ROUTE_CY}
        rx={(CITY_BOUNDS.maxX - CITY_BOUNDS.minX) * 0.35}
        ry={(CITY_BOUNDS.maxY - CITY_BOUNDS.minY) * 0.35}
        fill="rgba(14,22,32,0.25)"
      />

      {PARKS.map((park) => (
        <g key={park.id}>
          <rect
            x={park.x}
            y={park.y}
            width={park.width}
            height={park.height}
            fill="var(--city-park, #0a1418)"
            stroke="var(--city-park-edge, #142028)"
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
          <ParkTrees x={park.x} y={park.y} w={park.width} h={park.height} />
        </g>
      ))}
    </g>
  )
}

export const CityBaseLayer = memo(CityBaseLayerInner)
