'use client'

/**
 * Phone attitude instrument. Driven by real DeviceOrientationEvent values.
 * Updated imperatively from the animation frame so sensor events never render.
 */
export function Attitude({
  yawRef,
  pitchRef,
  rollRef,
  size = 150,
}: {
  yawRef: React.RefObject<SVGGElement | null>
  pitchRef: React.RefObject<SVGGElement | null>
  rollRef: React.RefObject<SVGGElement | null>
  size?: number
}) {
  const r = size / 2 - 12
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" />
      <circle cx={size / 2} cy={size / 2} r={r * 0.66} fill="none" stroke="var(--border)" strokeDasharray="2 4" />

      {['N', 'E', 'S', 'W'].map((c, i) => {
        const a = (i * 90 - 90) * (Math.PI / 180)
        return (
          <text
            key={c}
            x={size / 2 + Math.cos(a) * (r + 7)}
            y={size / 2 + Math.sin(a) * (r + 7) + 3}
            fontSize={8}
            fill="var(--text-lo)"
            textAnchor="middle"
          >
            {c}
          </text>
        )
      })}

      {/* yaw ring — rotates with azimuth */}
      <g ref={yawRef} style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}>
        <polygon
          points={`${size / 2},${size / 2 - r + 2} ${size / 2 - 7},${size / 2 - r + 17} ${size / 2 + 7},${size / 2 - r + 17}`}
          fill="var(--accent)"
        />
        <line
          x1={size / 2}
          y1={size / 2 - r + 17}
          x2={size / 2}
          y2={size / 2 + r - 17}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeOpacity={0.35}
        />
      </g>

      {/* device body — tilts with pitch and roll */}
      <g ref={rollRef} style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}>
        <g ref={pitchRef} style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}>
          <rect
            x={size / 2 - 15}
            y={size / 2 - 26}
            width={30}
            height={52}
            rx={4}
            fill="var(--bg-raised)"
            stroke="var(--drishti)"
            strokeWidth={1.5}
          />
          <rect
            x={size / 2 - 10}
            y={size / 2 - 21}
            width={20}
            height={34}
            rx={2}
            fill="rgba(56,189,248,0.18)"
          />
          <circle cx={size / 2} cy={size / 2 + 19} r={2} fill="var(--drishti)" />
        </g>
      </g>
    </svg>
  )
}
