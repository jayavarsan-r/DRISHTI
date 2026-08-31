'use client'

import type { LogEntry, Severity, Snapshot } from '@/lib/sim/types'
import type { UiMode } from '../AppShell'

const GLYPH: Record<Severity, string> = { info: '●', warn: '⚠', error: '✕', ok: '✓' }
const COLOR: Record<Severity, string> = {
  info: 'var(--text-mid)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
  ok: 'var(--ok)',
}

/**
 * Entries come from the engine's log, which is appended to at the moment each
 * event actually occurs. Nothing here is synthesised in the component, and the
 * timestamps derive from sim time so they reproduce exactly across runs.
 */
export function EventLog({
  snap,
  uiMode,
  onWhyRejected,
}: {
  snap: Snapshot
  uiMode: UiMode
  onWhyRejected?: (e: LogEntry) => void
}) {
  const entries = uiMode === 'presentation' ? snap.log.slice(-5) : snap.log.slice().reverse()

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="panel-title" style={{ fontSize: 11 }}>
        Event log
      </div>
      <div
        style={{
          marginTop: 8,
          maxHeight: uiMode === 'presentation' ? undefined : 240,
          overflowY: uiMode === 'presentation' ? 'visible' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {entries.length === 0 && (
          <span className="provenance">No events yet — press RUN JUDGE DEMO</span>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="mono"
            style={{ fontSize: 10, display: 'flex', gap: 6, alignItems: 'baseline' }}
          >
            <span style={{ color: COLOR[e.severity] }}>{GLYPH[e.severity]}</span>
            <span style={{ color: 'var(--text-lo)' }}>{e.clock}</span>
            <span style={{ color: e.severity === 'info' ? 'var(--text-mid)' : COLOR[e.severity] }}>
              {e.message}
            </span>
            {e.message.includes('REJECTED') && onWhyRejected && (
              <button
                onClick={() => onWhyRejected(e)}
                title="Why was the fix rejected?"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-hot)',
                  borderRadius: 2,
                  color: 'var(--accent)',
                  fontSize: 8.5,
                  padding: '0 4px',
                  lineHeight: 1.5,
                }}
              >
                ?
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="provenance" style={{ marginTop: 8 }}>
        Timestamps derived from simulation clock
      </div>
    </div>
  )
}
