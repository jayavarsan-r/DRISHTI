'use client'

import { segmentAt, ROUTE_LENGTH } from '@/lib/sim/road'
import type { MissionStateMessage } from '@/lib/link/protocol'

const GNSS_UI: Record<string, { glyph: string; label: string; color: string }> = {
  NOMINAL: { glyph: '●', label: 'GNSS ACTIVE', color: 'var(--ok)' },
  DEGRADED: { glyph: '◐', label: 'GNSS DEGRADED', color: 'var(--warn)' },
  DENIED: { glyph: '⚠', label: 'GNSS DENIED', color: 'var(--danger)' },
  SPOOFED: { glyph: '⚠', label: 'GNSS ANOMALY', color: 'var(--danger)' },
}

function clock(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/** Translucent status bar over the map. All values are SIMULATED engine output. */
export function NavTopBar({ m, linked }: { m: MissionStateMessage | null; linked: boolean }) {
  const g = GNSS_UI[m?.gnssMode ?? 'NOMINAL'] ?? GNSS_UI.NOMINAL
  const dr = m?.navState === 'DR_ACTIVE'

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: 'max(9px, env(safe-area-inset-top)) 12px 11px',
        background: 'linear-gradient(180deg, rgba(5,9,15,0.94) 55%, rgba(5,9,15,0))',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>DRISHTI</div>
          <div className="mono" style={{ fontSize: 12, color: g.color, marginTop: 2 }}>
            {g.glyph} {g.label}
          </div>
          {dr && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--drishti)', marginTop: 1 }}>
              DEAD RECKONING ACTIVE
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 13 }}>
            T+{clock(m?.t ?? 0)}
          </div>
          <div
            className="mono"
            style={{ fontSize: 9.5, color: linked ? 'var(--ok)' : 'var(--danger)', marginTop: 2 }}
          >
            {linked ? '● LINKED' : '○ OFFLINE'}
          </div>
          <div className="mono" style={{ fontSize: 8.5, color: 'var(--warn)', marginTop: 1 }}>
            NAV SIMULATED
          </div>
        </div>
      </div>
    </div>
  )
}

/** Heads-up figures over the map bottom. */
export function NavHud({ m }: { m: MissionStateMessage | null }) {
  if (!m) return null

  const remaining = Math.max(0, ROUTE_LENGTH - m.s)
  const eta = m.veh.v > 0.5 ? remaining / m.veh.v : null
  const road = segmentAt(Math.min(m.s, ROUTE_LENGTH - 1)).name
  const progress = Math.min(100, (m.s / ROUTE_LENGTH) * 100)
  const dr = m.navState === 'DR_ACTIVE'

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '18px 12px 12px',
        background: 'linear-gradient(0deg, rgba(5,9,15,0.96) 62%, rgba(5,9,15,0))',
        pointerEvents: 'none',
      }}
    >
      <div className="label" style={{ fontSize: 8.5 }}>
        Current road
      </div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--text-hi)', marginBottom: 8 }}>
        {road}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Cell v={(m.veh.v * 3.6).toFixed(0)} u="km/h" k="Speed" />
        <Cell
          v={(m.errorFraction * 100).toFixed(2)}
          u="%"
          k="Drift"
          color={m.errorFraction > 0.1 ? 'var(--warn)' : undefined}
        />
        <Cell v={m.s.toFixed(0)} u="m" k="Travelled" />
        {dr ? (
          <Cell v={clock(m.blackoutElapsed)} u="" k="Outage" color="var(--danger)" />
        ) : (
          <Cell v={eta === null ? '—' : clock(eta)} u="" k="ETA" />
        )}
      </div>

      <div
        style={{
          height: 4,
          marginTop: 10,
          background: 'var(--bg-raised)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--drishti)',
            transition: 'width 160ms linear',
          }}
        />
      </div>
      <div
        className="label"
        style={{ fontSize: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>{progress.toFixed(0)}% of route</span>
        <span>{remaining.toFixed(0)} m remaining · SIMULATED</span>
      </div>
    </div>
  )
}

function Cell({ v, u, k, color }: { v: string; u: string; k: string; color?: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 19, lineHeight: 1.1, color: color ?? 'var(--text-hi)' }}>
        {v}
        {u && <span style={{ fontSize: 10, color: 'var(--text-mid)' }}> {u}</span>}
      </div>
      <div className="label" style={{ fontSize: 8 }}>
        {k}
      </div>
    </div>
  )
}
