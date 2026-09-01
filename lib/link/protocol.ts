/**
 * Field link wire protocol.
 *
 * One definition, imported by the phone, Mission Control, and the relay server,
 * so a change to a message shape breaks compilation on every side at once.
 *
 * WHAT IS REAL ON THIS LINK: the WebSocket connection, the phone's sensor
 * readings, packet counts, measured sample rate, round-trip latency, and the
 * commands a person presses.
 *
 * WHAT IS SIMULATED: everything the navigation engine produces downstream of a
 * command — vehicle trajectory, GNSS, dead reckoning, map matching, integrity.
 * The phone is a sensor node and a remote control. It is NOT the vehicle, and
 * its orientation never reaches the estimator.
 */

export const LINK_PATH = '/ws'
export const PROTOCOL_VERSION = 1

export type Role = 'field' | 'control'

export type LinkState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR'

/** Raw device sensor sample. Values come from the browser, unmodified. */
export interface SensorSample {
  /** performance.now()-derived, milliseconds */
  timestamp: number
  accel: { x: number; y: number; z: number }
  gyro: { x: number; y: number; z: number }
  orientation: { alpha: number; beta: number; gamma: number }
  /** reported sampling interval in ms, when the browser provides one */
  interval: number
}

export interface HelloMessage {
  type: 'hello'
  version: number
  role: Role
  nodeId: string
}

export interface SensorMessage {
  type: 'sensor'
  nodeId: string
  sequence: number
  /** measured from real event timestamps, not assumed */
  sensorHz: number
  /** most recent sample, for numeric readouts */
  latest: SensorSample
  /** batched samples since the last packet, for the scrolling graphs */
  batch: SensorSample[]
  /** true when the browser is delivering events; false disables all readouts */
  sensorsLive: boolean
}

export interface HeartbeatMessage {
  type: 'heartbeat'
  nodeId: string
  timestamp: number
}

export interface HeartbeatAckMessage {
  type: 'heartbeat_ack'
  /** echoed unchanged so the sender can compute true round-trip time */
  timestamp: number
  serverTime: number
}

export type CommandName =
  | 'START_MISSION'
  | 'PAUSE_MISSION'
  | 'RESET_MISSION'
  | 'GNSS_ACTIVE'
  | 'GNSS_DEGRADED'
  | 'GNSS_DENIED'
  | 'GNSS_SPOOFED'
  | 'POTHOLE'
  | 'PHONE_SLIP'
  | 'GNSS_RECOVERY'

export interface CommandMessage {
  type: 'command'
  nodeId: string
  command: CommandName
  timestamp: number
}

export interface CommandAckMessage {
  type: 'command_ack'
  command: CommandName
  timestamp: number
  accepted: boolean
  reason?: string
}

/**
 * Mission Control -> phone: the authoritative simulation state.
 *
 * The phone renders this; it never runs its own simulation, never keeps its own
 * clock, and never computes a second trajectory. Every figure here is SIMULATED
 * engine output — the only real things on this link are the phone's own sensors
 * and the transport carrying them.
 */
export interface MissionStateMessage {
  type: 'mission'
  /** engine sim time, seconds — authoritative */
  t: number
  running: boolean
  finished: boolean
  phase: MissionPhase
  navState: string
  gnssMode: string

  /** SIMULATED ground-truth vehicle pose */
  veh: { x: number; y: number; psi: number; v: number }
  /** SIMULATED DRISHTI estimate */
  est: { x: number; y: number; psi: number }
  /** arc length along the route, metres */
  s: number
  distance: number

  drishtiError: number
  errorFraction: number
  uncertainty: { along: number; cross: number; psi: number }
  speedConfidence: number

  blackoutElapsed: number
  blackoutDistance: number
  blackoutStartS: number | null
  blackoutEndS: number | null

  rejectedCount: number
  anomalyCount: number
  recoveryTime: number | null
  nis: number | null
  nisAccepted: boolean | null

  ablation: { aiSpeed: boolean; nhc: boolean; map: boolean }
}

export type MissionPhase =
  | 'STANDBY'
  | 'ALIGNING'
  | 'NORMAL NAVIGATION'
  | 'GNSS DEGRADED'
  | 'DR COASTING'
  | 'RECOVERY'
  | 'REALIGNING'
  | 'COMPLETE'

/** Discrete event, emitted once, used for transient overlays on the phone. */
export interface MissionEventMessage {
  type: 'event'
  event: string
  t: number
  severity: 'info' | 'warn' | 'error' | 'ok'
  /** stable id so the phone shows each event exactly once */
  id: number
}

export interface PeerStatusMessage {
  type: 'peer_status'
  role: Role
  connected: boolean
  nodeId: string
}

export type LinkMessage =
  | HelloMessage
  | SensorMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | CommandMessage
  | CommandAckMessage
  | MissionEventMessage
  | MissionStateMessage
  | PeerStatusMessage

export function encode(m: LinkMessage): string {
  return JSON.stringify(m)
}

export function decode(raw: string): LinkMessage | null {
  try {
    const m = JSON.parse(raw)
    return typeof m === 'object' && m !== null && typeof m.type === 'string' ? (m as LinkMessage) : null
  } catch {
    return null
  }
}

/** Magnitudes used for the activity meters. Phone motion — not vehicle dynamics. */
export function accelMagnitude(s: SensorSample): number {
  return Math.hypot(s.accel.x, s.accel.y, s.accel.z)
}

export function gyroMagnitude(s: SensorSample): number {
  return Math.hypot(s.gyro.x, s.gyro.y, s.gyro.z)
}
