'use client'

import type { Snapshot } from '@/lib/sim/types'
import { Panel, Bar } from './Panel'

/**
 * Labelled SIMULATED everywhere it appears. This is a modelled stand-in for a
 * TCN that has not been trained — there is no training accuracy to show, and
 * showing one would be a fabrication.
 */
export function SpeedModelPanel({ snap }: { snap: Snapshot }) {
  const i = snap.imu
  const mag = Math.hypot(i.accelX, i.accelY, i.accelZ)

  return (
    <Panel
      title="Speed model (simulated)"
      provenance="Modelled stand-in for a TCN · not a trained network · inputs from synthetic IMU at 100 Hz"
      hot={snap.shockActive}
    >
      <Bar label="gyro Z" value={i.gyroZ} max={1.2} color="var(--accent)" unit="r/s" />
      <Bar label="accel X" value={i.accelX} max={6} color="var(--drishti)" unit="m/s²" />
      <Bar label="accel Y" value={i.accelY} max={6} color="var(--drishti)" unit="m/s²" />
      <Bar label="accel Z" value={i.accelZ} max={20} color="var(--drishti)" unit="m/s²" />
      <Bar label="|a|" value={mag} max={20} color="var(--text-mid)" unit="m/s²" />
      <Bar
        label="sigma v"
        value={snap.speed.sigmaV}
        max={2}
        color={snap.shockActive ? 'var(--danger)' : 'var(--ok)'}
        unit="m/s"
      />

      <div
        style={{
          marginTop: 9,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span className="label" style={{ fontSize: 9 }}>
          Estimate
        </span>
        <span className="mono" style={{ fontSize: 18 }}>
          {snap.speed.vHat.toFixed(2)}
          <span style={{ fontSize: 10, color: 'var(--text-mid)' }}> m/s</span>
        </span>
      </div>

      {snap.shockActive && (
        <div
          className="mono"
          style={{ marginTop: 6, fontSize: 10, color: 'var(--danger)' }}
        >
          ⚠ SHOCK DETECTED · sigma inflated, estimate down-weighted
        </div>
      )}
    </Panel>
  )
}
