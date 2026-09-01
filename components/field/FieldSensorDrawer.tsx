'use client'

import { useState } from 'react'
import type { SensorSample } from '@/lib/link/protocol'

/**
 * Collapsible real-sensor drawer. Collapsed by default so the navigation screen
 * stays a navigation screen; expandable anywhere it is dropped in.
 */
export function FieldSensorDrawer({
  readout,
  hz,
  live,
  motionEnergy,
  connected,
}: {
  readout: SensorSample
  hz: number
  live: boolean
  motionEnergy: number
  connected: boolean
}) {
  const [open, setOpen] = useState(false)
  const band = motionEnergy > 0.55 ? 'HIGH' : motionEnergy > 0.18 ? 'MEDIUM' : 'LOW'
  const bandTone =
    motionEnergy > 0.55 ? 'var(--danger)' : motionEnergy > 0.18 ? 'var(--warn)' : 'var(--ok)'

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-hi)',
          textAlign: 'left',
        }}
      >
        <span className="label" style={{ fontSize: 9.5 }}>
          Field sensor
        </span>
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--ok)' }}>
          REAL
        </span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: live ? 'var(--ok)' : 'var(--danger)' }}>
          {live ? `${hz.toFixed(0)} Hz` : 'NO DATA'}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-mid)' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <Line k="Accel X / Y / Z" v={`${readout.accel.x.toFixed(2)}  ${readout.accel.y.toFixed(2)}  ${readout.accel.z.toFixed(2)}`} />
          <Line k="Gyro X / Y / Z" v={`${readout.gyro.x.toFixed(2)}  ${readout.gyro.y.toFixed(2)}  ${readout.gyro.z.toFixed(2)}`} />
          <Line
            k="Yaw / Pitch / Roll"
            v={`${readout.orientation.alpha.toFixed(0)}°  ${readout.orientation.beta.toFixed(0)}°  ${readout.orientation.gamma.toFixed(0)}°`}
          />
          <Line k="Link" v={connected ? 'CONNECTED' : 'OFFLINE'} tone={connected ? 'var(--ok)' : 'var(--danger)'} />

          <div style={{ marginTop: 8 }}>
            <div className="label" style={{ fontSize: 8.5, display: 'flex', justifyContent: 'space-between' }}>
              <span>Motion energy</span>
              <span style={{ color: bandTone }}>{live ? band : 'NO DATA'}</span>
            </div>
            <div
              style={{
                height: 7,
                marginTop: 3,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${motionEnergy * 100}%`, height: '100%', background: bandTone }} />
            </div>
          </div>

          <div className="provenance" style={{ marginTop: 8 }}>
            Real handset sensors · phone motion, not vehicle dynamics
          </div>
        </div>
      )}
    </div>
  )
}

function Line({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span className="label" style={{ fontSize: 8.5 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: tone ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}
