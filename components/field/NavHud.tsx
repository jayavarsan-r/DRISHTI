'use client'

import { segmentAt, ROUTE_LENGTH } from '@/lib/sim/road'
import type { MissionStateMessage } from '@/lib/link/protocol'

/**
 * Heads-up chrome over the map.
 *
 * Every figure on this screen is SIMULATED engine output read straight out of
 * the mission state message. Nothing here computes a position, a speed or a
 * clock — the phone has none of its own.
 */

export interface GnssUi {
  glyph: string
  /** short form for the top pill */
  pill: string
  color: string
}

/**
 * The pill collapses GNSS mode and navigation state into the one status a
 * driver cares about. Denied-with-DR and recovering are distinct states, not
 * decorations on "denied": one is coasting, the other is re-converging.
 */
export function gnssUi(m: MissionStateMessage | null): GnssUi {
  if (!m) return { glyph: '○', pill: 'STANDBY', color: 'var(--text-lo)' }
  if (m.navState === 'REACQUIRING') return { glyph: '◍', pill: 'RECOVERING', color: 'var(--warn)' }
  if (m.gnssMode === 'SPOOFED') return { glyph: '⚠', pill: 'GNSS ANOMALY', color: 'var(--danger)' }
  if (m.gnssMode === 'DENIED' || m.navState === 'DR_ACTIVE')
    return { glyph: '⚠', pill: 'GNSS DENIED · DR ACTIVE', color: 'var(--danger)' }
  if (m.gnssMode === 'DEGRADED') return { glyph: '◐', pill: 'GNSS DEGRADED', color: 'var(--warn)' }
  return { glyph: '●', pill: 'GNSS ACTIVE', color: 'var(--ok)' }
}

export function clock(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

/** Whole seconds, for durations where a tenth is noise. */
function shortClock(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t - m * 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const DESTINATION = segmentAt(ROUTE_LENGTH - 1).name

/** Top padding of the transparent top bar, on notched and flat devices alike. */
export const TOP_INSET = 'max(9px, env(safe-area-inset-top))'

/**
 * Vertical position for chrome that floats below the top bar.
 *
 * The bar is roughly 55 px of content on top of the safe-area inset, so a fixed
 * pixel offset that looks right on a flat screen sits underneath the status
 * pill on a notched one. Everything below it is measured from the same origin.
 */
export function mapTop(offset: number): string {
  return `calc(${TOP_INSET} + ${offset}px)`
}

/** Transparent top bar: identity, GNSS status pill, mission clock, link state. */
export function NavTopBar({ m, linked }: { m: MissionStateMessage | null; linked: boolean }) {
  const g = gnssUi(m)
  const paused = !!m && !m.running && !m.finished && m.t > 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: `${TOP_INSET} 12px 14px`,
        background: 'linear-gradient(180deg, rgba(5,9,15,0.94) 55%, rgba(5,9,15,0))',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>DRISHTI</div>
          <div
            className="mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 4,
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 10.5,
              color: g.color,
              background: 'rgba(11,20,32,0.86)',
              border: `1px solid ${g.color}`,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{g.glyph}</span>
            {g.pill}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div className="mono" style={{ fontSize: 13 }}>
            T+{clock(m?.t ?? 0)}
          </div>
          <div
            className="mono"
            style={{ fontSize: 9.5, color: linked ? 'var(--ok)' : 'var(--danger)', marginTop: 2 }}
          >
            {linked ? '● LINKED' : '○ OFFLINE'}
          </div>
          {paused && (
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--warn)', marginTop: 1 }}>
              ⏸ PAUSED
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact floating HUD: the three things worth glancing at while the map is
 * doing the talking. Deliberately one line — the raw numbers live on STATUS.
 */
export function NavFloatingHud({ m }: { m: MissionStateMessage | null }) {
  if (!m) return null
  const dr = m.navState === 'DR_ACTIVE' || m.gnssMode === 'DENIED'
  const drift = m.errorFraction * 100

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: mapTop(60),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        padding: '5px 10px',
        borderRadius: 999,
        background: 'rgba(11,20,32,0.82)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}
    >
      <span className="mono" style={{ fontSize: 10, color: dr ? 'var(--drishti)' : 'var(--ok)' }}>
        {dr ? 'DR' : 'GNSS'}
      </span>
      <Dot />
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-hi)' }}>
        {(m.veh.v * 3.6).toFixed(0)} km/h
      </span>
      <Dot />
      <span
        className="mono"
        style={{ fontSize: 10.5, color: drift > 10 ? 'var(--warn)' : 'var(--text-mid)' }}
      >
        DRIFT {drift.toFixed(2)}%
      </span>
      <span className="label" style={{ fontSize: 6.5, color: 'var(--warn)' }}>
        SIM
      </span>
    </div>
  )
}

function Dot() {
  return <span style={{ width: 2, height: 2, borderRadius: 1, background: 'var(--text-lo)' }} />
}

/** Bottom information card. Driver figures first, engine figures second. */
export function NavHud({ m }: { m: MissionStateMessage | null }) {
  if (!m) return null

  const remaining = Math.max(0, ROUTE_LENGTH - m.s)
  const eta = m.veh.v > 0.5 ? remaining / m.veh.v : null
  const road = segmentAt(Math.min(m.s, ROUTE_LENGTH - 1)).name
  const progress = Math.min(100, (m.s / ROUTE_LENGTH) * 100)
  const outage = m.gnssMode === 'DENIED' || m.navState === 'DR_ACTIVE'
  const sigma = Math.hypot(m.uncertainty.along, m.uncertainty.cross)

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '20px 12px 12px',
        background: 'linear-gradient(0deg, rgba(5,9,15,0.97) 64%, rgba(5,9,15,0))',
        pointerEvents: 'none',
      }}
    >
      {/* current road, from the shared route segment metadata */}
      <div className="label" style={{ fontSize: 8 }}>
        Current road
      </div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--text-hi)' }}>
        {road}
      </div>

      {/* hero row: speed left, destination and ETA right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 8,
        }}
      >
        <div>
          <span className="mono" style={{ fontSize: 34, lineHeight: 1, color: 'var(--text-hi)' }}>
            {(m.veh.v * 3.6).toFixed(0)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-mid)' }}>
            {' '}
            km/h
          </span>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--text-hi)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            ◎ {DESTINATION}
          </div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ok)', marginTop: 2 }}>
            ETA {eta === null ? '—' : shortClock(eta)}
            <span style={{ color: 'var(--text-mid)' }}> · {remaining.toFixed(0)} m</span>
          </div>
        </div>
      </div>

      {/* engine figures */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginTop: 10,
        }}
      >
        <Cell
          v={(m.errorFraction * 100).toFixed(2)}
          u="%"
          k="Drift"
          color={m.errorFraction > 0.1 ? 'var(--warn)' : undefined}
        />
        <Cell v={m.s.toFixed(0)} u="m" k="Travelled" />
        <Cell v={`±${sigma.toFixed(1)}`} u="m" k="Uncertainty" color="var(--drishti)" />
        <Cell
          v={outage || m.blackoutElapsed > 0 ? shortClock(m.blackoutElapsed) : '—'}
          u=""
          k="GNSS outage"
          color={outage ? 'var(--danger)' : undefined}
        />
      </div>

      {/* route progress */}
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
        <span>
          {m.s.toFixed(0)} / {ROUTE_LENGTH.toFixed(0)} m · {progress.toFixed(0)}%
        </span>
        <span style={{ color: 'var(--warn)' }}>SIMULATED VEHICLE</span>
      </div>
    </div>
  )
}

function Cell({ v, u, k, color }: { v: string; u: string; k: string; color?: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 15, lineHeight: 1.1, color: color ?? 'var(--text-hi)' }}>
        {v}
        {u && <span style={{ fontSize: 9, color: 'var(--text-mid)' }}> {u}</span>}
      </div>
      <div className="label" style={{ fontSize: 7.5 }}>
        {k}
      </div>
    </div>
  )
}
