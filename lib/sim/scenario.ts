/**
 * The judge demonstration script.
 *
 * Every event is keyed to SIMULATION time, never to wall time. That is what
 * makes the run reproducible on a fast laptop and a projector-throttled one
 * alike, and it is why RESET followed by RUN produces the same numbers twice.
 *
 * MISSION COMPLETE is deliberately absent: it is not scripted, it fires when
 * the vehicle reaches the end of the route (about t=117 s).
 */

export type ScriptKind =
  | 'INIT'
  | 'ALIGNED'
  | 'GNSS_ACTIVE'
  | 'GNSS_DENIED'
  | 'POTHOLE'
  | 'SPOOF'
  | 'GNSS_RESTORE'
  | 'FUSED'

export interface ScriptEvent {
  t: number
  kind: ScriptKind
  label: string
  /** shown as a tick on the timeline strip */
  tick: boolean
}

export const JUDGE_SCRIPT: ScriptEvent[] = [
  { t: 0, kind: 'INIT', label: 'SYSTEM INITIALISING', tick: false },
  { t: 5, kind: 'ALIGNED', label: 'ALIGNMENT COMPLETE', tick: false },
  { t: 10, kind: 'GNSS_ACTIVE', label: 'GNSS ACTIVE', tick: false },
  { t: 15, kind: 'GNSS_DENIED', label: 'BLACKOUT', tick: true },
  { t: 18, kind: 'POTHOLE', label: 'POTHOLE', tick: true },
  { t: 38, kind: 'SPOOF', label: 'SPOOF', tick: true },
  { t: 45, kind: 'GNSS_RESTORE', label: 'GNSS RESTORED', tick: true },
  { t: 48, kind: 'FUSED', label: 'FUSION', tick: false },
]

/** Alignment duration, seconds. Ends automatically at the ALIGNED script beat. */
export const ALIGN_DURATION = 5
/** GNSS recovery blend, seconds. A visible position snap here is a demo failure. */
export const BLEND_DURATION = 2.5
/** Mount re-alignment after a phone slip, seconds. */
export const MOUNT_CHANGE_DURATION = 4
/** The spoofer transmits for this long before the jammer resumes. */
export const SPOOF_WINDOW = 2
