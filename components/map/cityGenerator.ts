/**
 * Organic synthetic city — built around the existing DRISHTI route spine.
 * Frontend presentation only. No uniform road grid.
 */

import { poseAt, ROAD_BOUNDS, INTERSECTION_S, ROUTE_LENGTH } from '@/lib/sim/road'
import type {
  BuildingDef,
  BuildingType,
  LandmarkLabel,
  ParkBlock,
  SyntheticRoad,
} from './cityVisualConfig'

export const CITY_MARGIN = 320

export const CITY_BOUNDS = {
  minX: ROAD_BOUNDS.minX - CITY_MARGIN,
  maxX: ROAD_BOUNDS.maxX + CITY_MARGIN,
  minY: ROAD_BOUNDS.minY - CITY_MARGIN,
  maxY: ROAD_BOUNDS.maxY + CITY_MARGIN,
}

const ROUTE_BUFFER = 24
const BUILDING_SETBACK = 5

const BUILDING_SPECS: Record<
  BuildingType,
  { width: number; depth: number; height: number }
> = {
  house: { width: 12, depth: 10, height: 8 },
  office: { width: 16, depth: 14, height: 28 },
  mall: { width: 38, depth: 28, height: 14 },
  warehouse: { width: 42, depth: 22, height: 10 },
  hospital: { width: 32, depth: 24, height: 22 },
  hotel: { width: 18, depth: 16, height: 20 },
  parking: { width: 28, depth: 20, height: 4 },
  terminal: { width: 30, depth: 22, height: 16 },
  station: { width: 22, depth: 18, height: 12 },
  research: { width: 20, depth: 16, height: 24 },
}

function hash2(a: number, b: number): number {
  return Math.abs((a * 73856093) ^ (b * 19349663)) % 10000
}

type District =
  | 'residential'
  | 'research'
  | 'commercial'
  | 'industrial'
  | 'mixed'
  | 'campus'

interface CityBlock {
  id: string
  district: District
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  buildingMix: BuildingType[]
  park?: boolean
}

function offsetPoint(
  x: number,
  y: number,
  psi: number,
  lateral: number
): { x: number; y: number } {
  return {
    x: x + lateral * Math.cos(psi + Math.PI / 2),
    y: y + lateral * Math.sin(psi + Math.PI / 2),
  }
}

function sampleRoute(fromS: number, toS: number, step = 10): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let s = fromS; s <= toS; s += step) {
    const p = poseAt(s)
    pts.push({ x: p.x, y: p.y })
  }
  return pts
}

function parallelRoad(
  id: string,
  name: string,
  fromS: number,
  toS: number,
  lateral: number,
  tier: SyntheticRoad['tier']
): SyntheticRoad {
  const pts: { x: number; y: number }[] = []
  for (let s = fromS; s <= toS; s += 8) {
    const p = poseAt(s)
    pts.push(offsetPoint(p.x, p.y, p.psi, lateral))
  }
  return { id, name, points: pts, tier }
}

function curvedRoad(
  id: string,
  name: string,
  points: { x: number; y: number }[],
  tier: SyntheticRoad['tier']
): SyntheticRoad {
  return { id, name, points, tier }
}

function arcPoints(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  steps = 12
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = ((startDeg + (endDeg - startDeg) * t) * Math.PI) / 180
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) })
  }
  return pts
}

/** Major + secondary roads that follow the route spine and connect districts — NOT a grid. */
function generateOrganicRoads(): SyntheticRoad[] {
  const roads: SyntheticRoad[] = []
  const ix = poseAt(INTERSECTION_S)
  const p120 = poseAt(120)
  const p280 = poseAt(280)
  const p400 = poseAt(400)
  const p550 = poseAt(550)
  const p750 = poseAt(750)
  const p1000 = poseAt(1000)

  // ── Major arterials (parallel to route spine) ──
  roads.push(parallelRoad('art-nehru', 'NEHRU AVENUE', 0, 270, -48, 'major'))
  roads.push(parallelRoad('art-orbital', 'ORBITAL BOULEVARD', 350, 620, 52, 'major'))
  roads.push(parallelRoad('art-mission', 'MISSION CONTROL ROAD', 680, 920, -46, 'major'))
  roads.push(parallelRoad('art-isro', 'ISRO CAMPUS ROAD', 900, ROUTE_LENGTH, 44, 'major'))

  // ── Curved connector: NH-44 commercial belt → residential north-west ──
  const nw = offsetPoint(p120.x, p120.y, p120.psi, -70)
  roads.push(
    curvedRoad(
      'conn-nw-res',
      'ASTRA AVENUE',
      [
        offsetPoint(p120.x, p120.y, p120.psi, -48),
        { x: nw.x - 40, y: nw.y - 20 },
        { x: CITY_BOUNDS.minX + 80, y: nw.y - 30 },
        { x: CITY_BOUNDS.minX + 60, y: CITY_BOUNDS.minY + 90 },
      ],
      'secondary'
    )
  )

  // ── Curved road around tech / tunnel approach ──
  const techE = offsetPoint(p400.x, p400.y, p400.psi, 58)
  roads.push(
    curvedRoad(
      'conn-tech-curve',
      'TECH PARK ROAD',
      [
        offsetPoint(p280.x, p280.y, p280.psi, 50),
        { x: techE.x + 15, y: p280.y + 15 },
        { x: techE.x + 20, y: p400.y - 20 },
        { x: techE.x, y: techE.y },
      ],
      'secondary'
    )
  )

  // ── Science park crescent (west of vertical leg) ──
  const sciW = offsetPoint(p400.x, p400.y, p400.psi, -55)
  roads.push(
    curvedRoad(
      'conn-science-crescent',
      'RESEARCH DRIVE',
      arcPoints(sciW.x - 30, sciW.y + 40, 55, 200, 340, 14),
      'secondary'
    )
  )

  // ── Commercial east belt ──
  roads.push(
    curvedRoad(
      'conn-commercial',
      'SATELLITE AVENUE',
      [
        offsetPoint(p550.x, p550.y, p550.psi, 55),
        { x: p550.x + 90, y: p550.y + 40 },
        { x: p750.x + 100, y: p750.y + 20 },
        { x: CITY_BOUNDS.maxX - 70, y: p750.y + 60 },
      ],
      'major'
    )
  )

  // ── Industrial service road (south-west) ──
  roads.push(
    curvedRoad(
      'conn-industrial',
      'LAUNCH COMPLEX ROAD',
      [
        { x: CITY_BOUNDS.minX + 70, y: CITY_BOUNDS.minY + 60 },
        { x: p280.x - 80, y: p280.y - 50 },
        offsetPoint(ix.x, ix.y, ix.psi, -65),
        { x: ix.x - 90, y: ix.y - 70 },
      ],
      'secondary'
    )
  )

  // ── Research campus loop (east, istrac) ──
  const resE = offsetPoint(p1000.x, p1000.y, p1000.psi, 55)
  roads.push(
    curvedRoad(
      'conn-research-loop',
      'DISCOVERY ROAD',
      [
        resE,
        { x: resE.x + 50, y: resE.y + 25 },
        { x: resE.x + 45, y: resE.y + 70 },
        { x: resE.x - 10, y: resE.y + 85 },
        { x: resE.x - 40, y: resE.y + 40 },
      ],
      'secondary'
    )
  )

  // ── Local cross-streets (short, irregular — NOT grid) ──
  const crossPoints = [150, 320, 480, 620, 800, 1050]
  crossPoints.forEach((s, i) => {
    const p = poseAt(s)
    const spread = 35 + (i % 3) * 12
    roads.push({
      id: `local-cross-${i}`,
      name: i % 2 === 0 ? 'BLOCK STREET' : 'ACCESS ROAD',
      points: [
        offsetPoint(p.x, p.y, p.psi, spread),
        offsetPoint(p.x, p.y, p.psi, -spread),
      ],
      tier: 'minor',
    })
  })

  // ── Cul-de-sac residential streets (north) ──
  const resN = offsetPoint(p550.x, p550.y, p550.psi, -50)
  roads.push({
    id: 'local-culdesac-1',
    name: 'NORTH LINK',
    points: [
      { x: resN.x - 30, y: resN.y + 50 },
      { x: resN.x - 55, y: resN.y + 90 },
      { x: resN.x - 25, y: resN.y + 110 },
    ],
    tier: 'minor',
  })
  roads.push({
    id: 'local-culdesac-2',
    name: 'ALLEY 7',
    points: [
      { x: CITY_BOUNDS.minX + 100, y: CITY_BOUNDS.maxY - 100 },
      { x: CITY_BOUNDS.minX + 130, y: CITY_BOUNDS.maxY - 60 },
      { x: CITY_BOUNDS.minX + 95, y: CITY_BOUNDS.maxY - 40 },
    ],
    tier: 'minor',
  })

  // ── Intersection tie-ins near dhawan ──
  roads.push({
    id: 'local-ix-tie',
    name: 'SERVICE WAY',
    points: [
      offsetPoint(ix.x, ix.y, ix.psi, 50),
      { x: ix.x + 75, y: ix.y + 35 },
      { x: ix.x + 90, y: ix.y - 25 },
    ],
    tier: 'minor',
  })

  // ── Tunnel approach connectors (do not overlap tunnel s=285-515) ──
  const tunEnt = poseAt(285)
  const tunExit = poseAt(515)
  roads.push({
    id: 'local-tunnel-approach',
    name: 'TUNNEL ACCESS',
    points: [
      offsetPoint(tunEnt.x, tunEnt.y, tunEnt.psi, 42),
      offsetPoint(tunExit.x, tunExit.y, tunExit.psi, 42),
    ],
    tier: 'minor',
  })

  return roads
}

/** Hand-placed irregular blocks clustered around the route spine. */
function defineCityBlocks(): CityBlock[] {
  const blocks: CityBlock[] = []
  const ix = poseAt(INTERSECTION_S)

  const addBlock = (
    id: string,
    district: District,
    s: number,
    lateral: number,
    w: number,
    h: number,
    mix: BuildingType[],
    park = false
  ) => {
    const p = poseAt(s)
    const c = offsetPoint(p.x, p.y, p.psi, lateral)
    blocks.push({
      id,
      district,
      x: c.x - w / 2,
      y: c.y - h / 2,
      width: w,
      height: h,
      buildingMix: mix,
      park,
    })
  }

  // ── NH-44 approach: commercial south, residential north ──
  addBlock('blk-nh-comm', 'commercial', 80, -55, 70, 45, ['mall', 'parking', 'hotel'])
  addBlock('blk-nh-res-a', 'residential', 60, 55, 55, 40, ['house', 'house', 'house'])
  addBlock('blk-nh-res-b', 'residential', 180, 50, 60, 38, ['house', 'house', 'office'])
  addBlock('blk-nh-park', 'mixed', 140, -70, 50, 35, [], true)

  // ── Pre-ramp tech / orbital ──
  addBlock('blk-tech-a', 'campus', 250, 58, 65, 50, ['research', 'office', 'parking'])
  addBlock('blk-tech-b', 'campus', 310, -52, 55, 42, ['office', 'research', 'office'])
  addBlock('blk-orbital', 'commercial', 350, 62, 75, 48, ['mall', 'parking', 'hotel'])

  // ── Sarabhai vertical: science west, offices east ──
  addBlock('blk-science', 'campus', 400, -58, 80, 55, ['research', 'research', 'station'])
  addBlock('blk-science-park', 'campus', 450, -65, 45, 40, [], true)
  addBlock('blk-sarabhai-off', 'mixed', 420, 55, 60, 45, ['office', 'office', 'parking'])
  addBlock('blk-sarabhai-off-b', 'mixed', 480, 52, 55, 40, ['office', 'hotel'])

  // ── Curve area ──
  addBlock('blk-curve-comm', 'commercial', 560, -50, 70, 50, ['mall', 'terminal', 'parking'])
  addBlock('blk-curve-res', 'residential', 600, 48, 50, 38, ['house', 'house'])
  addBlock('blk-curve-park', 'mixed', 640, -60, 42, 35, [], true)

  // ── Central / dhawan intersection ──
  addBlock('blk-central-a', 'mixed', INTERSECTION_S - 40, 55, 65, 48, ['office', 'hospital', 'parking'])
  addBlock('blk-central-b', 'mixed', INTERSECTION_S + 30, -52, 58, 42, ['office', 'terminal', 'office'])
  addBlock('blk-central-plaza', 'commercial', INTERSECTION_S, 68, 40, 30, [], true)

  // ── Dhawan road stretch ──
  addBlock('blk-dhawan-a', 'mixed', 820, 50, 60, 42, ['office', 'office', 'parking'])
  addBlock('blk-dhawan-b', 'residential', 880, -48, 55, 38, ['house', 'house', 'house'])

  // ── ISTRAC / research east, industrial west ──
  addBlock('blk-research', 'campus', 980, 58, 85, 60, ['research', 'terminal', 'research', 'station'])
  addBlock('blk-research-park', 'campus', 1050, 65, 48, 38, [], true)
  addBlock('blk-industrial', 'industrial', 950, -62, 90, 50, ['warehouse', 'warehouse', 'parking'])
  addBlock('blk-industrial-b', 'industrial', 1100, -55, 75, 45, ['warehouse', 'parking'])

  // ── Edge districts for pan discovery ──
  blocks.push({
    id: 'blk-edge-nw',
    district: 'residential',
    x: CITY_BOUNDS.minX + 40,
    y: CITY_BOUNDS.maxY - 120,
    width: 100,
    height: 80,
    buildingMix: ['house', 'house', 'house', 'house', 'office'],
  })
  blocks.push({
    id: 'blk-edge-ne',
    district: 'research',
    x: CITY_BOUNDS.maxX - 140,
    y: CITY_BOUNDS.maxY - 100,
    width: 110,
    height: 75,
    buildingMix: ['research', 'office', 'research', 'station'],
  })
  blocks.push({
    id: 'blk-edge-sw',
    district: 'industrial',
    x: CITY_BOUNDS.minX + 30,
    y: CITY_BOUNDS.minY + 40,
    width: 120,
    height: 70,
    buildingMix: ['warehouse', 'warehouse', 'warehouse', 'parking'],
  })
  blocks.push({
    id: 'blk-edge-se',
    district: 'commercial',
    x: CITY_BOUNDS.maxX - 130,
    y: CITY_BOUNDS.minY + 50,
    width: 100,
    height: 65,
    buildingMix: ['mall', 'parking', 'hotel', 'office'],
  })
  blocks.push({
    id: 'blk-edge-n-park',
    district: 'mixed',
    x: (ix.x + CITY_BOUNDS.maxX) / 2 - 40,
    y: CITY_BOUNDS.maxY - 90,
    width: 80,
    height: 55,
    buildingMix: [],
    park: true,
  })
  blocks.push({
    id: 'blk-edge-w-mixed',
    district: 'mixed',
    x: CITY_BOUNDS.minX + 50,
    y: ix.y - 30,
    width: 75,
    height: 55,
    buildingMix: ['office', 'house', 'house', 'parking'],
  })

  // ── Additional irregular blocks (fill gaps without grid) ──
  addBlock('blk-mid-a', 'residential', 200, 62, 48, 36, ['house', 'house', 'house'])
  addBlock('blk-mid-b', 'mixed', 520, -45, 52, 40, ['office', 'parking', 'office'])
  addBlock('blk-mid-c', 'residential', 700, 52, 50, 36, ['house', 'house'])
  addBlock('blk-mid-d', 'campus', 720, -55, 58, 44, ['research', 'office'])
  addBlock('blk-mid-e', 'industrial', 1150, -58, 70, 48, ['warehouse', 'parking'])
  addBlock('blk-mid-f', 'commercial', 1150, 50, 65, 42, ['hotel', 'office', 'parking'])
  addBlock('blk-mid-g', 'residential', 40, 48, 45, 35, ['house', 'house'])
  addBlock('blk-mid-h', 'mixed', 900, 55, 55, 40, ['office', 'office', 'parking'])
  addBlock('blk-mid-park-a', 'mixed', 300, -68, 40, 32, [], true)
  addBlock('blk-mid-park-b', 'mixed', 780, 62, 38, 30, [], true)

  return blocks
}

function distToRouteSamples(
  x: number,
  y: number,
  samples: { x: number; y: number }[]
): number {
  let min = Infinity
  for (const p of samples) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < min) min = d
  }
  return min
}

function getDistrict(cx: number, cy: number): District {
  const routeMidX = (ROAD_BOUNDS.minX + ROAD_BOUNDS.maxX) / 2
  const routeMidY = (ROAD_BOUNDS.minY + ROAD_BOUNDS.maxY) / 2
  const ix = poseAt(INTERSECTION_S)

  if (cx > ix.x + 80 && cy > routeMidY) return 'research'
  if (cy > routeMidY + 80) return 'residential'
  if (Math.hypot(cx - ix.x, cy - ix.y) < 120) return 'mixed'
  if (cx > 300 && cx < 450 && cy > 150 && cy < 350) return 'campus'
  if (cx < routeMidX - 40 && cy < routeMidY) return 'commercial'
  if (cx < routeMidX - 60 || cy < routeMidY - 80) return 'industrial'
  return 'research'
}

function fillBlock(
  block: CityBlock,
  routeSamples: { x: number; y: number }[],
  bldStartIdx: number
): { buildings: BuildingDef[]; park?: ParkBlock } {
  if (block.park) {
    return {
      buildings: [],
      park: {
        id: `park-${block.id}`,
        x: block.x + 4,
        y: block.y + 4,
        width: block.width - 8,
        height: block.height - 8,
      },
    }
  }

  const buildings: BuildingDef[] = []
  const mix = block.buildingMix
  if (mix.length === 0) return { buildings }

  const innerW = block.width - BUILDING_SETBACK * 2
  const innerH = block.height - BUILDING_SETBACK * 2
  const count = Math.min(mix.length, innerW > 55 ? 4 : innerW > 40 ? 3 : 2)
  let idx = bldStartIdx

  const cols = count >= 4 ? 2 : count >= 3 ? 3 : count
  const rows = Math.ceil(count / cols)

  for (let i = 0; i < count; i++) {
    const type = mix[i % mix.length]
    const spec = BUILDING_SPECS[type]
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellW = innerW / cols - 3
    const cellH = innerH / rows - 3
    const w = Math.min(spec.width, cellW)
    const d = Math.min(spec.depth, cellH)
    const px = block.x + BUILDING_SETBACK + col * (cellW + 3) + (cellW - w) / 2
    const py = block.y + BUILDING_SETBACK + row * (cellH + 3) + (cellH - d) / 2

    if (distToRouteSamples(px + w / 2, py + d / 2, routeSamples) < ROUTE_BUFFER) continue

    buildings.push({
      id: `bld-${block.id}-${idx}`,
      type,
      x: px,
      y: py,
      width: w,
      depth: d,
      height: spec.height,
      rotation: 0,
    })
    idx++
  }

  return { buildings }
}

function generateStreetFacades(
  roads: SyntheticRoad[],
  routeSamples: { x: number; y: number }[]
): BuildingDef[] {
  const facades: BuildingDef[] = []
  let idx = 0

  const districtHeights: Record<District, [number, number]> = {
    residential: [10, 16],
    research: [22, 32],
    commercial: [18, 28],
    industrial: [8, 14],
    mixed: [14, 24],
    campus: [20, 30],
  }

  const districtTypes: Record<District, BuildingType[]> = {
    residential: ['house', 'house', 'office'],
    research: ['research', 'office', 'research'],
    commercial: ['office', 'hotel', 'office'],
    industrial: ['warehouse', 'warehouse'],
    mixed: ['office', 'house', 'office'],
    campus: ['research', 'office', 'research'],
  }

  for (const road of roads) {
    if (road.tier === 'minor' && road.points.length < 3) continue
    const step = road.tier === 'major' ? 22 : 26

    for (let i = 0; i < road.points.length - 1; i += Math.max(1, Math.floor(step / 8))) {
      const a = road.points[i]
      const b = road.points[Math.min(i + 1, road.points.length - 1)]
      const tang = Math.atan2(b.y - a.y, b.x - a.x)
      const distAlong = Math.hypot(b.x - a.x, b.y - a.y)
      if (distAlong < 8) continue

      const district = getDistrict(a.x, a.y)
      const [hMin, hMax] = districtHeights[district]
      const types = districtTypes[district]

      for (const side of [-1, 1] as const) {
        const lateral = side * (road.tier === 'major' ? 28 : 22)
        const cx = a.x + lateral * Math.cos(tang + Math.PI / 2)
        const cy = a.y + lateral * Math.sin(tang + Math.PI / 2)

        if (distToRouteSamples(cx, cy, routeSamples) < ROUTE_BUFFER + 4) continue

        const h = hash2(Math.floor(cx), Math.floor(cy))
        const type = types[h % types.length]
        const spec = BUILDING_SPECS[type]
        const height = hMin + (h % (hMax - hMin + 1))
        const w = 14 + (h % 8)
        const d = 12 + (h % 6)
        const rot = (tang * 180) / Math.PI + (side === -1 ? 180 : 0)

        facades.push({
          id: `facade-${idx}`,
          type,
          x: cx - w / 2,
          y: cy - d / 2,
          width: w,
          depth: d,
          height,
          rotation: rot,
          isFacade: true,
        })
        idx++
      }
    }
  }

  // Façade rows along route spine (both sides, offset from driven path)
  for (let s = 50; s < ROUTE_LENGTH - 50; s += 24) {
    const p = poseAt(s)
    const district = getDistrict(p.x, p.y)
    const [hMin, hMax] = districtHeights[district]
    const types = districtTypes[district]

    for (const lateral of [38, -38] as const) {
      const c = offsetPoint(p.x, p.y, p.psi, lateral)
      if (distToRouteSamples(c.x, c.y, routeSamples) < ROUTE_BUFFER) continue
      if (s >= 285 && s <= 515 && Math.abs(lateral) < 42) continue

      const h = hash2(s, lateral)
      const type = types[h % types.length]
      const height = hMin + (h % (hMax - hMin + 1))
      const w = 16 + (h % 6)
      const d = 13 + (h % 5)

      facades.push({
        id: `spine-facade-${idx}`,
        type,
        x: c.x - w / 2,
        y: c.y - d / 2,
        width: w,
        depth: d,
        height,
        rotation: (p.psi * 180) / Math.PI,
        isFacade: true,
      })
      idx++
    }
  }

  return facades
}

function generateLandmarks(buildings: BuildingDef[]): LandmarkLabel[] {
  const landmarks: LandmarkLabel[] = []
  const ix = poseAt(INTERSECTION_S)
  const p1 = poseAt(120)
  const p2 = poseAt(420)
  const p4 = poseAt(950)
  const p5 = poseAt(680)

  const landmarkDefs: {
    name: string
    x: number
    y: number
    type: BuildingType
    tier: 'major' | 'minor'
  }[] = [
    { name: 'CENTRAL MALL', x: p1.x + 50, y: p1.y - 40, type: 'mall', tier: 'minor' },
    { name: 'TECH PARK', x: offsetPoint(p2.x, p2.y, p2.psi, 62).x, y: offsetPoint(p2.x, p2.y, p2.psi, 62).y, type: 'office', tier: 'major' },
    { name: 'SCIENCE PARK', x: offsetPoint(p2.x, p2.y, p2.psi, -62).x, y: offsetPoint(p2.x, p2.y, p2.psi, -62).y, type: 'research', tier: 'major' },
    { name: 'ORBITAL PLAZA', x: p2.x - 50, y: p2.y - 30, type: 'mall', tier: 'minor' },
    { name: 'SATELLITE CONTROL', x: p5.x + 60, y: p5.y - 25, type: 'terminal', tier: 'major' },
    { name: 'ISRO RESEARCH CAMPUS', x: ix.x - 75, y: ix.y + 60, type: 'research', tier: 'major' },
    { name: 'MISSION CONTROL', x: ix.x + 60, y: ix.y - 45, type: 'office', tier: 'major' },
    { name: 'NORTH TERMINAL', x: p4.x - 55, y: p4.y + 45, type: 'terminal', tier: 'minor' },
    { name: 'SPACE OPERATIONS CENTER', x: offsetPoint(p4.x, p4.y, p4.psi, 58).x, y: offsetPoint(p4.x, p4.y, p4.psi, 58).y, type: 'terminal', tier: 'major' },
    { name: 'SATELLITE PARK', x: p5.x - 60, y: p5.y + 40, type: 'research', tier: 'minor' },
  ]

  landmarkDefs.forEach((lm, i) => {
    const spec = BUILDING_SPECS[lm.type]
    buildings.push({
      id: `lm-bld-${i}`,
      type: lm.type,
      label: lm.name,
      x: lm.x - spec.width / 2,
      y: lm.y - spec.depth / 2,
      width: spec.width,
      depth: spec.depth,
      height: spec.height + 8,
      rotation: 0,
      isLandmark: true,
    })
    landmarks.push({
      id: `lm-${i}`,
      name: lm.name,
      x: lm.x,
      y: lm.y - spec.depth / 2 - 8,
      tier: lm.tier,
    })
  })

  return landmarks
}

export function generateCity(): {
  buildings: BuildingDef[]
  syntheticRoads: SyntheticRoad[]
  parks: ParkBlock[]
  landmarks: LandmarkLabel[]
} {
  const routeSamples = sampleRoute(0, ROUTE_LENGTH, 15)
  const roads = generateOrganicRoads()
  const blocks = defineCityBlocks()

  const buildings: BuildingDef[] = []
  const parks: ParkBlock[] = []
  let bldIdx = 0

  for (const block of blocks) {
    const result = fillBlock(block, routeSamples, bldIdx)
    buildings.push(...result.buildings)
    if (result.park) parks.push(result.park)
    bldIdx += result.buildings.length
  }

  const facades = generateStreetFacades(roads, routeSamples)
  buildings.push(...facades)

  const landmarks = generateLandmarks(buildings)

  return {
    buildings,
    syntheticRoads: roads,
    parks,
    landmarks,
  }
}
