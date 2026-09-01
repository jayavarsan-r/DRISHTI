/**
 * Engine-level types.
 *
 * Every domain type is defined once, in the module that owns it, and re-exported
 * here so consumers have a single import site.
 */

export type { Vec2, Segment } from './road'
export type { TruthSample } from './truth'
export type { ImuSample, ImuConfig } from './imu'
export type { SpeedEstimate } from './speedModel'
export type { UncertaintyState } from './uncertainty'
export type { Hypothesis } from './mapMatch'
export type { GnssMode, GnssFix } from './gnss'
export type { IntegrityResult } from './integrity'
export type { EstimatorState, Ablation } from './estimators'

import type { TruthSample } from './truth'
import type { ImuSample } from './imu'
import type { SpeedEstimate } from './speedModel'
import type { UncertaintyState } from './uncertainty'
import type { Hypothesis } from './mapMatch'
import type { GnssMode } from './gnss'
import type { IntegrityResult } from './integrity'
import type { EstimatorState, Ablation } from './estimators'

export type NavState =
  | 'BOOT'
  | 'ALIGNING'
  | 'GNSS_ACTIVE'
  | 'GNSS_DEGRADED'
  | 'DR_ACTIVE'
  | 'REACQUIRING'
  | 'MOUNT_CHANGE'

export type Severity = 'info' | 'warn' | 'error' | 'ok'

export interface LogEntry {
  id: number
  t: number
  /** wall-clock style stamp derived from sim time, so it stays deterministic */
  clock: string
  severity: Severity
  message: string
}

export interface ErrorPoint {
  d: number
  drishti: number
  naive: number
}

export interface Snapshot {
  t: number
  running: boolean
  finished: boolean
  seed: number
  rateHz: number

  navState: NavState
  gnssMode: GnssMode

  truth: TruthSample
  drishti: EstimatorState
  naive: EstimatorState
  eskf: EstimatorState

  uncertainty: UncertaintyState
  speed: SpeedEstimate
  hypotheses: Hypothesis[]
  lastIntegrity: IntegrityResult | null

  rejectedCount: number
  anomalyCount: number
  fixesLast3s: number

  distance: number
  drishtiError: number
  naiveError: number
  eskfError: number
  /** drishtiError / distance. UNCLAMPED, even past TARGET. */
  errorFraction: number

  blackoutStart: number | null
  blackoutElapsed: number
  blackoutDistance: number
  blackoutStartS: number | null
  blackoutEndS: number | null

  alignProgress: number
  blendProgress: number

  imu: ImuSample
  shockActive: boolean
  naiveOffMap: boolean
  baselineFailureAt: number | null

  log: LogEntry[]
  errorSeries: ErrorPoint[]
  ablation: Ablation
  recoveryTime: number | null
  duration: number

  /** 'field' when the vehicle heading is commanded by the field unit. */
  driveMode: 'scripted' | 'field'
  /** Commanded heading, world frame radians. */
  commandedHeading: number
  /** commandedHeading minus actual vehicle heading, radians. */
  headingError: number
  /** Yaw rate the vehicle is currently using, rad/s. */
  turnRate: number
}
