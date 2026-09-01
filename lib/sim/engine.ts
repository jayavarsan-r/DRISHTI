/**
 * Simulation orchestrator.
 *
 * Owns the fixed-rate physics loop, the navigation state machine, the event
 * log, and the decimated trails the canvas draws. This is the only module that
 * knows about all the others.
 *
 * DETERMINISM CONTRACT — the demo depends on a judge pressing RESET, watching
 * again, and seeing identical numbers:
 *   1. Every RNG draw happens inside step(). N steps always produce the same
 *      sequence regardless of how they were batched across frames.
 *   2. The script is keyed to sim time, never performance.now().
 *   3. advance() runs whole steps only, and sheds backlog rather than taking
 *      partial ones. A slow machine lags in wall time; the state sequence is
 *      unchanged.
 *   4. reset() rebuilds every stateful object from the seed. Nothing survives.
 */

import {
  DEFAULT_SEED,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  TRAIL_HZ,
  MAX_STEPS_PER_FRAME,
} from './constants'
import { Rng } from './rng'
import { ROUTE_LENGTH } from './road'
import { generateTruth, type Truth, type TruthSample } from './truth'
import { ImuSynth, type ImuSample } from './imu'
import { SpeedModel, type SpeedEstimate } from './speedModel'
import { UncertaintyTracker } from './uncertainty'
import { findHypotheses, mapCorrection, MAP_SIGMA, type Hypothesis } from './mapMatch'
import { GnssSim, type GnssMode, type GnssFix } from './gnss'
import { nisGate, type IntegrityResult } from './integrity'
import {
  NaiveIns,
  EskfNhc,
  Drishti,
  FULL_ABLATION,
  type Ablation,
} from './estimators'
import {
  JUDGE_SCRIPT,
  ALIGN_DURATION,
  BLEND_DURATION,
  MOUNT_CHANGE_DURATION,
  SPOOF_WINDOW,
  type ScriptEvent,
} from './scenario'
import type { LogEntry, NavState, Severity, Snapshot, ErrorPoint } from './types'

/** Map matching runs at this rate, not at the physics rate. */
const MAP_HZ = 10
/**
 * Cross-track variance is collapsed at this rate, NOT at MAP_HZ.
 *
 * Successive map matches against the same road are almost perfectly
 * correlated. Treating ten of them per second as ten independent measurements
 * drives the covariance far below the filter's true error, and an overconfident
 * filter then rejects every legitimate GNSS fix through the chi-square gate and
 * can never recover.
 */
const MAP_COLLAPSE_HZ = 1
/**
 * After this many consecutive rejections the filter concludes that it, not the
 * constellation, is the thing that is wrong: it inflates its own covariance so
 * the gate can reopen. Without this escape a confidently-lost filter stays lost
 * for the rest of the run.
 */
const MAX_CONSECUTIVE_REJECTS = 4
/**
 * Longest gap between two fixes that still yields a usable course over ground.
 * Beyond this the vehicle may have turned between them and the straight-line
 * bearing no longer estimates heading.
 */
const MAX_COURSE_BASELINE_S = 2.5
/** Below this speed the course over ground is fix noise, not heading. */
const MIN_COURSE_SPEED = 3
/** Above this turn rate the fix-to-fix chord no longer estimates heading. */
const MAX_COURSE_TURN_RATE = 0.15
/** Baseline must exceed this multiple of the fix separation noise for full gain. */
const COURSE_SNR = 3
/** Error chart sampling rate. */
const ERROR_SERIES_HZ = 2
/** Naive INS is declared "off map" past this error, for the edge chip. */
const OFF_MAP_ERROR = 120
/** One-shot baseline failure banner threshold, metres. */
const BASELINE_FAILURE_ERROR = 50
/** Gyro noise and bias uncertainty handed to the covariance propagation. */
const GYRO_NOISE = 0.004
const BG_UNCERTAINTY = 0.001
/*
 * FIELD STEER — free-drive vehicle model.
 *
 * In this mode the scripted ground-truth trajectory is replaced by a vehicle
 * that drives forward and turns toward a commanded heading. The command comes
 * from the phone's real orientation, which makes the phone a genuine input to
 * the demonstration rather than a dial beside it.
 *
 * Everything downstream is unchanged and still simulated: the IMU is
 * synthesised from this motion exactly as before, and all three estimators run
 * on that synthetic stream. The phone supplies a steering command; it does not
 * supply the vehicle's position, and it never reaches the estimator.
 */
const FIELD_CRUISE_SPEED = 11
const FIELD_ACCEL = 1.6
/** Max yaw rate the vehicle will use to chase the commanded heading, rad/s. */
const FIELD_MAX_TURN_RATE = 0.75
/** Proportional gain on heading error. */
const FIELD_STEER_GAIN = 1.6

/** Deterministic log epoch, so timestamps look real without using Date.now(). */
const LOG_EPOCH_S = 14 * 3600 + 52 * 60 + 26

function stamp(t: number): string {
  const total = LOG_EPOCH_S + t
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  const s = total % 60
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    s.toFixed(3).padStart(6, '0')
  )
}

/** Ease-out cubic. Bounded slope, so the recovery blend cannot snap. */
function easeOut(p: number): number {
  const c = Math.max(0, Math.min(1, p))
  return 1 - Math.pow(1 - c, 3)
}

export class Engine {
  readonly seed: number

  /** Decimated trail geometry, written straight into SVG points attributes. */
  readonly trails = { truth: '', drishti: '', naive: '', version: 0 }

  private dt: number
  private rateHz: number
  private acc = 0
  private running = false
  private finished = false
  private t = 0
  private stepIndex = 0

  private truth!: Truth
  private rng!: Rng
  private imu!: ImuSynth
  private speedModel!: SpeedModel
  private gnss!: GnssSim
  private uncertainty!: UncertaintyTracker
  private naive!: NaiveIns
  private eskf!: EskfNhc
  private drishti!: Drishti

  private navState: NavState = 'BOOT'
  private ablation: Ablation = { ...FULL_ABLATION }

  private driveMode: 'scripted' | 'field' = 'scripted'
  /** Commanded heading in world frame, radians. Set from phone orientation. */
  private commandedHeading = 0
  private steerActive = false
  private free = { x: 0, y: 0, psi: 0, v: 0, s: 0, omega: 0, aLong: 0 }

  private scriptArmed = false
  private firedScript = new Set<number>()

  private speed: SpeedEstimate = { vHat: 0, sigmaV: 0.35, confidence: 0.74 }
  private hypotheses: Hypothesis[] = []
  private prevWinnerId: string | null = null
  private lastIntegrity: IntegrityResult | null = null
  private lastImu: ImuSample = { t: 0, gyroZ: 0, accelX: 0, accelY: 0, accelZ: 0 }

  private rejectedCount = 0
  private anomalyCount = 0
  private recentFixTimes: number[] = []
  private consecutiveRejects = 0
  /** Latched when the filter admits it is lost; cleared only by an accepted fix. */
  private filterLost = false
  private lastAcceptedFix: GnssFix | null = null
  private lastCollapseT = -Infinity

  private blackoutStart: number | null = null
  private blackoutStartS: number | null = null
  private blackoutEndS: number | null = null

  private alignProgress = 0
  private blendProgress = 0
  private blendOffset = { x: 0, y: 0 }
  private blendPrevEase = 0
  private mountChangeStart: number | null = null
  private restoreT: number | null = null
  private recoveryTime: number | null = null
  private spoofUntil: number | null = null
  private modeBeforeSpoof: GnssMode = 'DENIED'

  private baselineFailureAt: number | null = null

  private log: LogEntry[] = []
  private logId = 0
  private errorSeries: ErrorPoint[] = []

  private lastSnapshotT = -Infinity
  private lastTrailT = -Infinity
  private lastMapT = -Infinity
  private lastErrorT = -Infinity

  private subscribers = new Set<() => void>()
  private cached!: Snapshot
  private dirty = true

  constructor(seed: number = DEFAULT_SEED) {
    this.seed = seed
    this.rateHz = PHYSICS_HZ
    this.dt = 1 / PHYSICS_HZ
    this.build(seed)
  }

  // ---------------------------------------------------------------- lifecycle

  private build(seed: number): void {
    this.rng = new Rng(seed)
    this.truth = generateTruth(this.dt)
    this.imu = new ImuSynth(this.rng)
    this.speedModel = new SpeedModel(this.rng)
    this.gnss = new GnssSim(this.rng)
    this.uncertainty = new UncertaintyTracker()
    this.naive = new NaiveIns()
    this.eskf = new EskfNhc()
    this.drishti = new Drishti()

    const first = this.truth.samples[0]
    this.naive.reset(first.psi)
    this.eskf.reset(first.psi)
    this.drishti.reset(first.psi)
    this.naive.state.x = first.x
    this.naive.state.y = first.y
    this.eskf.state.x = first.x
    this.eskf.state.y = first.y
    this.drishti.state.x = first.x
    this.drishti.state.y = first.y

    this.t = 0
    this.stepIndex = 0
    this.acc = 0
    this.running = false
    this.finished = false
    this.navState = 'BOOT'
    this.scriptArmed = false
    this.firedScript.clear()
    this.hypotheses = []
    this.prevWinnerId = null
    this.lastIntegrity = null
    this.lastImu = { t: 0, gyroZ: 0, accelX: 0, accelY: 0, accelZ: 0 }
    this.speed = { vHat: 0, sigmaV: 0.35, confidence: 0.74 }
    this.rejectedCount = 0
    this.anomalyCount = 0
    this.recentFixTimes = []
    this.consecutiveRejects = 0
    this.filterLost = false
    this.lastAcceptedFix = null
    this.lastCollapseT = -Infinity
    this.blackoutStart = null
    this.blackoutStartS = null
    this.blackoutEndS = null
    this.alignProgress = 0
    this.blendProgress = 0
    this.blendPrevEase = 0
    this.mountChangeStart = null
    this.restoreT = null
    this.recoveryTime = null
    this.spoofUntil = null
    this.baselineFailureAt = null
    this.log = []
    this.logId = 0
    this.errorSeries = []
    this.trails.truth = ''
    this.trails.drishti = ''
    this.trails.naive = ''
    this.trails.version++
    this.lastSnapshotT = -Infinity
    this.lastTrailT = -Infinity
    this.lastMapT = -Infinity
    this.lastErrorT = -Infinity
    this.ablation = { ...FULL_ABLATION }
    this.driveMode = 'scripted'
    this.steerActive = false
    this.commandedHeading = this.truth.samples[0].psi
    this.free = {
      x: first.x,
      y: first.y,
      psi: first.psi,
      v: 0,
      s: 0,
      omega: 0,
      aLong: 0,
    }
    this.dirty = true
    this.rebuild()
  }

  reset(seed?: number): void {
    this.build(seed ?? this.seed)
    this.publish()
  }

  play(): void {
    if (!this.finished) {
      this.running = true
      this.publish()
    }
  }

  pause(): void {
    this.running = false
    this.publish()
  }

  runJudgeDemo(): void {
    this.build(this.seed)
    this.scriptArmed = true
    this.running = true
    this.navState = 'ALIGNING'
    this.publish()
  }

  // ------------------------------------------------------------------ controls

  setGnssMode(m: GnssMode): void {
    if (this.gnss.mode === m) return
    this.gnss.mode = m
    if (m === 'DENIED' || m === 'SPOOFED') this.anomalyCount++
    this.emit(m === 'DENIED' ? 'warn' : 'info', `GNSS MODE · ${m}`)
    this.publish()
  }

  firePothole(): void {
    this.imu.fireShock(this.t)
    this.emit('warn', 'SHOCK DETECTED · measurement down-weighted')
    this.publish()
  }

  firePhoneSlip(): void {
    this.imu.setMount(37, 5)
    this.uncertainty.inflateHeading(30 * (Math.PI / 180))
    this.mountChangeStart = this.t
    this.navState = 'MOUNT_CHANGE'
    this.emit('warn', 'MOUNT CHANGE DETECTED · re-aligning')
    this.publish()
  }

  setAblation(a: Partial<Ablation>): void {
    this.ablation = { ...this.ablation, ...a }
    const off = Object.entries(this.ablation)
      .filter(([, v]) => !v)
      .map(([k]) => k.toUpperCase())
    this.emit('info', off.length ? `ABLATION · DISABLED ${off.join(', ')}` : 'ABLATION · ALL ENABLED')
    this.publish()
  }

  /**
   * Hand steering to the field unit. The vehicle then drives freely, turning
   * toward whatever heading the phone commands.
   */
  setFieldSteer(on: boolean): void {
    if (this.steerActive === on) return
    this.steerActive = on
    this.driveMode = on ? 'field' : 'scripted'

    if (on) {
      // Continue from wherever the scripted vehicle currently is, so switching
      // mode does not teleport the car.
      const cur = this.truth.samples[Math.min(this.stepIndex, this.truth.samples.length - 1)]
      this.free = {
        x: cur.x,
        y: cur.y,
        psi: cur.psi,
        v: Math.max(cur.v, 4),
        s: cur.s,
        omega: 0,
        aLong: 0,
      }
      this.commandedHeading = cur.psi

      /*
       * Bring the filter up if it has not run yet. Engaging steering straight
       * from BOOT would otherwise leave the state machine parked there with an
       * uninitialised estimator, which shows up as a large error that has
       * nothing to do with the navigation problem.
       */
      if (this.navState === 'BOOT' || this.navState === 'ALIGNING') {
        this.alignProgress = 1
        this.navState = 'GNSS_ACTIVE'
        this.emit('ok', 'ALIGNMENT CONFIRMED · free-drive start')
      }

      // Start the estimators from the vehicle's actual pose, so the run begins
      // at zero error rather than inheriting a scripted-run divergence.
      this.naive.reset(cur.psi)
      this.eskf.reset(cur.psi)
      this.drishti.reset(cur.psi)
      for (const e of [this.naive, this.eskf, this.drishti]) {
        e.state.x = cur.x
        e.state.y = cur.y
      }
      this.uncertainty.reset()
      this.consecutiveRejects = 0
      this.filterLost = false
      this.lastAcceptedFix = null
      this.trails.truth = ''
      this.trails.drishti = ''
      this.trails.naive = ''
      this.trails.version++
      this.errorSeries = []
      this.baselineFailureAt = null

      this.running = true
      this.finished = false
      this.emit('info', 'FIELD STEER ENGAGED · vehicle heading commanded by field unit')
    } else {
      this.emit('info', 'FIELD STEER RELEASED · returning to scripted trajectory')
    }
    this.publish()
  }

  /**
   * Commanded heading from the phone, world frame radians.
   *
   * Normalised to [-pi, pi]. An un-normalised command still steers correctly —
   * the error term wraps — but it reads as nonsense on screen ("-300 deg") and
   * makes every sign question harder than it needs to be.
   */
  setCommandedHeading(psi: number): void {
    this.commandedHeading = Math.atan2(Math.sin(psi), Math.cos(psi))
  }

  get fieldSteerActive(): boolean {
    return this.steerActive
  }

  /** Edge-engine demonstration. Changes the physics rate, so it changes the run. */
  setRateHz(hz: number): void {
    this.rateHz = hz
    this.dt = 1 / hz
    this.publish()
  }

  // -------------------------------------------------------------------- clock

  advance(wallDtMs: number): void {
    if (!this.running || this.finished) return

    this.acc += Math.min(wallDtMs, 250) / 1000

    let steps = 0
    while (this.acc >= this.dt && steps < MAX_STEPS_PER_FRAME) {
      this.step()
      this.acc -= this.dt
      steps++
      if (this.finished) break
    }
    // Shed backlog rather than ever taking a partial step.
    if (steps >= MAX_STEPS_PER_FRAME) this.acc = 0

    this.maybePublish()
  }

  // --------------------------------------------------------------------- step

  /**
   * Free-drive vehicle model used in FIELD STEER mode. Produces a TruthSample
   * of exactly the same shape as the scripted trajectory, so the IMU synthesis
   * and all three estimators downstream are untouched.
   */
  private stepFreeDrive(dt: number): TruthSample {
    const f = this.free

    const err = Math.atan2(
      Math.sin(this.commandedHeading - f.psi),
      Math.cos(this.commandedHeading - f.psi)
    )
    const omega = Math.max(
      -FIELD_MAX_TURN_RATE,
      Math.min(FIELD_MAX_TURN_RATE, err * FIELD_STEER_GAIN)
    )

    // Slow for hard turns, the way a real vehicle must.
    const target = FIELD_CRUISE_SPEED * (1 - 0.55 * Math.min(1, Math.abs(omega) / FIELD_MAX_TURN_RATE))
    const aLong = Math.max(-FIELD_ACCEL * 1.5, Math.min(FIELD_ACCEL, (target - f.v) / Math.max(dt, 1e-3)))

    f.v = Math.max(0, f.v + aLong * dt)
    f.psi += omega * dt
    // Keep heading bounded; an unbounded accumulator makes the readouts
    // unreadable and hides genuine wrap bugs.
    f.psi = Math.atan2(Math.sin(f.psi), Math.cos(f.psi))
    f.x += f.v * Math.cos(f.psi) * dt
    f.y += f.v * Math.sin(f.psi) * dt
    f.s += f.v * dt
    f.omega = omega
    f.aLong = aLong

    return {
      t: this.t,
      s: f.s,
      x: f.x,
      y: f.y,
      psi: f.psi,
      v: f.v,
      omega,
      aLong,
    }
  }

  private step(): void {
    const dt = this.dt
    const idx = Math.min(this.stepIndex, this.truth.samples.length - 1)
    const tru: TruthSample =
      this.driveMode === 'field' ? this.stepFreeDrive(dt) : this.truth.samples[idx]

    if (this.scriptArmed) this.runScript()

    // --- sensors -----------------------------------------------------------
    const imu = this.imu.sample(tru, dt)
    this.lastImu = imu
    const shock = this.imu.shockActive(this.t)
    this.speed = this.speedModel.estimate(tru.v, shock)

    const stationary = tru.v < 0.05

    // --- estimators --------------------------------------------------------
    this.naive.step(imu, dt)
    this.eskf.step(imu, dt, stationary)
    this.drishti.step(imu, dt, this.speed, stationary, this.ablation)

    // --- uncertainty -------------------------------------------------------
    this.uncertainty.propagate(dt, this.drishti.state.v, this.speed.sigmaV, GYRO_NOISE, BG_UNCERTAINTY)

    // --- map matching ------------------------------------------------------
    if (this.t - this.lastMapT >= 1 / MAP_HZ) {
      this.lastMapT = this.t
      const u = this.uncertainty.state
      this.hypotheses = findHypotheses(
        { x: this.drishti.state.x, y: this.drishti.state.y },
        this.drishti.state.psi,
        u.sigmaCross,
        this.prevWinnerId
      )
      if (this.hypotheses.length > 0) {
        this.prevWinnerId = this.hypotheses[0].segmentId
        if (this.ablation.map) {
          const d = mapCorrection(
            { x: this.drishti.state.x, y: this.drishti.state.y },
            this.hypotheses,
            u.sigmaCross
          )
          this.drishti.applyDelta(d)

          /*
           * A map match says which lane, not how far along. Cross-track only,
           * and only at MAP_COLLAPSE_HZ — see the constant's note on why.
           *
           * Suppressed entirely while fixes are being rejected. A filter that
           * keeps disagreeing with the constellation is most likely matched to
           * the WRONG road, and letting the map keep collapsing cross-track
           * then holds the covariance as a needle along the heading, so
           * cross-track innovations can never pass the gate and the filter
           * stays locked out of recovery. During a true blackout there are no
           * fixes to reject, so this suppression does not fire and the map
           * remains the primary constraint — which is the intended behaviour.
           */
          if (!this.filterLost && this.t - this.lastCollapseT >= 1 / MAP_COLLAPSE_HZ) {
            this.lastCollapseT = this.t
            this.uncertainty.collapseCrossTrack(
              MAP_SIGMA / Math.max(this.hypotheses[0].p, 0.05)
            )
          }
        }
      }
    }

    // --- GNSS + integrity --------------------------------------------------
    const fix = this.gnss.tick(this.t, tru)
    if (fix) this.handleFix(fix)

    // --- state machine -----------------------------------------------------
    this.updateStateMachine()

    // --- recording ---------------------------------------------------------
    this.record(tru)

    this.t += dt
    this.stepIndex++
    this.dirty = true

    if (
      this.driveMode !== 'field' &&
      (tru.s >= ROUTE_LENGTH - 0.5 || this.stepIndex >= this.truth.samples.length)
    ) {
      this.finished = true
      this.running = false
      this.emit('ok', 'MISSION COMPLETE')
      this.publish()
    }
  }

  private handleFix(fix: GnssFix): void {
    const u = this.uncertainty.state
    const result = nisGate(
      fix,
      { x: this.drishti.state.x, y: this.drishti.state.y },
      this.drishti.state.psi,
      u
    )
    this.lastIntegrity = result

    if (!result.accepted) {
      this.rejectedCount++
      this.consecutiveRejects++
      this.emit('error', `GNSS MEASUREMENT REJECTED · NIS ${result.nis.toFixed(1)}`)

      if (this.consecutiveRejects >= MAX_CONSECUTIVE_REJECTS) {
        // Persistent disagreement means the filter is the unreliable party.
        // Once that is admitted, keep widening on every further rejection until
        // the gate reopens — the counter is NOT reset here, because doing so
        // would un-latch the map suppression below and re-pin cross-track.
        if (!this.filterLost) {
          this.filterLost = true
          this.emit('warn', 'FILTER LOST · covariance inflating, map hold released')
        }
        this.uncertainty.inflateForLostFilter()
      }
      return
    }

    this.consecutiveRejects = 0
    this.filterLost = false
    this.recentFixTimes.push(this.t)
    this.uncertainty.collapseFromGnss(fix.sigma)

    /*
     * Course over ground observes accumulated heading error, but only across a
     * baseline that is both recent and long enough to beat the fix noise.
     *
     * The staleness gate matters more than it looks: the first fix accepted
     * after a 30 s blackout would otherwise be paired with the last fix from
     * BEFORE the blackout, producing a course averaged across two turns and a
     * bias update scaled by a 30 s interval. That single update swings the
     * heading estimate by tens of degrees and destabilises the rest of the run.
     */
    if (this.lastAcceptedFix) {
      const dx = fix.x - this.lastAcceptedFix.x
      const dy = fix.y - this.lastAcceptedFix.y
      const baseline = Math.hypot(dx, dy)
      const dtFix = fix.t - this.lastAcceptedFix.t

      /*
       * Course over ground only estimates heading when the vehicle is moving
       * in a straight line:
       *  - at rest the baseline is pure fix noise and the bearing is random;
       *  - mid-turn the chord between two fixes is the AVERAGE heading over the
       *    interval, offset from the instantaneous heading by half the swept
       *    angle (about 9 degrees in the 25 m turns here).
       * Speed is taken from the GNSS baseline itself, so this gate stays
       * independent of whatever the filter currently believes.
       */
      const turnRate = Math.abs(this.lastImu.gyroZ)

      /*
       * Speed comes from the FILTER, not from the fix baseline. At rest, two
       * fixes with sigma = 3 m sit about 5 m apart on noise alone, so a
       * baseline-derived speed sails past any sane threshold while the bearing
       * between them is uniformly random. The filter knows it is stopped
       * because ZUPT has forced its speed to zero.
       */
      const filterSpeed = Math.abs(this.drishti.state.v)

      /*
       * Bearing uncertainty from two noisy fixes is about
       * atan(sigma*sqrt(2) / baseline). Rather than trust every bearing
       * equally, scale the correction by how far the baseline exceeds that
       * noise floor.
       */
      const sepNoise = fix.sigma * Math.SQRT2
      const quality = Math.max(0, Math.min(1, baseline / (COURSE_SNR * sepNoise)))

      // 2-sigma baseline is where the course carries more signal than fix
      // noise. Gating at 4 sigma needs v > 12 m/s, which delays the first aid
      // to t~8 s and leaves the gyro bias half calibrated at blackout onset.
      const usable =
        baseline > 2 * fix.sigma &&
        dtFix <= MAX_COURSE_BASELINE_S &&
        filterSpeed > MIN_COURSE_SPEED &&
        turnRate < MAX_COURSE_TURN_RATE

      if (usable) {
        const course = Math.atan2(dy, dx)
        this.drishti.aidHeading(course, dtFix, quality)
        this.eskf.aidHeading(course, dtFix, quality)
      }
    }
    this.lastAcceptedFix = fix

    if (this.navState === 'DR_ACTIVE') {
      // Enter the recovery blend. Position is never assigned.
      this.navState = 'REACQUIRING'
      this.blendProgress = 0
      this.blendPrevEase = 0
      this.blendOffset = {
        x: fix.x - this.drishti.state.x,
        y: fix.y - this.drishti.state.y,
      }
      this.blackoutEndS = this.truth.samples[Math.min(this.stepIndex, this.truth.samples.length - 1)].s
      this.restoreT = this.t
      this.emit('info', 'GNSS REACQUIRED · BLENDING')
    } else if (this.navState === 'GNSS_ACTIVE') {
      this.drishti.blendTo({ x: fix.x, y: fix.y }, 0.25)
    }
  }

  private updateStateMachine(): void {
    // ALIGNING resolves on its own.
    if (this.navState === 'ALIGNING') {
      this.alignProgress = Math.min(1, this.t / ALIGN_DURATION)
      if (this.alignProgress >= 1) {
        this.navState = 'GNSS_ACTIVE'
        this.emit('ok', 'ALIGNMENT CONFIRMED · yaw +7.0°')
      }
    }

    // MOUNT_CHANGE resolves on its own.
    if (this.navState === 'MOUNT_CHANGE' && this.mountChangeStart !== null) {
      const p = (this.t - this.mountChangeStart) / MOUNT_CHANGE_DURATION
      this.alignProgress = Math.min(1, p)
      if (p >= 1) {
        this.mountChangeStart = null
        this.navState = this.gnss.mode === 'DENIED' ? 'DR_ACTIVE' : 'GNSS_ACTIVE'
        this.emit('ok', 'RE-ALIGNMENT COMPLETE')
      }
    }

    // REACQUIRING: ramp the offset in over BLEND_DURATION with a bounded slope.
    if (this.navState === 'REACQUIRING' && this.restoreT !== null) {
      const p = (this.t - this.restoreT) / BLEND_DURATION
      this.blendProgress = Math.min(1, p)
      const e = easeOut(this.blendProgress)
      const dE = e - this.blendPrevEase
      this.blendPrevEase = e
      this.drishti.applyDelta({ x: this.blendOffset.x * dE, y: this.blendOffset.y * dE })

      if (p >= 1) {
        this.navState = 'GNSS_ACTIVE'
        this.recoveryTime = this.t - this.restoreT
        this.blackoutStart = null
        this.emit('ok', 'FUSION RESTORED')
      }
    }

    // The spoof window closes and the jammer resumes.
    if (this.spoofUntil !== null && this.t >= this.spoofUntil) {
      this.spoofUntil = null
      this.gnss.mode = this.modeBeforeSpoof
    }

    // Drop into DR when fixes stop arriving.
    this.recentFixTimes = this.recentFixTimes.filter((x) => this.t - x <= 3)
    const denied = this.gnss.mode === 'DENIED'
    if (denied && (this.navState === 'GNSS_ACTIVE' || this.navState === 'GNSS_DEGRADED')) {
      this.navState = 'DR_ACTIVE'
      if (this.blackoutStart === null) {
        this.blackoutStart = this.t
        this.blackoutStartS = this.truth.samples[Math.min(this.stepIndex, this.truth.samples.length - 1)].s
      }
      this.emit('warn', 'DR MODE ACTIVE · inertial navigation')
    }
  }

  private runScript(): void {
    for (let i = 0; i < JUDGE_SCRIPT.length; i++) {
      const ev: ScriptEvent = JUDGE_SCRIPT[i]
      if (this.firedScript.has(i) || this.t < ev.t) continue
      this.firedScript.add(i)
      this.applyScriptEvent(ev)
    }
  }

  private applyScriptEvent(ev: ScriptEvent): void {
    switch (ev.kind) {
      case 'INIT':
        this.navState = 'ALIGNING'
        this.emit('info', 'SYSTEM INITIALISING · solving mount rotation')
        break
      case 'ALIGNED':
        this.alignProgress = 1
        break
      case 'GNSS_ACTIVE':
        this.emit('ok', 'GNSS LOCK ACQUIRED')
        break
      case 'GNSS_DENIED':
        this.gnss.mode = 'DENIED'
        this.anomalyCount++
        this.emit('warn', 'GNSS SIGNAL LOST')
        break
      case 'POTHOLE':
        this.firePothole()
        break
      case 'SPOOF':
        // A spoofer transmits through a jammer. The fix arrives looking
        // perfectly healthy and is caught by the chi-square gate, not by a
        // special case.
        this.modeBeforeSpoof = this.gnss.mode
        this.gnss.mode = 'SPOOFED'
        this.spoofUntil = this.t + SPOOF_WINDOW
        this.emit('warn', 'ANOMALOUS GNSS FIX INBOUND')
        break
      case 'GNSS_RESTORE':
        this.gnss.mode = 'NOMINAL'
        this.emit('ok', 'GNSS SIGNAL RESTORED')
        break
      case 'FUSED':
        break
    }
  }

  private record(tru: TruthSample): void {
    const dErr = Math.hypot(this.drishti.state.x - tru.x, this.drishti.state.y - tru.y)
    const nErr = Math.hypot(this.naive.state.x - tru.x, this.naive.state.y - tru.y)

    if (this.baselineFailureAt === null && nErr > BASELINE_FAILURE_ERROR) {
      this.baselineFailureAt = this.t
      this.emit('error', `BASELINE FAILURE · NAIVE INS ERROR ${nErr.toFixed(0)} m`)
    }

    if (this.t - this.lastTrailT >= 1 / TRAIL_HZ) {
      this.lastTrailT = this.t
      this.trails.truth += ` ${tru.x.toFixed(1)},${tru.y.toFixed(1)}`
      this.trails.drishti += ` ${this.drishti.state.x.toFixed(1)},${this.drishti.state.y.toFixed(1)}`
      this.trails.naive += ` ${this.naive.state.x.toFixed(1)},${this.naive.state.y.toFixed(1)}`
      this.trails.version++
    }

    if (this.t - this.lastErrorT >= 1 / ERROR_SERIES_HZ) {
      this.lastErrorT = this.t
      this.errorSeries.push({ d: tru.s, drishti: dErr, naive: nErr })
    }
  }

  private emit(severity: Severity, message: string): void {
    this.log.push({ id: this.logId++, t: this.t, clock: stamp(this.t), severity, message })
    if (this.log.length > 200) this.log.shift()
    this.publish()
  }

  // ----------------------------------------------------------------- snapshot

  subscribe = (cb: () => void): (() => void) => {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  getSnapshot = (): Snapshot => this.cached

  private maybePublish(): void {
    if (this.t - this.lastSnapshotT >= 1 / SNAPSHOT_HZ) {
      this.lastSnapshotT = this.t
      this.publish()
    }
  }

  private publish(): void {
    this.rebuild()
    for (const cb of this.subscribers) cb()
  }

  private rebuild(): void {
    const idx = Math.min(this.stepIndex, this.truth.samples.length - 1)
    const tru =
      this.driveMode === 'field'
        ? {
            t: this.t,
            s: this.free.s,
            x: this.free.x,
            y: this.free.y,
            psi: this.free.psi,
            v: this.free.v,
            omega: this.free.omega,
            aLong: this.free.aLong,
          }
        : this.truth.samples[idx]

    const drishtiError = Math.hypot(this.drishti.state.x - tru.x, this.drishti.state.y - tru.y)
    const naiveError = Math.hypot(this.naive.state.x - tru.x, this.naive.state.y - tru.y)
    const eskfError = Math.hypot(this.eskf.state.x - tru.x, this.eskf.state.y - tru.y)
    const distance = tru.s

    this.cached = {
      t: this.t,
      running: this.running,
      finished: this.finished,
      seed: this.seed,
      rateHz: this.rateHz,

      navState: this.navState,
      gnssMode: this.gnss.mode,

      truth: tru,
      drishti: { ...this.drishti.state },
      naive: { ...this.naive.state },
      eskf: { ...this.eskf.state },

      uncertainty: this.uncertainty.state,
      speed: this.speed,
      hypotheses: this.hypotheses,
      lastIntegrity: this.lastIntegrity,

      rejectedCount: this.rejectedCount,
      anomalyCount: this.anomalyCount,
      fixesLast3s: this.recentFixTimes.length,

      distance,
      drishtiError,
      naiveError,
      eskfError,
      // UNCLAMPED. If a long blackout breaks the target, that is honest.
      errorFraction: distance > 0 ? drishtiError / distance : 0,

      blackoutStart: this.blackoutStart,
      blackoutElapsed: this.blackoutStart === null ? 0 : this.t - this.blackoutStart,
      blackoutDistance:
        this.blackoutStartS === null ? 0 : Math.max(0, tru.s - this.blackoutStartS),
      blackoutStartS: this.blackoutStartS,
      blackoutEndS: this.blackoutEndS,

      alignProgress: this.alignProgress,
      blendProgress: this.blendProgress,

      imu: this.lastImu,
      shockActive: this.imu.shockActive(this.t),
      naiveOffMap: naiveError > OFF_MAP_ERROR,
      baselineFailureAt: this.baselineFailureAt,

      log: this.log,
      errorSeries: this.errorSeries,
      ablation: this.ablation,
      recoveryTime: this.recoveryTime,
      duration: this.truth.duration,

      driveMode: this.driveMode,
      commandedHeading: this.commandedHeading,
      headingError: Math.atan2(
        Math.sin(this.commandedHeading - tru.psi),
        Math.cos(this.commandedHeading - tru.psi)
      ),
      turnRate: tru.omega,
    }
    this.dirty = false
  }
}
