'use client'

import type { NavState, Snapshot } from '@/lib/sim/types'
import type { UiMode } from '../AppShell'

const STATE_LABEL: Record<NavState, string> = {
  BOOT: 'BOOT',
  ALIGNING: 'ALIGNING',
  GNSS_ACTIVE: 'GNSS + DR',
  GNSS_DEGRADED: 'DEGRADED',
  DR_ACTIVE: 'DR ACTIVE',
  REACQUIRING: 'REACQUIRING',
  MOUNT_CHANGE: 'RE-ALIGNING',
}

const STATE_COLOR: Record<NavState, string> = {
  BOOT: 'var(--text-mid)',
  ALIGNING: 'var(--warn)',
  GNSS_ACTIVE: 'var(--ok)',
  GNSS_DEGRADED: 'var(--warn)',
  DR_ACTIVE: 'var(--drishti)',
  REACQUIRING: 'var(--accent)',
  MOUNT_CHANGE: 'var(--warn)',
}

export function ModePanel({
  snap,
  uiMode,
  scale = 1,
  whyMode,
}: {
  snap: Snapshot
  uiMode: UiMode
  scale?: number
  whyMode?: React.ReactNode
}) {
  const size = (uiMode === 'presentation' ? 34 : 24) * scale

  return (
    <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="label">Mode</span>
        {whyMode}
      </div>
      <div className="mono" style={{ fontSize: size, lineHeight: 1.15, marginTop: 3 }}>
        <span style={{ color: STATE_COLOR[snap.navState] }}>{STATE_LABEL[snap.navState]}</span>
      </div>
      <div className="provenance" style={{ marginTop: 3 }}>
        Filter state machine
      </div>
    </div>
  )
}
