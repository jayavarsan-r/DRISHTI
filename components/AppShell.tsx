'use client'

import { useState } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { TrajectoryCanvas } from './TrajectoryCanvas'
import { useEngine, useSnapshot } from './useEngine'

export type UiMode = 'presentation' | 'technical'

export function AppShell() {
  const [uiMode] = useState<UiMode>('presentation')
  const snap = useSnapshot()
  const engine = useEngine()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header t={snap.t} rateHz={snap.rateHz} running={snap.running} flashing={false} />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: uiMode === 'presentation' ? '1fr 280px' : '1fr 340px',
          gap: 12,
          padding: 12,
        }}
      >
        <TrajectoryCanvas />
        <aside className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-title">Metric rail — Task 13</div>
          <div className="mono" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.9 }}>
            <div>state {snap.navState}</div>
            <div>err {snap.drishtiError.toFixed(1)} m</div>
            <div>naive {snap.naiveError.toFixed(0)} m</div>
            <div>dist {snap.distance.toFixed(0)} m</div>
          </div>
          <button
            onClick={() => engine.runJudgeDemo()}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '10px 0',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-hot)',
              borderRadius: 3,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              fontSize: 11,
            }}
          >
            ▶ RUN JUDGE DEMO
          </button>
        </aside>
      </main>

      <Footer />
    </div>
  )
}
