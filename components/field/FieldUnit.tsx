'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLink } from '@/lib/link/useLink'
import { useSensors } from '@/lib/link/useSensors'
import {
  accelMagnitude,
  type CommandName,
  type LinkMessage,
  type MissionEventMessage,
  type MissionStateMessage,
} from '@/lib/link/protocol'
import { NavMap, type CameraMode } from './NavMap'
import { NavTopBar, NavHud } from './NavHud'
import { EventToast } from './EventToast'
import { Attitude } from './Attitude'
import { SensorGraph } from './SensorGraph'

const NODE_ID = 'FIELD-UNIT-01'
const TX_HZ = 20
const UI_HZ = 12

type Tab = 'navigate' | 'status' | 'sensors' | 'mission'

export function FieldUnit() {
  const { status, diag, enable, latest, drain, recent } = useSensors()
  const [tab, setTab] = useState<Tab>('navigate')
  const [camera, setCamera] = useState<CameraMode>('heading-up')
  const [follow, setFollow] = useState(true)

  const [mission, setMission] = useState<MissionStateMessage | null>(null)
  const [event, setEvent] = useState<MissionEventMessage | null>(null)
  const [readout, setReadout] = useState(() => latest.current)
  const [motionEnergy, setMotionEnergy] = useState(0)

  /** Authoritative state, kept in a ref so the map animates without renders. */
  const missionRef = useRef<MissionStateMessage | null>(null)

  const onMessage = useCallback((m: LinkMessage) => {
    if (m.type === 'mission') {
      missionRef.current = m
      return
    }
    if (m.type === 'event') setEvent(m)
  }, [])

  const { stats, send } = useLink({ role: 'field', nodeId: NODE_ID, onMessage })

  const seq = useRef(0)
  const yawRef = useRef<SVGGElement>(null)
  const pitchRef = useRef<SVGGElement>(null)
  const rollRef = useRef<SVGGElement>(null)

  // Sensor transmission. Runs regardless of gate state so Mission Control can
  // always see whether this handset is producing anything.
  useEffect(() => {
    const id = setInterval(() => {
      send({
        type: 'sensor',
        nodeId: NODE_ID,
        sequence: seq.current++,
        sensorHz: status.hz,
        latest: latest.current,
        batch: drain(),
        sensorsLive: status.live,
      })
    }, 1000 / TX_HZ)
    return () => clearInterval(id)
  }, [status.hz, status.live, drain, send, latest])

  // Numeric readouts and the attitude widget, off a timer rather than events.
  useEffect(() => {
    const id = setInterval(() => {
      const s = latest.current
      setReadout({
        ...s,
        accel: { ...s.accel },
        gyro: { ...s.gyro },
        orientation: { ...s.orientation },
      })
      setMission(missionRef.current)

      const win = recent(30).filter((x) => accelMagnitude(x) > 1)
      setMotionEnergy(
        status.live && win.length
          ? Math.min(1, win.reduce((a, x) => a + Math.abs(accelMagnitude(x) - 9.81), 0) / win.length / 6)
          : 0
      )

      yawRef.current?.setAttribute('transform', `rotate(${-s.orientation.alpha})`)
      pitchRef.current?.setAttribute(
        'transform',
        `scale(1, ${Math.cos((s.orientation.beta * Math.PI) / 180).toFixed(3)})`
      )
      rollRef.current?.setAttribute('transform', `rotate(${s.orientation.gamma})`)
    }, 1000 / UI_HZ)
    return () => clearInterval(id)
  }, [latest, recent, status.live])

  const fire = useCallback(
    (cmd: CommandName) => {
      send({ type: 'command', nodeId: NODE_ID, command: cmd, timestamp: Date.now() })
      if ('vibrate' in navigator) navigator.vibrate?.(15)
    },
    [send]
  )

  const linked = stats.state === 'CONNECTED' && stats.peerConnected
  const gateNeeded = status.permission !== 'granted' && diag.motionEvents === 0

  if (gateNeeded) {
    return <PermissionGate status={status} diag={diag} onEnable={enable} linkState={stats.state} />
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-void)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tab === 'navigate' && (
          <>
            <NavMap stateRef={missionRef} cameraMode={camera} follow={follow} />
            <NavTopBar m={mission} linked={linked} />
            <EventToast event={event} />
            <NavHud m={mission} />

            <div
              style={{
                position: 'absolute',
                right: 10,
                top: 104,
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <MapBtn
                on={camera === 'heading-up'}
                onClick={() => setCamera(camera === 'heading-up' ? 'north-up' : 'heading-up')}
                label={camera === 'heading-up' ? 'HDG' : 'N'}
              />
              <MapBtn on={follow} onClick={() => setFollow((f) => !f)} label="◎" />
            </div>

          </>
        )}

        {tab === 'status' && <StatusTab m={mission} />}
        {tab === 'sensors' && (
          <SensorsTab
            status={status}
            diag={diag}
            readout={readout}
            recent={recent}
            motionEnergy={motionEnergy}
            stats={stats}
            yawRef={yawRef}
            pitchRef={pitchRef}
            rollRef={rollRef}
          />
        )}
        {tab === 'mission' && <MissionTab m={mission} onCommand={fire} linked={linked} />}
      </div>

      <nav
        style={{
          flex: '0 0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {(['navigate', 'status', 'sensors', 'mission'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '11px 0 12px',
              background: 'transparent',
              border: 'none',
              borderTop: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              color: tab === t ? 'var(--accent)' : 'var(--text-lo)',
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: tab === t ? 700 : 500,
            }}
          >
            {t}
          </button>
        ))}
      </nav>
    </div>
  )
}

function MapBtn({
  on,
  onClick,
  label,
  tone,
}: {
  on: boolean
  onClick: () => void
  label: string
  tone?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        borderRadius: 4,
        background: on ? 'rgba(34,211,238,0.16)' : 'rgba(11,20,32,0.88)',
        border: `1px solid ${on ? tone ?? 'var(--border-hot)' : 'var(--border)'}`,
        color: on ? tone ?? 'var(--accent)' : 'var(--text-mid)',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: 12, marginBottom: 10 }}>
      <div className="label" style={{ fontSize: 9 }}>
        {title}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span className="label" style={{ fontSize: 9 }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 11.5, color: color ?? 'var(--text-hi)' }}>
        {v}
      </span>
    </div>
  )
}

function StatusTab({ m }: { m: MissionStateMessage | null }) {
  if (!m) {
    return (
      <div style={{ padding: 14 }}>
        <span className="provenance">Waiting for Mission Control…</span>
      </div>
    )
  }
  const stages: [string, boolean][] = [
    ['IMU', true],
    ['AI SPEED', m.ablation.aiSpeed],
    ['ESKF', true],
    ['NHC', m.ablation.nhc],
    ['MAP', m.ablation.map],
    ['GNSS', m.gnssMode !== 'DENIED' && m.nisAccepted !== false],
  ]
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <Section title="Navigation state · simulated">
        <Row k="Phase" v={m.phase} color="var(--accent)" />
        <Row k="Mode" v={m.navState.replace('_', ' ')} />
        <Row k="GNSS" v={m.gnssMode} color={m.gnssMode === 'DENIED' ? 'var(--danger)' : 'var(--ok)'} />
        <Row k="Position error" v={`${m.drishtiError.toFixed(1)} m`} />
        <Row k="Drift" v={`${(m.errorFraction * 100).toFixed(2)} %`} />
        <Row k="Uncertainty" v={`${Math.hypot(m.uncertainty.along, m.uncertainty.cross).toFixed(1)} m`} />
        <Row k="Speed" v={`${(m.veh.v * 3.6).toFixed(1)} km/h`} />
      </Section>

      <Section title="System pipeline">
        {stages.map(([n, ok]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span className="mono" style={{ fontSize: 11 }}>
              {n}
            </span>
            <span className="mono" style={{ fontSize: 12, color: ok ? 'var(--ok)' : 'var(--danger)' }}>
              {ok ? '✓ ACTIVE' : '✕ DOWN'}
            </span>
          </div>
        ))}
      </Section>

      <div className="provenance">
        All figures above are SIMULATED engine output streamed from Mission Control.
      </div>
    </div>
  )
}

function SensorsTab({
  status,
  diag,
  readout,
  recent,
  motionEnergy,
  stats,
  yawRef,
  pitchRef,
  rollRef,
}: {
  status: ReturnType<typeof useSensors>['status']
  diag: ReturnType<typeof useSensors>['diag']
  readout: ReturnType<typeof useSensors>['latest']['current']
  recent: ReturnType<typeof useSensors>['recent']
  motionEnergy: number
  stats: ReturnType<typeof useLink>['stats']
  yawRef: React.RefObject<SVGGElement | null>
  pitchRef: React.RefObject<SVGGElement | null>
  rollRef: React.RefObject<SVGGElement | null>
}) {
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <Section title="Real phone orientation">
        <Attitude yawRef={yawRef} pitchRef={pitchRef} rollRef={rollRef} size={140} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
          <Row k="Yaw" v={`${readout.orientation.alpha.toFixed(1)}°`} />
          <Row k="Pitch" v={`${readout.orientation.beta.toFixed(1)}°`} />
          <Row k="Roll" v={`${readout.orientation.gamma.toFixed(1)}°`} />
        </div>
        <div className="provenance" style={{ marginTop: 6 }}>
          Phone sensor frame · not the vehicle frame
        </div>
      </Section>

      <Section title="Link">
        <Row k="State" v={stats.state} color={stats.state === 'CONNECTED' ? 'var(--ok)' : 'var(--danger)'} />
        <Row k="Sensor rate" v={`${status.hz.toFixed(1)} Hz`} color={status.live ? 'var(--ok)' : 'var(--danger)'} />
        <Row k="Latency" v={stats.latencyMs === null ? '—' : `${stats.latencyMs} ms`} />
        <Row k="Packets TX / RX" v={`${stats.tx} / ${stats.rx}`} />
        <Row k="Motion events" v={String(diag.motionEvents)} />
      </Section>

      <Section title="Motion energy">
        <div style={{ height: 9, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${motionEnergy * 100}%`,
              height: '100%',
              background: motionEnergy > 0.55 ? 'var(--danger)' : motionEnergy > 0.18 ? 'var(--warn)' : 'var(--ok)',
            }}
          />
        </div>
        <div className="provenance" style={{ marginTop: 5 }}>
          {status.live ? '|a| − g over 30 real samples · phone motion' : 'No sensor events'}
        </div>
      </Section>

      <Section title="Acceleration · m/s²">
        <Row k="X / Y / Z" v={`${readout.accel.x.toFixed(2)} ${readout.accel.y.toFixed(2)} ${readout.accel.z.toFixed(2)}`} />
        <SensorGraph recent={recent} pick={(s) => s.accel.x} label="ACC X" color="var(--drishti)" scale={20} />
        <SensorGraph recent={recent} pick={(s) => s.accel.z} label="ACC Z" color="var(--drishti)" scale={20} />
      </Section>

      <Section title="Rotation rate · °/s">
        <Row k="X / Y / Z" v={`${readout.gyro.x.toFixed(2)} ${readout.gyro.y.toFixed(2)} ${readout.gyro.z.toFixed(2)}`} />
        <SensorGraph recent={recent} pick={(s) => s.gyro.z} label="GYRO Z" color="var(--accent)" scale={200} />
      </Section>

      <div className="provenance">Raw DeviceMotionEvent values · REAL hardware · unmodified</div>
    </div>
  )
}

const COMMANDS: { cmd: CommandName; label: string; tone?: 'danger' | 'warn' }[] = [
  { cmd: 'START_MISSION', label: 'Start mission' },
  { cmd: 'GNSS_DENIED', label: 'GNSS blackout', tone: 'danger' },
  { cmd: 'GNSS_SPOOFED', label: 'GNSS spoof', tone: 'danger' },
  { cmd: 'POTHOLE', label: 'Pothole', tone: 'warn' },
  { cmd: 'PHONE_SLIP', label: 'Phone slip', tone: 'warn' },
  { cmd: 'GNSS_RECOVERY', label: 'GNSS recovery' },
  { cmd: 'RESET_MISSION', label: 'Reset mission' },
]

function MissionTab({
  m,
  onCommand,
  linked,
}: {
  m: MissionStateMessage | null
  onCommand: (c: CommandName) => void
  linked: boolean
}) {
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <Section title="Mission">
        <Row k="Phase" v={m?.phase ?? '—'} color="var(--accent)" />
        <Row k="Mission time" v={m ? `T+${m.t.toFixed(1)} s` : '—'} />
        <Row k="Distance" v={m ? `${m.s.toFixed(0)} m` : '—'} />
        <Row k="Blackout" v={m ? `${m.blackoutElapsed.toFixed(1)} s · ${m.blackoutDistance.toFixed(0)} m` : '—'} />
        <Row k="Rejected fixes" v={m ? String(m.rejectedCount) : '—'} color="var(--danger)" />
        <Row k="Recovery" v={m?.recoveryTime != null ? `${m.recoveryTime.toFixed(2)} s` : '—'} />
      </Section>

      <Section title="Command">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {COMMANDS.map((c) => (
            <button
              key={c.cmd}
              onClick={() => onCommand(c.cmd)}
              disabled={!linked}
              style={{
                width: '100%',
                minHeight: 46,
                background: 'var(--bg-raised)',
                border: `1px solid ${c.tone === 'danger' ? 'var(--danger)' : c.tone === 'warn' ? 'var(--warn)' : 'var(--border-hot)'}`,
                borderRadius: 3,
                color: c.tone === 'danger' ? 'var(--danger)' : c.tone === 'warn' ? 'var(--warn)' : 'var(--accent)',
                fontSize: 12.5,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                fontWeight: 600,
                opacity: linked ? 1 : 0.4,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="provenance" style={{ marginTop: 8 }}>
          Commands are REAL · the scenario they trigger is SIMULATED
        </div>
      </Section>
    </div>
  )
}

function PermissionGate({
  status,
  diag,
  onEnable,
  linkState,
}: {
  status: ReturnType<typeof useSensors>['status']
  diag: ReturnType<typeof useSensors>['diag']
  onEnable: () => void
  linkState: string
}) {
  const [taps, setTaps] = useState(0)
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
          Field navigation · SIH26168
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-title" style={{ fontSize: 12 }}>
          Motion sensor access
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-mid)', marginTop: 9 }}>
          This field unit streams your phone&apos;s real accelerometer, gyroscope and
          orientation to Mission Control over your local network. Nothing leaves the
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
            <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-mid)', margin: 0 }}>
              {status.reason}
            </p>
          </div>
        )}

        <button
          onPointerDown={() => setTaps((n) => n + 1)}
          onClick={onEnable}
          style={{
            marginTop: 14,
            width: '100%',
            minHeight: 56,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-hot)',
            borderRadius: 3,
            color: 'var(--accent)',
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
            WebkitTapHighlightColor: 'rgba(34,211,238,0.25)',
            touchAction: 'manipulation',
          }}
        >
          {taps > 0 ? 'Retry sensor access' : 'Start navigation'}
        </button>

        {taps > 0 && (
          <div className="mono" style={{ marginTop: 7, fontSize: 10.5, color: 'var(--ok)' }}>
            ✓ Button registered {taps} tap{taps === 1 ? '' : 's'}
          </div>
        )}

        <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
          <div className="label" style={{ fontSize: 9 }}>
            Diagnostics — read this out if it does not work
          </div>
          <div style={{ marginTop: 7 }}>
            <Row k="Protocol" v={diag.protocol || '…'} color={diag.protocol === 'http:' ? 'var(--danger)' : undefined} />
            <Row k="Host" v={diag.host || '…'} />
            <Row
              k="Secure context"
              v={diag.isSecureContext === null ? '…' : diag.isSecureContext ? 'YES' : 'NO'}
              color={diag.isSecureContext === false ? 'var(--danger)' : 'var(--ok)'}
            />
            <Row k="DeviceMotionEvent" v={diag.hasDeviceMotion ? 'present' : 'MISSING'} color={diag.hasDeviceMotion ? undefined : 'var(--danger)'} />
            <Row k="Needs permission" v={diag.needsPermissionCall ? 'yes (iOS)' : 'no (Android)'} />
            <Row k="Motion events" v={String(diag.motionEvents)} color={diag.motionEvents > 0 ? 'var(--ok)' : 'var(--danger)'} />
            <Row k="Orientation events" v={String(diag.orientationEvents)} color={diag.orientationEvents > 0 ? 'var(--ok)' : 'var(--danger)'} />
            <Row k="Last action" v={diag.lastAction} />
            <Row k="Link" v={linkState} color={linkState === 'CONNECTED' ? 'var(--ok)' : undefined} />
          </div>
        </div>
      </div>
    </div>
  )
}
