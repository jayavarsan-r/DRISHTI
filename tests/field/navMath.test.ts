import { describe, it, expect } from 'vitest'
import {
  shortestAngleDelta,
  chaseAngle,
  bearingFromPsi,
} from '../../components/field/nav-math'

const D = Math.PI / 180

describe('shortestAngleDelta', () => {
  it('takes the short way across the +/-pi wrap', () => {
    // 359 deg -> 1 deg is a 2 deg turn forward, not a 358 deg turn backwards
    const d = shortestAngleDelta(1 * D, 359 * D)
    expect(d).toBeCloseTo(2 * D, 9)
    expect(d).toBeGreaterThan(0)
  })

  it('is signed, and reverses with the arguments', () => {
    expect(shortestAngleDelta(359 * D, 1 * D)).toBeCloseTo(-2 * D, 9)
  })

  it('never returns a rotation larger than half a turn', () => {
    for (let a = -720; a <= 720; a += 7) {
      for (let b = -720; b <= 720; b += 13) {
        expect(Math.abs(shortestAngleDelta(a * D, b * D))).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    }
  })

  it('is zero for equal angles expressed a full turn apart', () => {
    expect(shortestAngleDelta(370 * D, 10 * D)).toBeCloseTo(0, 9)
  })
})

describe('chaseAngle', () => {
  it('converges on the target from the near side of the wrap', () => {
    let psi = 359 * D
    for (let i = 0; i < 200; i++) psi = chaseAngle(psi, 1 * D, 0.22)
    // 361 deg and 1 deg are the same heading; compare on the circle
    expect(Math.abs(shortestAngleDelta(psi, 1 * D))).toBeLessThan(1e-6)
  })

  it('never moves away from the target on the first step', () => {
    const before = Math.abs(shortestAngleDelta(1 * D, 359 * D))
    const after = Math.abs(shortestAngleDelta(1 * D, chaseAngle(359 * D, 1 * D, 0.22)))
    expect(after).toBeLessThan(before)
  })

  it('holds still once the target stops changing', () => {
    // A dropped link leaves the last state in place; the marker must settle,
    // never drift on past it.
    let psi = 0
    for (let i = 0; i < 500; i++) psi = chaseAngle(psi, 0.7, 0.22)
    expect(psi).toBeCloseTo(0.7, 9)
  })
})

describe('bearingFromPsi', () => {
  it('maps the simulation frame onto compass north', () => {
    expect(bearingFromPsi(0)).toBeCloseTo(90, 9) // +x is east
    expect(bearingFromPsi(Math.PI / 2)).toBeCloseTo(0, 9) // +y is north
    expect(bearingFromPsi(Math.PI)).toBeCloseTo(270, 9) // -x is west
  })

  it('always reports a bearing in [0, 360)', () => {
    for (let a = -1000; a <= 1000; a += 11) {
      const b = bearingFromPsi(a * D)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(360)
    }
  })
})
