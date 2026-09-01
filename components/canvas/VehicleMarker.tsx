'use client'

import { forwardRef } from 'react'

/**
 * Premium navigation head pointer — circular puck, dual-tone halo, white arrow.
 * Transform applied by parent useFrame.
 */
export const VehicleMarker = forwardRef<SVGGElement>(function VehicleMarker(_, ref) {
  return (
    <g ref={ref}>
      <ellipse
        cx={0}
        cy={2}
        rx={22}
        ry={10}
        fill="var(--nav-halo-blue, rgba(56,189,248,0.35))"
        opacity={0.45}
        filter="url(#navPuckGlow)"
      />

      <path
        d="M -16 0 A 16 16 0 0 1 0 -16 A 16 16 0 0 1 0 16 Z"
        fill="var(--nav-halo-blue, rgba(56,189,248,0.4))"
        opacity={0.55}
        filter="url(#navPuckGlow)"
      />
      <path
        d="M 0 -16 A 16 16 0 0 1 16 0 A 16 16 0 0 1 0 16 Z"
        fill="var(--nav-halo-amber, rgba(251,146,60,0.38))"
        opacity={0.5}
        filter="url(#navPuckGlow)"
      />

      <circle
        r={11}
        fill="var(--nav-puck, #0a1018)"
        stroke="rgba(220,230,240,0.35)"
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />

      <polygon
        points="0,-8 5.5,6 -5.5,6"
        fill="var(--nav-arrow, #f0f6fc)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
        filter="url(#navArrowGlow)"
      />
      <polygon
        points="0,-5 3,-1 -3,-1"
        fill="var(--route-ribbon-core, #38bdf8)"
        opacity={0.7}
      />
    </g>
  )
})
