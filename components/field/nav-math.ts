/**
 * Pure display maths for the field navigation screen.
 *
 * This module holds NO state and models NO motion. It exists so the two pieces
 * of geometry the navigation UI depends on — shortest-angle rotation and the
 * simulation-frame-to-compass-bearing conversion — can be tested directly
 * rather than inferred from a rendered transform attribute.
 *
 * Nothing here advances a clock or integrates a position. The phone's vehicle
 * pose always arrives from Mission Control.
 */

export const RAD_TO_DEG = 180 / Math.PI

/**
 * Shortest signed rotation from `from` to `to`, in radians, always within
 * (-pi, pi].
 *
 * A naive `to - from` sends a heading crossing the +/-pi wrap the long way
 * round: 359 deg to 1 deg would spin backwards through 180 deg. Wrapping through
 * atan2 of the sine and cosine keeps the turn on the near side.
 */
export function shortestAngleDelta(to: number, from: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/**
 * One step of an exponential chase toward a target angle, taking the short way.
 * Used to smooth discrete socket updates into continuous rotation.
 */
export function chaseAngle(current: number, target: number, k: number): number {
  return current + shortestAngleDelta(target, current) * k
}

/**
 * Compass bearing, degrees clockwise from north, for a simulation heading.
 *
 * The simulation frame has psi = 0 along +x, which is east, and increases
 * counter-clockwise. A compass has 0 at north and increases clockwise, so the
 * two differ by a quarter turn and a reversal.
 */
export function bearingFromPsi(psi: number): number {
  return (((90 - psi * RAD_TO_DEG) % 360) + 360) % 360
}
