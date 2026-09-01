/**
 * Frontend-only visual city layout — presentation objects, not simulation geometry.
 * Anchored to route via read-only imports from lib/sim/road.
 */

import { poseAt, ROUTE_LENGTH } from '@/lib/sim/road'
import { CITY_BOUNDS, generateCity } from './cityGenerator'

export type BuildingType =
  | 'house'
  | 'office'
  | 'mall'
  | 'warehouse'
  | 'hospital'
  | 'hotel'
  | 'parking'
  | 'terminal'
  | 'station'
  | 'research'

export interface BuildingDef {
  id: string
  type: BuildingType
  label?: string
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation: number
  isLandmark?: boolean
  isFacade?: boolean
}

export interface SyntheticRoad {
  id: string
  name: string
  points: { x: number; y: number }[]
  tier: 'major' | 'secondary' | 'minor'
}

export interface LandmarkLabel {
  id: string
  name: string
  x: number
  y: number
  tier: 'major' | 'minor'
}

export interface ParkBlock {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface TunnelMeta {
  centerline: { x: number; y: number }[]
  leftWall: { x: number; y: number }[]
  rightWall: { x: number; y: number }[]
  entrance: { x: number; y: number; psi: number }
  exit: { x: number; y: number; psi: number }
  fromS: number
  toS: number
  halfWidth: number
}

const TUNNEL_FROM_S = 285
const TUNNEL_TO_S = 515
const TUNNEL_HALF_WIDTH = 14

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

export function buildTunnelMeta(
  fromS: number,
  toS: number,
  halfWidth = TUNNEL_HALF_WIDTH
): TunnelMeta {
  const centerline: { x: number; y: number }[] = []
  for (let s = fromS; s < toS; s += 2) {
    const p = poseAt(s)
    centerline.push({ x: p.x, y: p.y })
  }
  const centerEnd = poseAt(toS)
  centerline.push({ x: centerEnd.x, y: centerEnd.y })

  const leftWall: { x: number; y: number }[] = []
  const rightWall: { x: number; y: number }[] = []
  for (let s = fromS; s < toS; s += 4) {
    const p = poseAt(s)
    leftWall.push(offsetPoint(p.x, p.y, p.psi, halfWidth))
    rightWall.push(offsetPoint(p.x, p.y, p.psi, -halfWidth))
  }
  const wallEnd = poseAt(toS)
  leftWall.push(offsetPoint(wallEnd.x, wallEnd.y, wallEnd.psi, halfWidth))
  rightWall.push(offsetPoint(wallEnd.x, wallEnd.y, wallEnd.psi, -halfWidth))

  const entrancePose = poseAt(fromS)
  const exitPose = poseAt(toS)

  return {
    centerline,
    leftWall,
    rightWall,
    entrance: { x: entrancePose.x, y: entrancePose.y, psi: entrancePose.psi },
    exit: { x: exitPose.x, y: exitPose.y, psi: exitPose.psi },
    fromS,
    toS,
    halfWidth,
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

function distToCenterlinePolyline(
  x: number,
  y: number,
  centerline: { x: number; y: number }[]
): number {
  let min = Infinity
  for (let i = 1; i < centerline.length; i++) {
    const d = distToSegment(
      x,
      y,
      centerline[i - 1].x,
      centerline[i - 1].y,
      centerline[i].x,
      centerline[i].y
    )
    if (d < min) min = d
  }
  return min
}

export const TUNNEL = buildTunnelMeta(TUNNEL_FROM_S, TUNNEL_TO_S)

function sampleRouteCenterline(step: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let s = 0; s < ROUTE_LENGTH; s += step) {
    const p = poseAt(s)
    pts.push({ x: p.x, y: p.y })
  }
  const end = poseAt(ROUTE_LENGTH)
  pts.push({ x: end.x, y: end.y })
  return pts
}

/** Full-route samples for deterministic city placement. */
export const ROUTE_VISUAL_POINTS = sampleRouteCenterline(12)

/** Denser samples used only by the Three.js driven-road ribbon. */
export const ROUTE_ROAD_POINTS = sampleRouteCenterline(3)

export function isInsideTunnel(x: number, y: number): boolean {
  return distToCenterlinePolyline(x, y, TUNNEL.centerline) <= TUNNEL.halfWidth + 2
}

export function isInsideTunnelMeta(
  tunnel: TunnelMeta,
  x: number,
  y: number
): boolean {
  return distToCenterlinePolyline(x, y, tunnel.centerline) <= tunnel.halfWidth + 2
}

const city = generateCity()

export const BUILDINGS = city.buildings
export const SYNTHETIC_ROADS = city.syntheticRoads
export const LANDMARKS = city.landmarks
export const PARKS = city.parks

export { CITY_BOUNDS }
