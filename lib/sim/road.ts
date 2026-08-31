/**
 * Road network in a local metric frame (metres, origin 0,0).
 *
 * The centreline is generated from a list of straight/arc ops rather than
 * hand-typed coordinates: hand-typed points cannot guarantee tangent
 * continuity, and a heading discontinuity would inject a fake turn rate into
 * the ground truth that the estimators would then dutifully track.
 */

export interface Vec2 {
  x: number
  y: number
}

export interface Segment {
  id: string
  name: string
  points: Vec2[]
  /** m/s */
  speedLimit: number
  /** true if this segment is part of the driven route */
  isRoute: boolean
}

type Op =
  | { kind: 'straight'; length: number; id: string; name: string; speedLimit: number }
  | {
      kind: 'arc'
      radius: number
      /** positive = left turn (CCW), negative = right */
      deltaDeg: number
      id: string
      name: string
      speedLimit: number
    }

const KMH = 1 / 3.6

/**
 * ~1393 m route. Feature list is driven by what the demo has to show:
 * a long straight to establish agreement, a tight turn to expose gyro bias,
 * a gentle curve, a 4-way stop that makes ZUPT demonstrable, and a stretch
 * with a parallel service road that makes the map hypotheses genuinely split.
 */
const OPS: Op[] = [
  { kind: 'straight', length: 300, id: 'nh44', name: 'NH-44 APPROACH', speedLimit: 60 * KMH },
  { kind: 'arc', radius: 25, deltaDeg: 90, id: 'ramp', name: 'AMBEDKAR JUNCTION RAMP', speedLimit: 29 * KMH },
  { kind: 'straight', length: 180, id: 'sarabhai', name: 'VIKRAM SARABHAI MARG', speedLimit: 50 * KMH },
  { kind: 'arc', radius: 200, deltaDeg: -50, id: 'curve', name: 'SARABHAI CURVE', speedLimit: 50 * KMH },
  { kind: 'straight', length: 60, id: 'bhabha', name: 'BHABHA CROSS APPROACH', speedLimit: 40 * KMH },
  { kind: 'straight', length: 250, id: 'dhawan', name: 'SATISH DHAWAN ROAD', speedLimit: 50 * KMH },
  { kind: 'arc', radius: 25, deltaDeg: -90, id: 'antariksh', name: 'ANTARIKSH TURN', speedLimit: 29 * KMH },
  { kind: 'straight', length: 350, id: 'istrac', name: 'ISTRAC APPROACH', speedLimit: 60 * KMH },
]

/** Station spacing of the densified centreline, in metres. */
const DS = 1

interface Station {
  x: number
  y: number
  psi: number
  k: number
  segIndex: number
}

function buildCentreline(): { stations: Station[]; segments: Segment[] } {
  const stations: Station[] = []
  const segments: Segment[] = []

  let x = 0
  let y = 0
  let psi = 0

  OPS.forEach((op, segIndex) => {
    const pts: Vec2[] = [{ x, y }]

    if (op.kind === 'straight') {
      const n = Math.round(op.length / DS)
      for (let i = 0; i < n; i++) {
        stations.push({ x, y, psi, k: 0, segIndex })
        x += Math.cos(psi) * DS
        y += Math.sin(psi) * DS
        pts.push({ x, y })
      }
    } else {
      const delta = (op.deltaDeg * Math.PI) / 180
      const sign = Math.sign(delta)
      const arcLen = Math.abs(delta) * op.radius
      const n = Math.round(arcLen / DS)
      const k = sign / op.radius
      for (let i = 0; i < n; i++) {
        stations.push({ x, y, psi, k, segIndex })
        psi += k * DS
        x += Math.cos(psi) * DS
        y += Math.sin(psi) * DS
        pts.push({ x, y })
      }
    }

    segments.push({
      id: op.id,
      name: op.name,
      points: pts,
      speedLimit: op.speedLimit,
      isRoute: true,
    })
  })

  // terminal station so poseAt(ROUTE_LENGTH) is well defined
  stations.push({ x, y, psi, k: 0, segIndex: OPS.length - 1 })
  return { stations, segments }
}

const { stations: STATIONS, segments: ROUTE_SEGMENTS } = buildCentreline()

export const ROUTE: Vec2[] = STATIONS.map((s) => ({ x: s.x, y: s.y }))
export const ROUTE_LENGTH = (STATIONS.length - 1) * DS

/** Arc length at which the 4-way stop sits: the dhawan segment boundary. */
export const INTERSECTION_S = (() => {
  const idx = OPS.findIndex((o) => o.id === 'dhawan')
  let s = 0
  for (let i = 0; i < idx; i++) {
    const op = OPS[i]
    s += op.kind === 'straight' ? op.length : (Math.abs(op.deltaDeg) * Math.PI * op.radius) / 180
  }
  return s
})()

function stationIndex(s: number): number {
  const i = Math.floor(s / DS)
  return Math.max(0, Math.min(STATIONS.length - 1, i))
}

export function poseAt(s: number): { x: number; y: number; psi: number } {
  const i = stationIndex(s)
  const a = STATIONS[i]
  const b = STATIONS[Math.min(i + 1, STATIONS.length - 1)]
  const f = Math.max(0, Math.min(1, (s - i * DS) / DS))
  // heading is interpolated on the shortest arc so the wrap at +/-pi is clean
  const dpsi = Math.atan2(Math.sin(b.psi - a.psi), Math.cos(b.psi - a.psi))
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    psi: a.psi + dpsi * f,
  }
}

/** Signed curvature (1/m). Stored during construction, so this is a lookup. */
export function curvatureAt(s: number): number {
  return STATIONS[stationIndex(s)].k
}

export function segmentAt(s: number): Segment {
  return ROUTE_SEGMENTS[STATIONS[stationIndex(s)].segIndex]
}

/** Offset a stretch of the centreline along its left normal. */
function offsetStretch(fromS: number, toS: number, offset: number): Vec2[] {
  const pts: Vec2[] = []
  for (let s = fromS; s <= toS; s += 5) {
    const p = poseAt(s)
    pts.push({
      x: p.x + offset * Math.cos(p.psi + Math.PI / 2),
      y: p.y + offset * Math.sin(p.psi + Math.PI / 2),
    })
  }
  return pts
}

/**
 * The service road: 18 m from Satish Dhawan Road for 250 m. This is the
 * geometry that makes the map-hypothesis panel produce a real split rather
 * than a decorative one.
 */
const SERVICE_ROAD: Segment = {
  id: 'service',
  name: 'DHAWAN SERVICE ROAD',
  points: offsetStretch(INTERSECTION_S, INTERSECTION_S + 250, 18),
  speedLimit: 30 * KMH,
  isRoute: false,
}

/** Cross-road stubs so the 4-way intersection reads visually. */
const CROSS_ROADS: Segment[] = (() => {
  const p = poseAt(INTERSECTION_S)
  const nx = Math.cos(p.psi + Math.PI / 2)
  const ny = Math.sin(p.psi + Math.PI / 2)
  return [
    {
      id: 'cross-a',
      name: 'BHABHA CROSS',
      points: [
        { x: p.x - nx * 90, y: p.y - ny * 90 },
        { x: p.x + nx * 90, y: p.y + ny * 90 },
      ],
      speedLimit: 40 * KMH,
      isRoute: false,
    },
  ]
})()

export const SEGMENTS: Segment[] = [...ROUTE_SEGMENTS, SERVICE_ROAD, ...CROSS_ROADS]

/** Bounding box of everything drawn, for the SVG viewBox. */
export const ROAD_BOUNDS = (() => {
  const all = SEGMENTS.flatMap((s) => s.points)
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
})()
