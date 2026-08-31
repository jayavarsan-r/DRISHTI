'use client'

import { CHI2_2DOF_99 } from '@/lib/sim/constants'
import type { Snapshot } from '@/lib/sim/types'
import { Panel } from './Panel'

/**
 * Live chi-square gate. The NIS shown is always the real computed value — small
 * for genuine fixes, enormous for the spoof. Nothing here is special-cased.
 */
export function GnssIntegrityPanel({ snap }: { snap: Snapshot }) {
  const ig = snap.lastIntegrity
  // Log scale: a spoof produces a NIS four orders of magnitude past threshold,
  // which no linear axis can show alongside a nominal fix.
  const pos = (v: number) => Math.max(0, Math.min(1, Math.log10(Math.max(v, 0.01) + 1) / 4))

  return (
    <Panel
      title="GNSS integrity"
      provenance="NIS = νᵀS⁻¹ν computed per fix from filter covariance and receiver sigma"
      hot={ig ? !ig.accepted : false}
    >
      {!ig && <span className="provenance">No fix evaluated yet</span>}

      {ig && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label" style={{ fontSize: 9 }}>
              NIS
            </span>
            <span
              className="mono"
              style={{ fontSize: 22, color: ig.accepted ? 'var(--ok)' : 'var(--danger)' }}
            >
              {ig.nis < 10000 ? ig.nis.toFixed(2) : ig.nis.toExponential(2)}
            </span>
          </div>

          <div
            style={{
              position: 'relative',
              height: 9,
              marginTop: 7,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '0 auto 0 0',
                width: `${pos(ig.nis) * 100}%`,
                background: ig.accepted ? 'var(--ok)' : 'var(--danger)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: `${pos(CHI2_2DOF_99) * 100}%`,
                top: -3,
                bottom: -3,
                width: 1,
                background: 'var(--text-hi)',
              }}
            />
          </div>
          <div className="label" style={{ fontSize: 8, marginTop: 3, textAlign: 'right' }}>
            threshold χ² 2 DoF 99% = {CHI2_2DOF_99.toFixed(2)} · log scale
          </div>

          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row k="Innovation" v={`${ig.innovationMag.toFixed(1)} m`} />
            <Row k="Rejected this run" v={String(snap.rejectedCount)} />
            <Row
              k="Verdict"
              v={ig.accepted ? 'ACCEPT' : 'REJECT'}
              color={ig.accepted ? 'var(--ok)' : 'var(--danger)'}
            />
          </div>
          <div className="provenance" style={{ marginTop: 6 }}>
            {ig.reason}
          </div>
        </>
      )}
    </Panel>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="label" style={{ fontSize: 9 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: color ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}
