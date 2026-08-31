'use client'

export function Panel({
  title,
  provenance,
  children,
  hot,
}: {
  title: string
  provenance: string
  children: React.ReactNode
  hot?: boolean
}) {
  return (
    <div className={`panel${hot ? ' panel-hot' : ''}`} style={{ padding: 12 }}>
      <div className="panel-title" style={{ fontSize: 11 }}>
        {title}
      </div>
      <div style={{ marginTop: 9 }}>{children}</div>
      <div className="provenance" style={{ marginTop: 9 }}>
        {provenance}
      </div>
    </div>
  )
}

export function Bar({
  label,
  value,
  max,
  color,
  unit,
}: {
  label: string
  value: number
  max: number
  color: string
  unit?: string
}) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
      <span className="label" style={{ fontSize: 8.5, width: 54, flex: '0 0 auto' }}>
        {label}
      </span>
      <span
        style={{
          flex: 1,
          height: 7,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width 60ms linear',
          }}
        />
      </span>
      <span
        className="mono"
        style={{ fontSize: 9.5, width: 58, textAlign: 'right', flex: '0 0 auto' }}
      >
        {value.toFixed(2)}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  )
}
