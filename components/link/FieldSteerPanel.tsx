'use client'

import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'
import { Panel } from '../panels/Panel'

const DEG = 180 / Math.PI

/**
 * FIELD STEER — the causal chain, made visible.
 *
 * Reads left to right: the phone's real orientation becomes a heading command,
 * the controller turns that into a yaw rate, and the vehicle responds. Each
 * stage is labelled REAL or SIMULATED so the boundary is never in doubt.
 *
 * The phone commands heading only. It does not set the vehicle's position, and
 * nothing here reaches the estimator — DRISHTI still has to work out where the
 * vehicle is from the synthetic IMU, exactly as in the scripted run.
 */
export function FieldSteerPanel({
  engine,
  snap,
  orientationRef,
  live,
  connected,
}: {
  engine: Engine
  snap: Snapshot
  orientationRef: React.RefObject<{ alpha: number; beta: number; gamma: number }>
  live: boolean
  connected: boolean
}) {
  const active = snap.driveMode === 'field'
  const zeroRef = useRef(0)
  const phoneOut = useRef<HTMLSpanElement>(null)
  /*
   * Android reports DeviceOrientationEvent.alpha with different sign
   * conventions across handsets and browsers. Rather than guess, expose the
   * flip so the operator can match it to the device in two seconds.
   */
  const [invert, setInvert] = useState(false)

  // Drive the command from real phone orientation every frame while engaged.
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      const o = orientationRef.current
      if (o) {
        // Screen azimuth increases clockwise; world heading increases
        // counter-clockwise. Negate, then apply the operator's zero reference.
        const sign = invert ? 1 : -1
        const psi = (sign * (o.alpha - zeroRef.current) * Math.PI) / 180
        engine.setCommandedHeading(psi)
        if (phoneOut.current) phoneOut.current.textContent = `${o.alpha.toFixed(1)}°`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, engine, orientationRef, invert])

  /** Present headings as compass bearings so they never read as -300 deg. */
  const compass = (rad: number) => ((rad * DEG) % 360 + 360) % 360

  const cmd = compass(snap.commandedHeading)
  const veh = compass(snap.truth.psi)
  const err = snap.headingError * DEG
  const rate = snap.turnRate * DEG

  return (
    <Panel
      title="Field steer — phone commands the vehicle"
      provenance="Phone orientation is REAL and commands heading only · vehicle dynamics, IMU and all estimators remain SIMULATED · the estimator never sees this · free driving leaves the road network, so map matching helps less and error/distance runs higher than the scripted run"
      hot={active}
    >
      <button
        onClick={() => {
          zeroRef.current = orientationRef.current?.alpha ?? 0
          engine.setFieldSteer(!active)
        }}
        disabled={!connected}
        style={{
          width: '100%',
          minHeight: 40,
          background: active ? 'var(--border-hot)' : 'var(--bg-raised)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hot)'}`,
          borderRadius: 3,
          color: active ? 'var(--text-hi)' : 'var(--accent)',
          fontSize: 11.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 700,
          opacity: connected ? 1 : 0.4,
        }}
      >
        {active ? '■ Release steering' : '▶ Hand steering to field unit'}
      </button>

      {active && (
        <button
          onClick={() => setInvert((v) => !v)}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '6px 0',
            background: invert ? 'var(--border-hot)' : 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: invert ? 'var(--text-hi)' : 'var(--text-mid)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Steering feels backwards? invert · {invert ? 'INVERTED' : 'NORMAL'}
        </button>
      )}

      {active && (
        <button
          onClick={() => {
            zeroRef.current = orientationRef.current?.alpha ?? 0
          }}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '6px 0',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text-mid)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Set straight ahead = current phone direction
        </button>
      )}

      {!connected && (
        <div className="provenance" style={{ marginTop: 8, color: 'var(--warn)' }}>
          Requires a connected field unit.
        </div>
      )}

      {active && (
        <>
          <div
            style={{ marginTop: 12 }}
            data-steer-cmd={cmd.toFixed(1)}
            data-steer-veh={veh.toFixed(1)}
            data-steer-err={err.toFixed(1)}
            data-steer-rate={rate.toFixed(1)}
          >
            <Stage
              n="1"
              label="Phone orientation"
              tag="REAL"
              tagColor="var(--ok)"
              valueRef={phoneOut}
              hint="Measured by the handset"
            />
            <Arrow />
            <Stage
              n="2"
              label="Heading command"
              tag="REAL INPUT"
              tagColor="var(--ok)"
              value={`${cmd.toFixed(1)}°`}
              hint="Where the operator is pointing the vehicle"
            />
            <Arrow />
            <Stage
              n="3"
              label="Steering decision"
              tag="SIMULATED"
              tagColor="var(--warn)"
              value={`${err >= 0 ? '+' : ''}${err.toFixed(1)}° err → ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}°/s`}
              hint="Controller turns error into a yaw rate, rate-limited"
            />
            <Arrow />
            <Stage
              n="4"
              label="Vehicle response"
              tag="SIMULATED"
              tagColor="var(--warn)"
              value={`${veh.toFixed(1)}°  ·  ${(snap.truth.v * 3.6).toFixed(0)} km/h`}
              hint="Ground truth the estimators must recover"
            />
            <Arrow />
            <Stage
              n="5"
              label="DRISHTI estimate"
              tag="SIMULATED"
              tagColor="var(--warn)"
              value={`error ${snap.drishtiError.toFixed(1)} m`}
              hint="Works this out from synthetic IMU — it never sees the phone"
            />
          </div>

          <TurnGauge err={err} rate={rate} />

          {!live && (
            <div className="provenance" style={{ marginTop: 8, color: 'var(--danger)' }}>
              Steering engaged but the phone is delivering no orientation events — the
              command is frozen at its last value.
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

function Stage({
  n,
  label,
  tag,
  tagColor,
  value,
  valueRef,
  hint,
}: {
  n: string
  label: string
  tag: string
  tagColor: string
  value?: string
  valueRef?: React.RefObject<HTMLSpanElement | null>
  hint: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        padding: '7px 9px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-lo)' }}>
          {n}
        </span>
        <span className="label" style={{ fontSize: 8.5 }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 7.5, color: tagColor, letterSpacing: '0.08em' }}>
          {tag}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 14, marginTop: 2 }}>
        {valueRef ? <span ref={valueRef}>—</span> : value}
      </div>
      <div className="provenance" style={{ marginTop: 1 }}>
        {hint}
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--border-hot)', fontSize: 12, lineHeight: '14px' }}>
      ↓
    </div>
  )
}

/** Live steering-wheel readout: how hard the vehicle is turning, and which way. */
function TurnGauge({ err, rate }: { err: number; rate: number }) {
  const pct = Math.max(-1, Math.min(1, rate / 43))
  return (
    <div style={{ marginTop: 10 }}>
      <div
        className="label"
        style={{ fontSize: 8.5, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>Turn left</span>
        <span style={{ color: 'var(--text-lo)' }}>yaw rate</span>
        <span>Turn right</span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 12,
          marginTop: 4,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 2,
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--text-mid)' }} />
        <div
          style={{
            position: 'absolute',
            top: 1,
            bottom: 1,
            left: pct >= 0 ? '50%' : `${50 + pct * 50}%`,
            width: `${Math.abs(pct) * 50}%`,
            background: 'var(--accent)',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  )
}
