'use client'

import type { GnssMode, Snapshot } from '@/lib/sim/types'
import type { Engine } from '@/lib/sim/engine'
import type { UiMode } from './AppShell'

const GNSS_MODES: GnssMode[] = ['NOMINAL', 'DEGRADED', 'DENIED', 'SPOOFED']

function Btn({
  onClick,
  children,
  primary,
  active,
  title,
}: {
  onClick: () => void
  children: React.ReactNode
  primary?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: primary ? '9px 20px' : '6px 12px',
        background: active ? 'var(--border-hot)' : 'var(--bg-raised)',
        border: `1px solid ${primary || active ? 'var(--border-hot)' : 'var(--border)'}`,
        borderRadius: 3,
        color: primary ? 'var(--accent)' : active ? 'var(--text-hi)' : 'var(--text-mid)',
        fontSize: primary ? 12 : 10,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        fontWeight: primary ? 700 : 500,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function ControlBar({
  engine,
  snap,
  uiMode,
  setUiMode,
  onNewRun,
  onEvidence,
}: {
  engine: Engine
  snap: Snapshot
  uiMode: UiMode
  setUiMode: (m: UiMode) => void
  onNewRun: () => void
  onEvidence: () => void
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        margin: '0 12px 12px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        // the only shadow permitted in the design system
        boxShadow: '0 6px 22px rgba(0,0,0,0.55)',
        flexWrap: 'wrap',
      }}
    >
      <Btn primary onClick={() => engine.runJudgeDemo()}>
        ▶ Run judge demo
      </Btn>
      <Btn onClick={() => (snap.running ? engine.pause() : engine.play())}>
        {snap.running ? '❚❚ Pause' : '▶ Play'}
      </Btn>
      <Btn onClick={() => engine.reset()} title="Re-seeds to the default seed">
        Reset
      </Btn>
      {/* <Btn onClick={onNewRun} title="Generates a fresh seed">
        New run
      </Btn> */}

      <span className="mono provenance" style={{ fontSize: 10 }}>
        SEED {snap.seed}
      </span>

      <span style={{ flex: 1 }} />

      <Btn onClick={onEvidence} title="Methodology — how this works and what is not claimed">
        Methodology
      </Btn>
      <Btn
        active={uiMode === 'technical'}
        onClick={() => setUiMode(uiMode === 'technical' ? 'presentation' : 'technical')}
      >
        {uiMode === 'technical' ? 'Presentation' : 'Technical'}
      </Btn>

      {uiMode === 'technical' && (
        <>
          <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <span className="label" style={{ fontSize: 9 }}>
            GNSS
          </span>
          <span style={{ display: 'flex', gap: 3 }}>
            {GNSS_MODES.map((m) => (
              <Btn key={m} active={snap.gnssMode === m} onClick={() => engine.setGnssMode(m)}>
                {m}
              </Btn>
            ))}
          </span>
          <Btn onClick={() => engine.firePothole()}>Pothole</Btn>
          <Btn onClick={() => engine.firePhoneSlip()}>Phone slip 30°</Btn>
        </>
      )}
    </div>
  )
}
