'use client'

import { memo, type ReactElement } from 'react'
import type { BuildingDef } from '@/components/map/cityVisualConfig'
import { BUILDINGS } from '@/components/map/cityVisualConfig'

const ISO_X = 0.65
const ISO_Y = 0.42

function LandmarkRoof({ x, y, width, depth, hx, hy }: { x: number; y: number; width: number; depth: number; hx: number; hy: number }) {
  const cx = x + width / 2
  const step = width * 0.35
  return (
    <polygon
      points={`${cx - step},${y} ${cx},${y + hy + 4} ${cx + step},${y} ${cx + step + hx},${y + hy} ${cx - step + hx},${y + hy}`}
      fill="var(--bld-top, #1a222e)"
      stroke="rgba(180,200,220,0.15)"
      strokeWidth={0.4}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function BuildingShape({ bld }: { bld: BuildingDef }) {
  const { x, y, width, depth, height, rotation, type, isLandmark, isFacade, label } = bld
  const hx = height * ISO_X
  const hy = height * ISO_Y

  const front = `${x},${y} ${x + width},${y} ${x + width},${y + depth} ${x},${y + depth}`
  const top = `${x},${y} ${x + hx},${y + hy} ${x + width + hx},${y + hy} ${x + width},${y}`
  const side = `${x + width},${y} ${x + width + hx},${y + hy} ${x + width + hx},${y + depth + hy} ${x + width},${y + depth}`

  const showWindows =
    !isFacade &&
    type !== 'parking' &&
    type !== 'warehouse' &&
    width > 18 &&
    (type === 'office' || type === 'research' || type === 'hospital')

  const windows: ReactElement[] = []
  if (showWindows) {
    const windowStep = Math.max(6, width / 4)
    for (let wx = x + 4; wx < x + width - 5; wx += windowStep) {
      windows.push(
        <rect
          key={`${wx}`}
          x={wx}
          y={y + depth * 0.35}
          width={2}
          height={3}
          fill="var(--bld-window, #1a2838)"
          opacity={0.4}
        />
      )
    }
  }

  return (
    <g transform={`rotate(${rotation} ${x + width / 2} ${y + depth / 2})`}>
      <polygon
        points={side}
        fill="var(--bld-side, #0a0f16)"
        stroke="var(--bld-edge, #1a2a3a)"
        strokeWidth={0.4}
        vectorEffect="non-scaling-stroke"
      />
      {isLandmark ? (
        <LandmarkRoof x={x} y={y} width={width} depth={depth} hx={hx} hy={hy} />
      ) : (
        <polygon
          points={top}
          fill="var(--bld-top, #1a222e)"
          stroke="var(--bld-edge, #1a2a3a)"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polygon
        points={front}
        fill="var(--bld-matte-face, #0e141c)"
        stroke="var(--bld-edge, #243448)"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x + hx * 0.1}
        y1={y + hy * 0.1}
        x2={x + width + hx * 0.9}
        y2={y + hy * 0.1}
        stroke="rgba(180,200,220,0.12)"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
      {windows}
      {label && !isFacade && (
        <g transform={`translate(${x + width / 2}, ${y + depth / 2}) scale(1,-1)`}>
          <text
            x={0}
            y={depth / 2 + 6}
            fontSize={6}
            fill="var(--text-lo, #56697f)"
            textAnchor="middle"
            style={{ letterSpacing: '0.05em' }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  )
}

function BuildingLayerInner({ visible = true }: { visible?: boolean }) {
  if (!visible) return null

  return (
    <g>
      {BUILDINGS.map((bld) => (
        <BuildingShape key={bld.id} bld={bld} />
      ))}
    </g>
  )
}

export const BuildingLayer = memo(BuildingLayerInner)
