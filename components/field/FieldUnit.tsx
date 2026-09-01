'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLink } from '@/lib/link/useLink'
import { useSensors } from '@/lib/link/useSensors'
import {
  accelMagnitude,
  gyroMagnitude,
  type CommandName,
  type LinkMessage,
  type MissionEventMessage,
} from '@/lib/link/protocol'
import { Attitude } from './Attitude'
import { SensorGraph } from './SensorGraph'

const NODE_ID = 'FIELD-UNIT-01'
/** Transmission rate. Sensor capture runs faster; packets are batched to this. */
const TX_HZ = 20
/** Numeric readouts refresh here — well below the sensor rate, above human read speed. */
const UI_HZ = 15

const COMMANDS: { cmd: CommandName; label: string; tone?: 'danger' | 'warn' }[] = [
  { cmd: 'START_MISSION', label: 'Start mission' },
  { cmd: 'GNSS_DENIED', label: 'GNSS blackout', tone: 'danger' },
  { cmd: 'GNSS_SPOOFED', label: 'GNSS spoof', tone: 'danger' },
  { cmd: 'POTHOLE', label: 'Pothole', tone: 'warn' },
  { cmd: 'PHONE_SLIP', label: 'Phone slip', tone: 'warn' },
  { cmd: 'GNSS_RECOVERY', label: 'GNSS recovery' },
  { cmd: 'RESET_MISSION', label: 'Reset' },
]

export function FieldUnit() {
  const { status, enable, latest, drain, recent } = useSensors()
  const [mission, setMission] = useState<MissionEventMessage | null>(null)
  const [lastCommand, setLastCommand] = useState<{ cmd: CommandName; acked: boolean } | null>(null)
  const [readout, setReadout] = useState(() => latest.current)
  const [motionEnergy, setMotionEnergy] = useState(0)

  const onMessage = useCallback((m: LinkMessage) => {
    if (m.type === 'event') setMission(m)
    if (m.type === 'command_ack') {
      setLastCommand((c) => (c && c.cmd === m.command ? { ...c, acked: true } : c))
    }
  }, [])

  const { stats, send } = useLink({ role: 'field', nodeId: NODE_ID, onMessage })

  const seq = useRef(0)
  const yawRef = useRef<SVGGElement>(null)
  const pitchRef = useRef<SVGGElement>(null)
  const rollRef = useRef<SVGGElement>(null)

  // Transmit batched samples. Sensor events themselves never touch React.
  useEffect(() => {
    if (status.permission !== 'granted') return
    const id = setInterval(() => {
      const batch = drain()
      send({
        type: 'sensor',
        nodeId: NODE_ID,
        sequence: seq.current++,
        sensorHz: status.hz,
        latest: latest.current,
        batch,
        sensorsLive: status.live,
      })
    }, 1000 / TX_HZ)
    return () => clearInterval(id)
  }, [status.permission, status.hz, status.live, drain, send, latest])

  // Numeric readout + attitude, driven off a timer rather than sensor events.
  useEffect(() => {
    const id = setInterval(() => {
      const s = latest.current
      setReadout({ ...s, accel: { ...s.accel }, gyro: { ...s.gyro }, orientation: { ...s.orientation } })

      /*
       * Motion energy is |a| - g averaged over recent samples. That baseline
       * assumes gravity is actually present: a degenerate all-zero sample
       * scores a full 9.81 and the meter pegs HIGH on no data at all. Require
       * both a live stream and a plausible gravity reading.
       */
      const win = recent(30).filter((x) => accelMagnitude(x) > 1)
      if (status.live && win.length > 0) {
        const avg = win.reduce((a, x) => a + Math.abs(accelMagnitude(x) - 9.81), 0) / win.length
        setMotionEnergy(Math.min(1, avg / 6))
      } else {
        setMotionEnergy(0)
      }

      yawRef.current?.setAttribute('transform', `rotate(${-s.orientation.alpha})`)
      pitchRef.current?.setAttribute('transform', `scale(1, ${Math.cos((s.orientation.beta * Math.PI) / 180).toFixed(3)})`)
      rollRef.current?.setAttribute('transform', `rotate(${s.orientation.gamma})`)
    }, 1000 / UI_HZ)
    return () => clearInterval(id)
  }, [latest, recent, status.live])

  const fire = (cmd: CommandName) => {
    setLastCommand({ cmd, acked: false })
    send({ type: 'command', nodeId: NODE_ID, command: cmd, timestamp: Date.now() })
    if ('vibrate' in navigator) navigator.vibrate?.(18)
  }

  const linkOk = stats.state === 'CONNECTED'

  if (status.permission !== 'granted') {
    return <PermissionGate status={status} onEnable={enable} linkState={stats.state} />
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-void)',
        padding: 'max(10px, env(safe-area-inset-top)) 10px max(14px, env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* header */}
      <div className="panel" style={{ padding: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.16em' }}>DRISHTI</div>
            <div className="label" style={{ fontSize: 9.5 }}>
              Field unit · SIH26168
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              className="mono"
              style={{ fontSize: 11, color: linkOk ? 'var(--ok)' : 'var(--danger)' }}
            >
              ● {stats.state}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-lo)' }}>
              {NODE_ID}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 9,
            paddingTop: 8,
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 6,
          }}
        >
          <Stat label="Sensor" value={`${status.hz.toFixed(0)} Hz`} ok={status.live} />
          <Stat label="Latency" value={stats.latencyMs === null ? '—' : `${stats.latencyMs} ms`} />
          <Stat label="TX" value={stats.tx.toLocaleString()} />
          <Stat label="RX" value={stats.rx.toLocaleString()} />
        </div>

        <div
          className="provenance"
          style={{ marginTop: 8, color: 'var(--warn)', fontSize: 9 }}
        >
          REAL SENSOR TELEMETRY · navigation downstream is SIMULATED
        </div>
      </div>

      {!status.live && (
        <div
          className="panel"
          style={{ padding: 11, borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.07)' }}
        >
          <div className="label" style={{ fontSize: 9.5, color: 'var(--danger)' }}>
            No sensor events
          </div>
          <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-mid)', margin: '5px 0 0' }}>
            Access was granted but this browser is delivering no motion events, so every
            reading below is zero — not a measurement. On a desktop browser there is no
            sensor hardware; on a phone, check the page is served over https.
          </p>
        </div>
      )}

      {/* mission mirror */}
      <div className="panel" style={{ padding: 11 }}>
        <div className="label" style={{ fontSize: 9 }}>
          Mission control (simulated)
        </div>
        {!mission && (
          <div className="provenance" style={{ marginTop: 5 }}>
            {stats.peerConnected ? 'Awaiting mission state…' : 'Mission Control not connected'}
          </div>
        )}
        {mission && (
          <div
            style={{
              marginTop: 7,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 7,
            }}
          >
            <Big label="GNSS" value={mission.gnssMode} tone={mission.gnssMode === 'DENIED' ? 'danger' : 'ok'} />
            <Big label="Mode" value={mission.navState.replace('_', ' ')} tone="accent" />
            <Big label="Error / dist" value={`${(mission.errorFraction * 100).toFixed(2)} %`} />
            <Big label="Uncertainty" value={`${mission.uncertainty.toFixed(1)} m`} />
          </div>
        )}
        {mission && (
          <div className="provenance" style={{ marginTop: 7 }}>
            Last event · {mission.event}
          </div>
        )}
      </div>

      {/* attitude */}
      <div className="panel" style={{ padding: 11 }}>
        <div className="label" style={{ fontSize: 9 }}>
          Phone attitude · real orientation
        </div>
        <Attitude yawRef={yawRef} pitchRef={pitchRef} rollRef={rollRef} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
          <Big label="Azimuth" value={`${readout.orientation.alpha.toFixed(1)}°`} />
          <Big label="Pitch" value={`${readout.orientation.beta.toFixed(1)}°`} />
          <Big label="Roll" value={`${readout.orientation.gamma.toFixed(1)}°`} />
        </div>
        <div className="provenance" style={{ marginTop: 7 }}>
          Phone sensor frame · not the vehicle frame
        </div>
      </div>

      {/* motion energy */}
      <div className="panel" style={{ padding: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="label" style={{ fontSize: 9 }}>
            Motion energy
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-mid)' }}>
            {!status.live
              ? 'NO DATA'
              : motionEnergy > 0.55
                ? 'HIGH'
                : motionEnergy > 0.18
                  ? 'MEDIUM'
                  : 'LOW'}
          </span>
        </div>
        <div
          style={{
            height: 10,
            marginTop: 6,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${motionEnergy * 100}%`,
              height: '100%',
              background:
                motionEnergy > 0.55 ? 'var(--danger)' : motionEnergy > 0.18 ? 'var(--warn)' : 'var(--ok)',
              transition: 'width 90ms linear',
            }}
          />
        </div>
        <div className="provenance" style={{ marginTop: 6 }}>
          |a| − g averaged over 30 real samples · phone motion, not vehicle dynamics
        </div>
      </div>

      {/* telemetry */}
      <div className="panel" style={{ padding: 11 }}>
        <div className="label" style={{ fontSize: 9 }}>
          Acceleration · m/s²
        </div>
        <Triple a={readout.accel.x} b={readout.accel.y} c={readout.accel.z} />
        <SensorGraph recent={recent} pick={(s) => s.accel.x} label="ACC X" color="var(--drishti)" scale={20} />
        <SensorGraph recent={recent} pick={(s) => s.accel.y} label="ACC Y" color="var(--drishti)" scale={20} />
        <SensorGraph recent={recent} pick={(s) => s.accel.z} label="ACC Z" color="var(--drishti)" scale={20} />

        <div className="label" style={{ fontSize: 9, marginTop: 10 }}>
          Rotation rate · °/s
        </div>
        <Triple a={readout.gyro.x} b={readout.gyro.y} c={readout.gyro.z} />
        <SensorGraph recent={recent} pick={(s) => s.gyro.x} label="GYRO X" color="var(--accent)" scale={200} />
        <SensorGraph recent={recent} pick={(s) => s.gyro.y} label="GYRO Y" color="var(--accent)" scale={200} />
        <SensorGraph recent={recent} pick={(s) => s.gyro.z} label="GYRO Z" color="var(--accent)" scale={200} />

        <div className="provenance" style={{ marginTop: 8 }}>
          Raw values from DeviceMotionEvent · unmodified
        </div>
      </div>

      {/* commands */}
      <div className="panel" style={{ padding: 11 }}>
        <div className="label" style={{ fontSize: 9 }}>
          Mission command
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {COMMANDS.map((c) => (
            <button
              key={c.cmd}
              onClick={() => fire(c.cmd)}
              disabled={!linkOk}
              style={{
                width: '100%',
                minHeight: 46,
                background: 'var(--bg-raised)',
                border: `1px solid ${
                  c.tone === 'danger'
                    ? 'var(--danger)'
                    : c.tone === 'warn'
                      ? 'var(--warn)'
                      : 'var(--border-hot)'
                }`,
                borderRadius: 3,
                color:
                  c.tone === 'danger'
                    ? 'var(--danger)'
                    : c.tone === 'warn'
                      ? 'var(--warn)'
                      : 'var(--accent)',
                fontSize: 12.5,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                fontWeight: 600,
                opacity: linkOk ? 1 : 0.4,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        {lastCommand && (
          <div className="mono" style={{ marginTop: 9, fontSize: 10.5 }}>
            <span style={{ color: 'var(--text-lo)' }}>SENT </span>
            <span>{lastCommand.cmd}</span>{' '}
            <span style={{ color: lastCommand.acked ? 'var(--ok)' : 'var(--warn)' }}>
              {lastCommand.acked ? '✓ ACK' : '… awaiting ack'}
            </span>
          </div>
        )}
        <div className="provenance" style={{ marginTop: 8 }}>
          Commands are real · the scenario they trigger is simulated
        </div>
      </div>

      <div className="provenance" style={{ textAlign: 'center', paddingBottom: 6 }}>
        DRISHTI DEMONSTRATION BUILD · Real phone sensors, simulated navigation ·
        No measured benchmark claims
      </div>
    </div>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div className="label" style={{ fontSize: 7.5 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 11, color: ok === false ? 'var(--danger)' : 'var(--text-hi)' }}
      >
        {value}
      </div>
    </div>
  )
}

function Big({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'danger' | 'accent'
}) {
  const color =
    tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : tone === 'ok' ? 'var(--ok)' : 'var(--text-hi)'
  return (
    <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 3, padding: '6px 8px' }}>
      <div className="label" style={{ fontSize: 7.5 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 15, color }}>
        {value}
      </div>
    </div>
  )
}

function Triple({ a, b, c }: { a: number; b: number; c: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, margin: '6px 0 8px' }}>
      {[
        ['X', a],
        ['Y', b],
        ['Z', c],
      ].map(([k, v]) => (
        <div key={k as string}>
          <span className="label" style={{ fontSize: 7.5 }}>
            {k as string}
          </span>
          <div className="mono" style={{ fontSize: 14 }}>
            {(v as number) >= 0 ? '+' : ''}
            {(v as number).toFixed(3)}
          </div>
        </div>
      ))}
    </div>
  )
}

function PermissionGate({
  status,
  onEnable,
  linkState,
}: {
  status: ReturnType<typeof useSensors>['status']
  onEnable: () => void
  linkState: string
}) {
  // Read after mount: window.isSecureContext does not exist during SSR, and
  // rendering it directly makes the server emit "no" where the client emits
  // "yes", which React reports as a hydration mismatch.
  const [secure, setSecure] = useState<boolean | null>(null)
  useEffect(() => setSecure(window.isSecureContext), [])

  const blocked = status.permission === 'insecure' || status.permission === 'unsupported'
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-void)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 16,
        padding: 22,
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.16em' }}>DRISHTI</div>
        <div className="label" style={{ fontSize: 11 }}>
          Field unit · SIH26168
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-title" style={{ fontSize: 12 }}>
          Motion sensor access
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-mid)', marginTop: 9 }}>
          This demonstration streams your phone&apos;s real accelerometer, gyroscope and
          orientation to Mission Control over a local WebSocket. Nothing leaves your
          network and nothing is recorded.
        </p>

        {status.reason && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              border: '1px solid var(--danger)',
              borderRadius: 3,
              background: 'rgba(239,68,68,0.07)',
            }}
          >
            <div className="label" style={{ fontSize: 9, color: 'var(--danger)' }}>
              {status.permission === 'insecure' ? 'Insecure context' : 'Sensors unavailable'}
            </div>
            <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-mid)', margin: '5px 0 0' }}>
              {status.reason}
            </p>
            {status.permission === 'insecure' && (
              <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-lo)', margin: '8px 0 0' }}>
                Fix: open this page over <b>https</b> (run <span className="mono">npm run cert</span> on
                the laptop, then accept the certificate warning), or allow this exact origin
                in <span className="mono">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span>.
              </p>
            )}
          </div>
        )}

        {!blocked && (
          <button
            onClick={onEnable}
            style={{
              marginTop: 14,
              width: '100%',
              minHeight: 52,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-hot)',
              borderRadius: 3,
              color: 'var(--accent)',
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {status.permission === 'denied' ? 'Try again' : 'Enable sensor access'}
          </button>
        )}

        <div className="provenance" style={{ marginTop: 12 }}>
          Link {linkState} · secure context {secure === null ? '…' : secure ? 'yes' : 'no'}
        </div>
      </div>
    </div>
  )
}
