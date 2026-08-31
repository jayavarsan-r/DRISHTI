/**
 * Method constants and simulation tuning.
 *
 * The two values marked METHOD CONSTANT are the sole carve-out to the
 * "no numeric literal in a metric slot" rule: they are properties of the
 * technique, not results of a run. Everything the UI renders as a *result*
 * is computed at runtime and lives in the engine snapshot.
 */

export const DEFAULT_SEED = 26168

/** METHOD CONSTANT: chi-square critical value, 2 degrees of freedom, 99th percentile. */
export const CHI2_2DOF_99 = 9.21

/** METHOD CONSTANT: the ISRO drift threshold. Labelled TARGET in the UI, never ACHIEVED. */
export const TARGET_ERROR_FRACTION = 0.1

/** Physics integrates at a fixed rate, decoupled from render rate. */
export const PHYSICS_HZ = 100

/** Numeric panels refresh here — faster than a human reads a number. */
export const SNAPSHOT_HZ = 20

/** Trajectory points are decimated to this rate before being drawn. */
export const TRAIL_HZ = 20

/**
 * Caps catch-up work after a tab stall. Sim time then lags wall time on a slow
 * machine, but the *sequence* of states is unchanged, so results stay identical.
 */
export const MAX_STEPS_PER_FRAME = 8
