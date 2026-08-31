'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { TimelineStrip } from './TimelineStrip'
import { ControlBar } from './ControlBar'
import { TrajectoryCanvas } from './TrajectoryCanvas'
import { MetricRail } from './rail/MetricRail'
import { EventLog } from './rail/EventLog'
import { WhyModePopover, WhyRejectedPopover } from './rail/WhyPopover'
import { useEngine, useSnapshot } from './useEngine'

export type UiMode = 'presentation' | 'technical'

export function AppShell() {
  const [uiMode, setUiMode] = useState<UiMode>('presentation')
  const [flashing, setFlashing] = useState(false)
  const [why, setWhy] = useState<null | 'mode' | 'rejected'>(null)
  const snap = useSnapshot()
  const engine = useEngine()

  // Header flashes once on entry to DR_ACTIVE. Latched on the transition so a
  // re-render cannot retrigger it.
  const prevState = useRef(snap.navState)
  useEffect(() => {
    if (prevState.current !== 'DR_ACTIVE' && snap.navState === 'DR_ACTIVE') {
      setFlashing(true)
      const id = setTimeout(() => setFlashing(false), 700)
      prevState.current = snap.navState
      return () => clearTimeout(id)
    }
    prevState.current = snap.navState
  }, [snap.navState])

  const onNewRun = useCallback(() => {
    // A fresh seed must itself be reproducible to report, so derive it from the
    // clock once and show it rather than reseeding invisibly.
    engine.reset(Math.floor(Date.now() % 2147483647))
    engine.runJudgeDemo()
  }, [engine])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header t={snap.t} rateHz={snap.rateHz} running={snap.running} flashing={flashing} />
      <TimelineStrip snap={snap} />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: uiMode === 'presentation' ? '1fr 300px' : '1fr 360px',
          gap: 12,
          padding: 12,
        }}
      >
        <TrajectoryCanvas />
        <aside
          style={{
            overflowY: 'auto',
            paddingRight: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            position: 'relative',
          }}
        >
          <MetricRail
            snap={snap}
            uiMode={uiMode}
            whyMode={
              <button
                onClick={() => setWhy(why === 'mode' ? null : 'mode')}
                title="Why is the filter in this mode?"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-hot)',
                  borderRadius: 2,
                  color: 'var(--accent)',
                  fontSize: 9,
                  padding: '0 5px',
                  lineHeight: 1.6,
                }}
              >
                ?
              </button>
            }
          />
          <EventLog
            snap={snap}
            uiMode={uiMode}
            onWhyRejected={() => setWhy(why === 'rejected' ? null : 'rejected')}
          />
          {why === 'mode' && <WhyModePopover snap={snap} onClose={() => setWhy(null)} />}
          {why === 'rejected' && <WhyRejectedPopover snap={snap} onClose={() => setWhy(null)} />}
        </aside>
      </main>

      <ControlBar
        engine={engine}
        snap={snap}
        uiMode={uiMode}
        setUiMode={setUiMode}
        onNewRun={onNewRun}
      />
      <Footer />
    </div>
  )
}
