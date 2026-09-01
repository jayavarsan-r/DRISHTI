'use client'

import { Panel } from '../panels/Panel'
import { FieldCompass } from './FieldCompass'
import { LinkFlow } from './LinkFlow'
import type { LinkStats } from '@/lib/link/useLink'
import type { FieldTelemetry } from '@/lib/link/useMissionLink'

const STATE_COLOR: Record<string, string> = {
  CONNECTED: 'var(--ok)',
  CONNECTING: 'var(--warn)',
  RECONNECTING: 'var(--warn)',
  DISCONNECTED: 'var(--text-lo)',
  ERROR: 'var(--danger)',
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="label" style={{ fontSize: 8.5 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: color ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}

/**
 * FIELD UNIT — the only panel in Mission Control fed by real hardware.
 *
 * Everything here is measured: connection state from the socket, packet counts
 * from the client, latency from a heartbeat echo, sample rate from real event
 * timestamps. When the phone is absent the panel says so rather than idling on
 * stale numbers.
 */
export function FieldUnitPanel({
  stats,
  telemetry,
  orientationRef,
}: {
  stats: LinkStats
  telemetry: FieldTelemetry | null
  orientationRef: React.RefObject<{ alpha: number; beta: number; gamma: number }>
}) {
  const peer = stats.peerConnected
  const live = peer && (telemetry?.sensorsLive ?? false)

  return (
    <Panel
      title="Field unit — real sensor link"
      provenance="Phone accelerometer, gyroscope and orientation over LAN WebSocket · REAL hardware · phone orientation drives this panel only, never the estimator"
      hot={peer}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          className="mono"
          style={{ fontSize: 13, color: peer ? 'var(--ok)' : STATE_COLOR[stats.state] }}
        >
          ● {peer ? 'ONLINE' : stats.state}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-lo)' }}>
          {stats.peerNodeId ?? telemetry?.nodeId ?? 'FIELD-UNIT-01'}
        </span>
      </div>

      <div style={{ marginTop: 9 }}>
        <LinkFlow stats={stats} width={280} />
      </div>

      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Row k="Link state" v={stats.state} color={STATE_COLOR[stats.state]} />
        <Row
          k="Sensor rate"
          v={live ? `${telemetry!.sensorHz.toFixed(1)} Hz` : '—'}
          color={live ? 'var(--ok)' : 'var(--text-lo)'}
        />
        <Row
          k="Latency (RTT)"
          v={stats.latencyMs === null ? '—' : `${stats.latencyMs} ms`}
        />
        <Row k="Packets RX" v={stats.rx.toLocaleString()} />
        <Row k="Packets TX" v={stats.tx.toLocaleString()} />
        <Row k="Rate" v={`${stats.rxPerSec} pkt/s`} />
        <Row k="Reconnects" v={String(stats.reconnects)} />
      </div>

      {!peer && (
        <div className="provenance" style={{ marginTop: 9, color: 'var(--warn)' }}>
          No field unit attached. Open /field on a phone over https on this network.
        </div>
      )}

      {peer && (
        <>
          <div
            style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)' }}
          >
            <div className="label" style={{ fontSize: 9 }}>
              Field orientation link · real phone sensor
            </div>
            <div style={{ marginTop: 7 }}>
              <FieldCompass orientationRef={orientationRef} live={live} />
            </div>
          </div>

          {telemetry && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Row
                k="Accel X / Y / Z"
                v={`${telemetry.accel.x.toFixed(2)} ${telemetry.accel.y.toFixed(2)} ${telemetry.accel.z.toFixed(2)}`}
              />
              <Row
                k="Gyro X / Y / Z"
                v={`${telemetry.gyro.x.toFixed(2)} ${telemetry.gyro.y.toFixed(2)} ${telemetry.gyro.z.toFixed(2)}`}
              />
              <div style={{ marginTop: 5 }}>
                <div
                  className="label"
                  style={{ fontSize: 8.5, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>Phone motion energy</span>
                  <span style={{ color: 'var(--text-lo)' }}>
                    {telemetry.motionEnergy > 0.55
                      ? 'HIGH'
                      : telemetry.motionEnergy > 0.18
                        ? 'MEDIUM'
                        : 'LOW'}
                  </span>
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
                  <div
                    style={{
                      width: `${telemetry.motionEnergy * 100}%`,
                      height: '100%',
                      background:
                        telemetry.motionEnergy > 0.55
                          ? 'var(--danger)'
                          : telemetry.motionEnergy > 0.18
                            ? 'var(--warn)'
                            : 'var(--ok)',
                      transition: 'width 90ms linear',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {!live && (
            <div className="provenance" style={{ marginTop: 8, color: 'var(--danger)' }}>
              Field unit attached but delivering no sensor events — check the phone is on
              https and motion access was granted.
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
