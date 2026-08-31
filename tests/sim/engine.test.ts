import { describe, it, expect } from 'vitest'
import { Engine } from '../../lib/sim/engine'
import { DEFAULT_SEED } from '../../lib/sim/constants'

function runFull(batchMs: number) {
  const e = new Engine(DEFAULT_SEED)
  e.runJudgeDemo()
  let guard = 0
  while (!e.getSnapshot().finished && guard++ < 200000) e.advance(batchMs)
  const s = e.getSnapshot()
  return {
    t: s.t,
    distance: s.distance,
    drishtiError: s.drishtiError,
    naiveError: s.naiveError,
    errorFraction: s.errorFraction,
    rejected: s.rejectedCount,
    anomalies: s.anomalyCount,
    logLength: s.log.length,
  }
}

describe('engine', () => {
  it('produces identical results across two full runs at the same seed', () => {
    expect(runFull(16)).toEqual(runFull(16))
  })

  it('produces identical results regardless of frame batching', () => {
    // the guarantee that a slow machine cannot change the numbers
    expect(runFull(16)).toEqual(runFull(33))
  })

  it('reset restores the default seed and reruns identically', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    for (let i = 0; i < 500; i++) e.advance(16)
    const mid = e.getSnapshot().drishtiError
    e.reset()
    e.runJudgeDemo()
    for (let i = 0; i < 500; i++) e.advance(16)
    expect(e.getSnapshot().drishtiError).toBe(mid)
  })

  it('walks the state machine: ALIGNING -> GNSS_ACTIVE -> DR_ACTIVE -> REACQUIRING', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    const seen = new Set<string>()
    let guard = 0
    while (!e.getSnapshot().finished && guard++ < 200000) {
      e.advance(16)
      seen.add(e.getSnapshot().navState)
    }
    for (const s of ['ALIGNING', 'GNSS_ACTIVE', 'DR_ACTIVE', 'REACQUIRING']) {
      expect(seen.has(s)).toBe(true)
    }
  })

  it('rejects the spoofed fix and logs it', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    let guard = 0
    while (!e.getSnapshot().finished && guard++ < 200000) e.advance(16)
    const s = e.getSnapshot()
    expect(s.rejectedCount).toBeGreaterThanOrEqual(1)
    expect(s.log.some((l) => l.message.includes('REJECTED'))).toBe(true)
  })

  it('never jumps position during recovery', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    let prev = e.getSnapshot().drishti
    let maxJump = 0
    let guard = 0
    while (!e.getSnapshot().finished && guard++ < 200000) {
      e.advance(16)
      const cur = e.getSnapshot().drishti
      maxJump = Math.max(maxJump, Math.hypot(cur.x - prev.x, cur.y - prev.y))
      prev = cur
    }
    expect(maxJump).toBeLessThan(5)
  })

  it('does not clamp the error fraction', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    for (let i = 0; i < 3000; i++) e.advance(16)
    const s = e.getSnapshot()
    expect(s.errorFraction).toBeCloseTo(s.drishtiError / s.distance, 9)
  })

  it('holds a 30 s blackout with the clock and distance running', () => {
    const e = new Engine(DEFAULT_SEED)
    e.runJudgeDemo()
    let maxElapsed = 0
    let maxDist = 0
    let guard = 0
    while (!e.getSnapshot().finished && guard++ < 200000) {
      e.advance(16)
      const s = e.getSnapshot()
      maxElapsed = Math.max(maxElapsed, s.blackoutElapsed)
      maxDist = Math.max(maxDist, s.blackoutDistance)
    }
    expect(maxElapsed).toBeGreaterThan(25)
    expect(maxDist).toBeGreaterThan(200)
  })
})
