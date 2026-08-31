'use client'

import { useEffect } from 'react'
import type { Engine } from '@/lib/sim/engine'
import type { GnssMode, Snapshot } from '@/lib/sim/types'
import type { UiMode } from './AppShell'

const GNSS_CYCLE: GnssMode[] = ['NOMINAL', 'DEGRADED', 'DENIED', 'SPOOFED']

export function useKeyboard({
  engine,
  snap,
  setUiMode,
  toggleFullscreen,
}: {
  engine: Engine
  snap: Snapshot
  setUiMode: (m: UiMode) => void
  toggleFullscreen: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // never hijack typing in a form control
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          snap.running ? engine.pause() : engine.play()
          break
        case 'r':
          engine.reset()
          break
        case 'j':
          setUiMode('presentation')
          break
        case 't':
          setUiMode('technical')
          break
        case 'f':
          toggleFullscreen()
          break
        case 'g': {
          const i = GNSS_CYCLE.indexOf(snap.gnssMode)
          engine.setGnssMode(GNSS_CYCLE[(i + 1) % GNSS_CYCLE.length])
          break
        }
        case 'p':
          engine.firePothole()
          break
        case 's':
          engine.firePhoneSlip()
          break
        case 'a':
          engine.setAblation({ aiSpeed: !snap.ablation.aiSpeed })
          break
        case 'm':
          engine.setAblation({ map: !snap.ablation.map })
          break
        case 'n':
          engine.setAblation({ nhc: !snap.ablation.nhc })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, snap, setUiMode, toggleFullscreen])
}
