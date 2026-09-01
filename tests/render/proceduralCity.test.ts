import { describe, expect, it } from 'vitest'
import {
  CITY_BOUNDS,
  PARKS,
  ROUTE_VISUAL_POINTS,
  SYNTHETIC_ROADS,
  TUNNEL,
} from '@/components/map/cityVisualConfig'
import {
  generateProceduralCity,
  serializeCityDescriptors,
} from '@/components/map/proceduralCity'

const ROUTE_CLEARANCE = 26

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distToPolyline(x: number, y: number, line: { x: number; y: number }[]): number {
  let min = Infinity
  for (let i = 1; i < line.length; i++) {
    const d = distToSegment(x, y, line[i - 1].x, line[i - 1].y, line[i].x, line[i].y)
    if (d < min) min = d
  }
  return min
}

describe('proceduralCity', () => {
  const baseInput = {
    bounds: CITY_BOUNDS,
    routeCenterline: ROUTE_VISUAL_POINTS,
    roads: SYNTHETIC_ROADS,
    parks: PARKS,
    routeClearance: ROUTE_CLEARANCE,
  }

  it('produces identical descriptors for the same seed', () => {
    const a = generateProceduralCity({ ...baseInput, seed: 42 })
    const b = generateProceduralCity({ ...baseInput, seed: 42 })
    expect(serializeCityDescriptors(a)).toBe(serializeCityDescriptors(b))
    expect(a.buildings.length).toBeGreaterThan(20)
  })

  it('produces different layouts for different seeds', () => {
    const a = generateProceduralCity({ ...baseInput, seed: 42 })
    const b = generateProceduralCity({ ...baseInput, seed: 99 })
    expect(serializeCityDescriptors(a)).not.toBe(serializeCityDescriptors(b))
  })

  it('keeps generated buildings outside the driven corridor', () => {
    const city = generateProceduralCity({ ...baseInput, seed: 0x44524953 })
    for (const b of city.buildings) {
      const cx = b.x + b.width / 2
      const cz = b.z + b.depth / 2
      const corridorDist = distToPolyline(cx, cz, ROUTE_VISUAL_POINTS)
      const footprint = Math.max(b.width, b.depth) * 0.35
      expect(corridorDist).toBeGreaterThanOrEqual(ROUTE_CLEARANCE - footprint - 0.5)
    }
  })

  it('includes tunnel centerline clearance along the blackout corridor', () => {
    const city = generateProceduralCity({ ...baseInput, seed: 0x44524953 })
    for (const b of city.buildings) {
      const cx = b.x + b.width / 2
      const cz = b.z + b.depth / 2
      const tunnelDist = distToPolyline(cx, cz, TUNNEL.centerline)
      const footprint = Math.max(b.width, b.depth) * 0.35
      expect(tunnelDist).toBeGreaterThanOrEqual(ROUTE_CLEARANCE - footprint - 0.5)
    }
  })
})
