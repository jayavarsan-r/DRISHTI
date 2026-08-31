import { describe, it, expect } from 'vitest'
import {
  SEGMENTS,
  ROUTE,
  ROUTE_LENGTH,
  INTERSECTION_S,
  poseAt,
  curvatureAt,
} from '../../lib/sim/road'

describe('road', () => {
  it('is about 1.4 km long', () => {
    expect(ROUTE_LENGTH).toBeGreaterThan(1300)
    expect(ROUTE_LENGTH).toBeLessThan(1500)
  })

  it('has a continuous centreline with no gaps', () => {
    for (let i = 1; i < ROUTE.length; i++) {
      const d = Math.hypot(ROUTE[i].x - ROUTE[i - 1].x, ROUTE[i].y - ROUTE[i - 1].y)
      expect(d).toBeLessThan(3)
    }
  })

  it('places the intersection inside the route', () => {
    expect(INTERSECTION_S).toBeGreaterThan(100)
    expect(INTERSECTION_S).toBeLessThan(ROUTE_LENGTH - 100)
  })

  it('carries a service road running 18 m parallel for ~250 m', () => {
    const svc = SEGMENTS.find((s) => s.id === 'service')!
    expect(svc).toBeDefined()
    expect(svc.isRoute).toBe(false)
    const dists = svc.points.map((p) =>
      Math.min(...ROUTE.map((r) => Math.hypot(r.x - p.x, r.y - p.y)))
    )
    for (const d of dists) {
      expect(d).toBeGreaterThan(16)
      expect(d).toBeLessThan(20)
    }
    let len = 0
    for (let i = 1; i < svc.points.length; i++) {
      len += Math.hypot(
        svc.points[i].x - svc.points[i - 1].x,
        svc.points[i].y - svc.points[i - 1].y
      )
    }
    expect(len).toBeGreaterThan(230)
  })

  it('poseAt heading is tangent to the path', () => {
    const a = poseAt(500)
    const b = poseAt(501)
    const expected = Math.atan2(b.y - a.y, b.x - a.x)
    expect(
      Math.abs(Math.atan2(Math.sin(a.psi - expected), Math.cos(a.psi - expected)))
    ).toBeLessThan(0.05)
  })

  it('reports high curvature in the 90 degree turns and near zero on straights', () => {
    expect(Math.abs(curvatureAt(20))).toBeLessThan(0.005)
    const maxK = Math.max(
      ...Array.from({ length: 1400 }, (_, s) => Math.abs(curvatureAt(s)))
    )
    expect(maxK).toBeGreaterThan(0.03)
  })
})
