/**
 * Deterministic seeded procedural city for Three.js instancing.
 * Rendering-only — route geometry arrives via cityVisualConfig adapters.
 */

import type { ParkBlock, SyntheticRoad } from './cityVisualConfig'

export type District =
  | 'residential'
  | 'office'
  | 'commercial'
  | 'industrial'
  | 'research'

export interface ProceduralBuilding {
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  district: District
  tiered: boolean
}

export interface CityBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface ProceduralCityInput {
  seed: number
  bounds: CityBounds
  routeCenterline: { x: number; y: number }[]
  roads: SyntheticRoad[]
  parks: ParkBlock[]
  routeClearance: number
}

export interface ProceduralCityData {
  seed: number
  buildings: ProceduralBuilding[]
  parks: ParkBlock[]
  roads: SyntheticRoad[]
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

function districtAt(x: number, z: number, rng: () => number): District {
  const zones: District[] = ['residential', 'office', 'commercial', 'industrial', 'research']
  const idx = Math.floor(rng() * zones.length)
  const bias = Math.sin(x * 0.004) * Math.cos(z * 0.003)
  if (bias > 0.35) return 'office'
  if (bias < -0.35) return 'industrial'
  if (bias > 0.1) return 'commercial'
  if (bias < -0.1) return 'research'
  return zones[idx] ?? 'residential'
}

const DISTRICT_DIMS: Record<District, { w: [number, number]; d: [number, number]; h: [number, number] }> = {
  residential: { w: [10, 16], d: [9, 14], h: [7, 14] },
  office: { w: [14, 22], d: [12, 18], h: [18, 42] },
  commercial: { w: [18, 34], d: [14, 26], h: [10, 22] },
  industrial: { w: [24, 44], d: [16, 30], h: [8, 16] },
  research: { w: [14, 20], d: [12, 18], h: [16, 32] },
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function overlapsPark(
  x: number,
  z: number,
  w: number,
  d: number,
  parks: ParkBlock[]
): boolean {
  for (const p of parks) {
    if (
      x < p.x + p.width + 4 &&
      x + w + 4 > p.x &&
      z < p.y + p.height + 4 &&
      z + d + 4 > p.y
    ) {
      return true
    }
  }
  return false
}

/** Serializable descriptor fingerprint for deterministic tests. */
export function serializeCityDescriptors(data: ProceduralCityData): string {
  const rows = data.buildings.map(
    (b) =>
      `${b.district}|${b.x.toFixed(2)}|${b.z.toFixed(2)}|${b.width.toFixed(2)}|${b.depth.toFixed(2)}|${b.height.toFixed(2)}|${b.rotation.toFixed(3)}|${b.tiered ? 1 : 0}`
  )
  return `${data.seed}\n${rows.join('\n')}`
}

export function generateProceduralCity(input: ProceduralCityInput): ProceduralCityData {
  const rng = mulberry32(input.seed)
  const buildings: ProceduralBuilding[] = []
  const { bounds, routeCenterline, parks, roads } = input
  const clearance = input.routeClearance

  const spanX = bounds.maxX - bounds.minX
  const spanZ = bounds.maxY - bounds.minY
  const cols = Math.max(8, Math.floor(spanX / 38))
  const rows = Math.max(8, Math.floor(spanZ / 38))

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng() - 0.5) * 14
      const jitterZ = (rng() - 0.5) * 14
      const x = bounds.minX + (col + 0.15 + rng() * 0.7) * (spanX / cols) + jitterX
      const z = bounds.minY + (row + 0.15 + rng() * 0.7) * (spanZ / rows) + jitterZ

      const district = districtAt(x, z, rng)
      const dims = DISTRICT_DIMS[district]
      const width = lerp(dims.w[0], dims.w[1], rng())
      const depth = lerp(dims.d[0], dims.d[1], rng())
      const height = lerp(dims.h[0], dims.h[1], rng())
      const cx = x + width / 2
      const cz = z + depth / 2

      if (distToPolyline(cx, cz, routeCenterline) < clearance + Math.max(width, depth) * 0.35) {
        continue
      }
      if (overlapsPark(x, z, width, depth, parks)) continue

      const tiered = rng() > 0.92 && height > 20
      buildings.push({
        x,
        z,
        width,
        depth,
        height,
        rotation: (rng() - 0.5) * 0.12,
        district,
        tiered,
      })
    }
  }

  // Corridor street-edge rows hugging the route spine
  for (let i = 0; i < routeCenterline.length - 1; i += 2) {
    const a = routeCenterline[i]
    const b = routeCenterline[i + 1] ?? routeCenterline[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    for (const side of [-1, 1] as const) {
      const lateral = clearance + 10 + rng() * 16
      const bx = a.x + nx * lateral * side
      const bz = a.y + ny * lateral * side
      const district = side > 0 ? 'office' : 'commercial'
      const dims = DISTRICT_DIMS[district]
      const width = lerp(dims.w[0], dims.w[1], rng())
      const depth = lerp(dims.d[0], dims.d[1], rng())
      const height = lerp(dims.h[0], dims.h[1], rng())
      if (distToPolyline(bx, bz, routeCenterline) < clearance) continue
      buildings.push({
        x: bx - width / 2,
        z: bz - depth / 2,
        width,
        depth,
        height,
        rotation: Math.atan2(dy, dx),
        district,
        tiered: rng() > 0.88,
      })
    }
  }

  return {
    seed: input.seed,
    buildings,
    parks,
    roads,
  }
}
