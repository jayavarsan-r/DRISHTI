'use client'

import { useEffect, useState } from 'react'
import type { MissionEventMessage } from '@/lib/link/protocol'

const TONE: Record<string, string> = {
  info: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
}

/**
 * Transient overlay for discrete mission events. Driven by one-shot event
 * messages from Mission Control, so the phone and laptop narrate the same
 * moment at the same time.
 */
export function EventToast({ event }: { event: MissionEventMessage | null }) {
  const [shown, setShown] = useState<MissionEventMessage | null>(null)

  useEffect(() => {
    if (!event) return
    setShown(event)
    const id = setTimeout(() => setShown(null), 3200)
    return () => clearTimeout(id)
  }, [event])

  if (!shown) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 92,
        left: 12,
        right: 12,
        padding: '10px 12px',
        background: 'rgba(11,20,32,0.95)',
        border: `1px solid ${TONE[shown.severity] ?? 'var(--border)'}`,
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      <div className="mono" style={{ fontSize: 11.5, color: TONE[shown.severity] ?? 'var(--text-hi)' }}>
        {shown.event}
      </div>
    </div>
  )
}
