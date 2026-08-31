'use client'

import { useEffect, useState } from 'react'
import type { Snapshot } from '@/lib/sim/types'

/**
 * Fires once per run. The latch lives in the engine (baselineFailureAt), so a
 * re-render cannot retrigger it; this component only decides how long to show
 * it after that timestamp appears.
 */
export function BaselineFailureBanner({ snap }: { snap: Snapshot }) {
  const at = snap.baselineFailureAt
  const [dismissed, setDismissed] = useState(false)
  const [errorAt, setErrorAt] = useState<number | null>(null)

  useEffect(() => {
    if (at === null) {
      setDismissed(false)
      setErrorAt(null)
      return
    }
    if (errorAt === null) setErrorAt(snap.naiveError)
    const id = setTimeout(() => setDismissed(true), 4000)
    return () => clearTimeout(id)
    // deliberately keyed on `at` only: this must run once per latch, not per frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  if (at === null || dismissed) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        background: 'rgba(5,9,15,0.92)',
        border: '1px solid var(--naive)',
        borderRadius: 4,
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        className="label"
        style={{ color: 'var(--naive)', fontSize: 11, letterSpacing: '0.12em' }}
      >
        Baseline failure — naive INS outside road network
      </div>
      <div className="mono" style={{ fontSize: 20, color: 'var(--naive)', marginTop: 5 }}>
        error {(errorAt ?? snap.naiveError).toFixed(0)} m
      </div>
    </div>
  )
}
