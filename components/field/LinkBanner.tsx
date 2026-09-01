'use client'

import { useEffect, useRef, useState } from 'react'
import { mapTop } from './NavHud'
import type { LinkState } from '@/lib/link/protocol'

/**
 * Connection resilience, narrated.
 *
 * On a drop the map is deliberately NOT cleared: the last known mission state
 * stays on screen, frozen and labelled, rather than blanking or inventing
 * motion the server never sent.
 */
type Phase = null | 'LOST' | 'RESTORED' | 'SYNCING' | 'SYNCED'

export interface LinkNotice {
  tone: string
  text: string
  sub?: string
}

/**
 * The reconnection sequence plays out while the socket is CONNECTED, so the
 * caller has to keep this mounted across the transition. It returns null once
 * the link has settled, which is the whole of the steady state.
 */
export function useLinkNotice(state: LinkState, hasState: boolean): LinkNotice | null {
  const [phase, setPhase] = useState<Phase>(null)
  const prev = useRef<LinkState>(state)
  const everConnected = useRef(false)
  if (state === 'CONNECTED') everConnected.current = true

  useEffect(() => {
    const was = prev.current
    prev.current = state

    if (state !== 'CONNECTED' && was === 'CONNECTED') {
      setPhase('LOST')
      return
    }
    if (state === 'CONNECTED' && was !== 'CONNECTED') {
      setPhase('RESTORED')
      const a = setTimeout(() => setPhase('SYNCING'), 900)
      const b = setTimeout(() => setPhase('SYNCED'), 2100)
      const c = setTimeout(() => setPhase(null), 3400)
      return () => {
        clearTimeout(a)
        clearTimeout(b)
        clearTimeout(c)
      }
    }
  }, [state])

  if (state !== 'CONNECTED') {
    /*
     * Before the first successful connection there is nothing to have lost.
     * Reporting a drop that never happened is the same class of error as
     * reporting data that was never received.
     */
    if (!everConnected.current) {
      return {
        tone: 'var(--warn)',
        text: 'CONNECTING TO MISSION CONTROL',
        sub: 'Field link opening on the local network',
      }
    }
    return {
      tone: 'var(--danger)',
      text: 'FIELD LINK LOST',
      sub: hasState ? 'Showing last known state · frozen' : 'Reconnecting',
    }
  }

  if (phase === 'RESTORED') return { tone: 'var(--ok)', text: 'FIELD LINK RESTORED' }
  if (phase === 'SYNCING') return { tone: 'var(--warn)', text: 'SYNCHRONISING…' }
  if (phase === 'SYNCED') return { tone: 'var(--ok)', text: 'SYNC COMPLETE' }
  return null
}

export function LinkBanner({ notice }: { notice: LinkNotice }) {
  return <Bar tone={notice.tone} text={notice.text} sub={notice.sub} />
}

function Bar({ tone, text, sub }: { tone: string; text: string; sub?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        top: mapTop(96),
        zIndex: 5,
        padding: '9px 13px',
        background: 'rgba(11,20,32,0.96)',
        border: `1px solid ${tone}`,
        borderRadius: 6,
        pointerEvents: 'none',
      }}
    >
      <div className="mono" style={{ fontSize: 12.5, color: tone }}>
        {text}
      </div>
      {sub && (
        <div className="label" style={{ fontSize: 8.5, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/** Always-visible provenance strip: what is real, what is simulated. */
export function ProvenanceStrip({ linked, running }: { linked: boolean; running: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '6px 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-void)',
      }}
    >
      <span className="mono" style={{ fontSize: 8.5, color: linked ? 'var(--ok)' : 'var(--danger)' }}>
        ● REAL FIELD LINK {linked ? 'CONNECTED' : 'OFFLINE'}
      </span>
      <span style={{ flex: 1 }} />
      <span className="mono" style={{ fontSize: 8.5, color: 'var(--warn)' }}>
        ● SIMULATED NAVIGATION {running ? 'ACTIVE' : 'STANDBY'}
      </span>
    </div>
  )
}
