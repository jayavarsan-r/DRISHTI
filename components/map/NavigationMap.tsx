'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import {
  CITY_BOUNDS,
  PARKS,
  ROUTE_ROAD_POINTS,
  ROUTE_VISUAL_POINTS,
  SYNTHETIC_ROADS,
  TUNNEL,
  isInsideTunnelMeta,
  type TunnelMeta,
} from '@/components/map/cityVisualConfig'
import { createNavigationPuck } from '@/components/map/NavigationPuck'
import {
  generateProceduralCity,
  type District,
  type ProceduralBuilding,
} from '@/components/map/proceduralCity'
import {
  lerpAngle,
  parseTrailPoints,
  rebuildRibbonMesh,
  rebuildTubeMesh,
  type RibbonMaterialOptions,
  type TubeMaterialOptions,
  updateLinePositions,
} from '@/components/map/routeGeometry'
import {
  buildBlackoutPoints,
  buildGhostSegments,
} from '@/components/map/renderAdapter'
import { useFrame } from '@/components/useEngine'
import type { Snapshot } from '@/lib/sim/types'

const CITY_SEED = 0x44524953
const ROUTE_CLEARANCE = 26
const CAMERA_PITCH_DEG = 58
const CAMERA_DIST_DEFAULT = 145
const CAMERA_DIST_MIN = 72
const CAMERA_DIST_MAX = 260
const MANUAL_PAN_LIMIT = 120
const TUNNEL_HEIGHT = 10

const DISTRICT_COLORS: Record<District, number> = {
  residential: 0x32445d,
  office: 0x2b3b55,
  commercial: 0x3c4258,
  industrial: 0x303944,
  research: 0x294b5c,
}

const ROOF_COLORS: Record<District, number> = {
  residential: 0x637790,
  office: 0x586d8b,
  commercial: 0x747b91,
  industrial: 0x5c6875,
  research: 0x527f91,
}

export interface NavigationMapHandle {
  zoomIn: () => void
  zoomOut: () => void
  recenter: () => void
  setCityVisible: (visible: boolean) => void
}

interface MapRuntime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  cityGroup: THREE.Group
  routeGroup: THREE.Group
  telemetryGroup: THREE.Group
  puck: ReturnType<typeof createNavigationPuck>
  truthLine: THREE.Line
  naiveLine: THREE.Line
  naiveGlow: THREE.Mesh | null
  naiveCore: THREE.Mesh | null
  drishtiGlow: THREE.Mesh | null
  drishtiCore: THREE.Mesh | null
  blackoutMesh: THREE.Mesh | null
  ghostLines: THREE.Line[]
  ellipse: THREE.Mesh
  tunnelMeta: TunnelMeta | null
  hemi: THREE.HemisphereLight
  ambient: THREE.AmbientLight
  sun: THREE.DirectionalLight
  environmentDim: number
  animId: number
  lastTrailVersion: number
  cameraDist: number
  cameraTarget: THREE.Vector3
  cameraBearing: number
  manualOffset: THREE.Vector2
  followMode: boolean
  dragging: boolean
  dragStart: { x: number; y: number; ox: number; oy: number }
  lastTime: number
  cityVisible: boolean
  resizeObs: ResizeObserver | null
}

interface NavigationMapProps {
  cityLayersVisible?: boolean
}

function simToWorld(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(x, height, y)
}

function buildRoadRibbon(
  points: { x: number; y: number }[],
  width: number,
  y: number,
  color: number,
  opacity: number
): THREE.Mesh | null {
  if (points.length < 2) return null
  const verts: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]

    const inDx = p.x - prev.x
    const inDy = p.y - prev.y
    const outDx = next.x - p.x
    const outDy = next.y - p.y
    const inLen = Math.hypot(inDx, inDy)
    const outLen = Math.hypot(outDx, outDy)
    const dirIn =
      inLen > 0 ? { x: inDx / inLen, y: inDy / inLen } : { x: outDx / (outLen || 1), y: outDy / (outLen || 1) }
    const dirOut =
      outLen > 0 ? { x: outDx / outLen, y: outDy / outLen } : dirIn
    const normalIn = { x: -dirIn.y, y: dirIn.x }
    const normalOut = { x: -dirOut.y, y: dirOut.x }
    const sumX = normalIn.x + normalOut.x
    const sumY = normalIn.y + normalOut.y
    const sumLen = Math.hypot(sumX, sumY)
    const miter =
      sumLen > 0.001
        ? { x: sumX / sumLen, y: sumY / sumLen }
        : normalOut
    const denominator = Math.max(0.42, Math.abs(miter.x * normalOut.x + miter.y * normalOut.y))
    const miterLength = Math.min(halfWidth * 2.2, halfWidth / denominator)
    const ox = miter.x * miterLength
    const oy = miter.y * miterLength
    verts.push(p.x - ox, y, p.y - oy, p.x + ox, y, p.y + oy)
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    indices.push(a, b, c, b, d, c)
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity,
    roughness: 0.86,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.receiveShadow = true
  mesh.renderOrder = 1
  return mesh
}

function addInstancedBuildings(
  scene: THREE.Group,
  district: District,
  buildings: ProceduralBuilding[]
): THREE.Group | null {
  if (buildings.length === 0) return null
  const group = new THREE.Group()
  const wallGeom = new THREE.BoxGeometry(1, 1, 1)
  const wallMat = new THREE.MeshStandardMaterial({
    color: DISTRICT_COLORS[district],
    emissive: DISTRICT_COLORS[district],
    emissiveIntensity: 0.16,
    roughness: 0.72,
    metalness: 0.1,
    flatShading: true,
  })
  wallMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
       totalEmissiveRadiance += vec3(0.07, 0.10, 0.14) * rim;`
    )
  }
  wallMat.customProgramCacheKey = () => 'drishti-building-rim-v1'

  const roofGeom = new THREE.BoxGeometry(1, 1, 1)
  const roofMat = new THREE.MeshStandardMaterial({
    color: ROOF_COLORS[district],
    emissive: ROOF_COLORS[district],
    emissiveIntensity: 0.12,
    roughness: 0.68,
    metalness: 0.08,
  })
  const walls = new THREE.InstancedMesh(wallGeom, wallMat, buildings.length)
  const roofs = new THREE.InstancedMesh(roofGeom, roofMat, buildings.length)
  walls.castShadow = true
  walls.receiveShadow = true
  roofs.castShadow = true
  roofs.receiveShadow = true

  const matrix = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()

  buildings.forEach((b, i) => {
    pos.set(b.x + b.width / 2, b.height / 2, b.z + b.depth / 2)
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotation)
    scale.set(b.width, b.height, b.depth)
    matrix.compose(pos, quat, scale)
    walls.setMatrixAt(i, matrix)

    pos.set(b.x + b.width / 2, b.height + 0.16, b.z + b.depth / 2)
    scale.set(b.width * 0.94, 0.32, b.depth * 0.94)
    matrix.compose(pos, quat, scale)
    roofs.setMatrixAt(i, matrix)
  })
  walls.instanceMatrix.needsUpdate = true
  roofs.instanceMatrix.needsUpdate = true
  group.add(walls, roofs)
  scene.add(group)
  return group
}

function buildParkMesh(park: { x: number; y: number; width: number; height: number }): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(park.width, park.height)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a3024,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(park.x + park.width / 2, 0.06, park.y + park.height / 2)
  mesh.receiveShadow = true
  return mesh
}

function buildTunnelMesh(meta: TunnelMeta | null): THREE.Group {
  const group = new THREE.Group()
  if (!meta || meta.centerline.length < 2) return group

  const shellThickness = 1.6
  const innerHalfWidth = Math.max(meta.halfWidth, 13.5)
  const sideHeight = Math.max(6.2, TUNNEL_HEIGHT * 0.62)
  const roofRise = Math.max(7.4, innerHalfWidth * 0.56)
  const archSegments = 14

  type ProfilePoint = { x: number; y: number }
  const makeProfile = (halfWidth: number, rise: number, outer: boolean): ProfilePoint[] => {
    const profile: ProfilePoint[] = [{ x: -halfWidth, y: 0 }]
    for (let i = 0; i <= archSegments; i++) {
      const angle = Math.PI - (i / archSegments) * Math.PI
      profile.push({
        x: Math.cos(angle) * halfWidth,
        y: sideHeight + Math.sin(angle) * rise + (outer ? shellThickness * 0.35 : 0),
      })
    }
    profile.push({ x: halfWidth, y: 0 })
    return profile
  }

  const innerProfile = makeProfile(innerHalfWidth, roofRise, false)
  const outerProfile = makeProfile(
    innerHalfWidth + shellThickness,
    roofRise + shellThickness,
    true
  )
  const profileSize = innerProfile.length
  const ringCount = meta.centerline.length
  const shellPositions: number[] = []
  const shellIndices: number[] = []

  const worldProfileVertex = (
    routeIndex: number,
    profilePoint: ProfilePoint,
    longitudinalOffset = 0
  ): [number, number, number] => {
    const point = meta.centerline[routeIndex]
    const prev = meta.centerline[Math.max(0, routeIndex - 1)]
    const next = meta.centerline[Math.min(ringCount - 1, routeIndex + 1)]
    const dx = next.x - prev.x
    const dz = next.y - prev.y
    const tangentLength = Math.hypot(dx, dz) || 1
    const tx = dx / tangentLength
    const tz = dz / tangentLength
    const nx = -tz
    const nz = tx
    return [
      point.x + nx * profilePoint.x + tx * longitudinalOffset,
      profilePoint.y,
      point.y + nz * profilePoint.x + tz * longitudinalOffset,
    ]
  }

  for (let routeIndex = 0; routeIndex < ringCount; routeIndex++) {
    outerProfile.forEach((profilePoint) => {
      shellPositions.push(...worldProfileVertex(routeIndex, profilePoint))
    })
  }
  const innerVertexOffset = shellPositions.length / 3
  for (let routeIndex = 0; routeIndex < ringCount; routeIndex++) {
    innerProfile.forEach((profilePoint) => {
      shellPositions.push(...worldProfileVertex(routeIndex, profilePoint))
    })
  }

  for (let routeIndex = 0; routeIndex < ringCount - 1; routeIndex++) {
    for (let profileIndex = 0; profileIndex < profileSize - 1; profileIndex++) {
      const outerA = routeIndex * profileSize + profileIndex
      const outerB = (routeIndex + 1) * profileSize + profileIndex
      const outerC = outerA + 1
      const outerD = outerB + 1
      shellIndices.push(outerA, outerB, outerC, outerB, outerD, outerC)

      const innerA = innerVertexOffset + outerA
      const innerB = innerVertexOffset + outerB
      const innerC = innerVertexOffset + outerC
      const innerD = innerVertexOffset + outerD
      shellIndices.push(innerA, innerC, innerB, innerB, innerC, innerD)
    }
  }

  for (const profileIndex of [0, profileSize - 1]) {
    for (let routeIndex = 0; routeIndex < ringCount - 1; routeIndex++) {
      const outerA = routeIndex * profileSize + profileIndex
      const outerB = (routeIndex + 1) * profileSize + profileIndex
      const innerA = innerVertexOffset + outerA
      const innerB = innerVertexOffset + outerB
      shellIndices.push(outerA, innerA, outerB, outerB, innerA, innerB)
    }
  }

  const shellGeometry = new THREE.BufferGeometry()
  shellGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(shellPositions, 3)
  )
  shellGeometry.setIndex(shellIndices)
  shellGeometry.computeVertexNormals()
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: DISTRICT_COLORS.office,
    emissive: DISTRICT_COLORS.office,
    emissiveIntensity: 0.16,
    roughness: 0.82,
    metalness: 0.12,
    side: THREE.DoubleSide,
    depthWrite: true,
  })
  const shell = new THREE.Mesh(shellGeometry, shellMaterial)
  shell.castShadow = true
  shell.receiveShadow = true
  shell.renderOrder = 9
  group.add(shell)

  const floor = buildRoadRibbon(
    meta.centerline,
    innerHalfWidth * 2,
    0.13,
    0x070b11,
    1
  )
  if (floor) {
    floor.renderOrder = 3
    group.add(floor)
  }

  const portalPositions: number[] = []
  const portalIndices: number[] = []
  for (const routeIndex of [0, ringCount - 1]) {
    const portalStart = portalPositions.length / 3
    outerProfile.forEach((point) => {
      portalPositions.push(
        ...worldProfileVertex(routeIndex, point, routeIndex === 0 ? -0.08 : 0.08)
      )
    })
    innerProfile.forEach((point) => {
      portalPositions.push(
        ...worldProfileVertex(routeIndex, point, routeIndex === 0 ? -0.08 : 0.08)
      )
    })
    for (let profileIndex = 0; profileIndex < profileSize - 1; profileIndex++) {
      const outerA = portalStart + profileIndex
      const outerB = outerA + 1
      const innerA = portalStart + profileSize + profileIndex
      const innerB = innerA + 1
      portalIndices.push(outerA, outerB, innerA, outerB, innerB, innerA)
    }
  }
  const portalGeometry = new THREE.BufferGeometry()
  portalGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(portalPositions, 3)
  )
  portalGeometry.setIndex(portalIndices)
  portalGeometry.computeVertexNormals()
  const portalMat = new THREE.MeshStandardMaterial({
    color: ROOF_COLORS.office,
    emissive: ROOF_COLORS.office,
    emissiveIntensity: 0.12,
    roughness: 0.66,
    metalness: 0.18,
    side: THREE.DoubleSide,
    depthWrite: true,
  })
  const portals = new THREE.Mesh(portalGeometry, portalMat)
  portals.castShadow = true
  portals.receiveShadow = true
  portals.renderOrder = 16
  group.add(portals)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const lightStep = Math.max(8, Math.ceil(ringCount / 12))
  const lightIndices = meta.centerline
    .map((_, index) => index)
    .filter((index) => index % lightStep === Math.floor(lightStep / 2) && index < ringCount - 1)
  if (lightIndices.length > 0) {
    const lightGeom = new THREE.BoxGeometry(1, 1, 1)
    const lightMat = new THREE.MeshBasicMaterial({
      color: 0x7ddfff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    const lights = new THREE.InstancedMesh(lightGeom, lightMat, lightIndices.length * 2)
    lightIndices.forEach((pointIndex, i) => {
      const p = meta.centerline[pointIndex]
      const next = meta.centerline[pointIndex + 1]
      const psi = Math.atan2(next.y - p.y, next.x - p.x)
      const nx = -Math.sin(psi)
      const nz = Math.cos(psi)
      rotation.setFromAxisAngle(up, Math.PI / 2 - psi)
      for (const side of [-1, 1] as const) {
        const across = innerHalfWidth * 0.38 * side
        const ceilingY =
          sideHeight +
          roofRise * Math.sqrt(Math.max(0, 1 - (across * across) / (innerHalfWidth * innerHalfWidth)))
        position.set(p.x + nx * across, ceilingY - 0.38, p.y + nz * across)
        scale.set(0.72, 0.16, 2.6)
        matrix.compose(position, rotation, scale)
        lights.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), matrix)
      }
    })
    lights.instanceMatrix.needsUpdate = true
    lights.renderOrder = 17
    group.add(lights)

    lightIndices
      .filter((_, index) => index % 2 === 0)
      .forEach((pointIndex) => {
        const p = meta.centerline[pointIndex]
        const interiorLight = new THREE.PointLight(0x69dfff, 3.2, 22, 2)
        interiorLight.position.set(p.x, sideHeight + roofRise - 1.6, p.y)
        group.add(interiorLight)
      })
  }

  return group
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return
    child.geometry.dispose()
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose())
    } else {
      child.material.dispose()
    }
  })
}

function replaceTube(
  group: THREE.Group,
  current: THREE.Mesh | null,
  points: THREE.Vector3[],
  radius: number,
  color: number,
  opacity: number,
  options: TubeMaterialOptions = {}
): THREE.Mesh | null {
  if (current) group.remove(current)
  const mesh = rebuildTubeMesh(current, points, radius, color, opacity, options)
  if (mesh) group.add(mesh)
  return mesh
}

function replaceRibbon(
  group: THREE.Group,
  current: THREE.Mesh | null,
  points: THREE.Vector3[],
  width: number,
  color: number,
  opacity: number,
  options: RibbonMaterialOptions = {}
): THREE.Mesh | null {
  if (current) group.remove(current)
  const mesh = rebuildRibbonMesh(current, points, width, color, opacity, options)
  if (mesh) group.add(mesh)
  return mesh
}

function makeLine(
  color: number,
  opacity = 1,
  options: {
    blending?: THREE.Blending
    depthTest?: boolean
    fog?: boolean
    renderOrder?: number
    toneMapped?: boolean
  } = {}
): THREE.Line {
  const geom = new THREE.BufferGeometry()
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1 || options.blending === THREE.AdditiveBlending,
    opacity,
    blending: options.blending ?? THREE.NormalBlending,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    fog: options.fog ?? true,
    toneMapped: options.toneMapped ?? true,
  })
  const line = new THREE.Line(geom, mat)
  line.renderOrder = options.renderOrder ?? 0
  return line
}

export const NavigationMap = forwardRef<NavigationMapHandle, NavigationMapProps>(
  function NavigationMap({ cityLayersVisible = true }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [webglError, setWebglError] = useState(false)
    const [dragging, setDragging] = useState(false)

    const runtimeRef = useRef<MapRuntime | null>(null)

    const cityData = useMemo(
      () =>
        generateProceduralCity({
          seed: CITY_SEED,
          bounds: CITY_BOUNDS,
          routeCenterline: ROUTE_VISUAL_POINTS,
          roads: SYNTHETIC_ROADS,
          parks: PARKS,
          routeClearance: ROUTE_CLEARANCE,
        }),
      []
    )

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.cameraDist = Math.max(CAMERA_DIST_MIN, rt.cameraDist - 18)
      },
      zoomOut: () => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.cameraDist = Math.min(CAMERA_DIST_MAX, rt.cameraDist + 18)
      },
      recenter: () => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.manualOffset.set(0, 0)
        rt.followMode = true
        rt.cameraDist = CAMERA_DIST_DEFAULT
      },
      setCityVisible: (visible: boolean) => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.cityVisible = visible
        rt.cityGroup.visible = visible
      },
    }))

    useEffect(() => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      let renderer: THREE.WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        })
      } catch {
        setWebglError(true)
        return
      }

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x030608)
      scene.fog = new THREE.FogExp2(0x030608, 0.0018)

      const camera = new THREE.PerspectiveCamera(52, 1, 1, 2500)
      const cityGroup = new THREE.Group()
      const routeGroup = new THREE.Group()
      const telemetryGroup = new THREE.Group()

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(
          CITY_BOUNDS.maxX - CITY_BOUNDS.minX + 400,
          CITY_BOUNDS.maxY - CITY_BOUNDS.minY + 400
        ),
        new THREE.MeshStandardMaterial({ color: 0x060a10, roughness: 1, metalness: 0 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.set(
        (CITY_BOUNDS.minX + CITY_BOUNDS.maxX) / 2,
        0,
        (CITY_BOUNDS.minY + CITY_BOUNDS.maxY) / 2
      )
      ground.receiveShadow = true
      cityGroup.add(ground)

      for (const park of cityData.parks) {
        cityGroup.add(buildParkMesh(park))
      }

      // The active road is the authoritative route centerline. Decorative
      // SYNTHETIC_ROADS remain city-generation input but are intentionally not rendered.
      const routeRoad = buildRoadRibbon(ROUTE_ROAD_POINTS, 16, 0.12, 0x26384c, 1)
      if (routeRoad) cityGroup.add(routeRoad)
      const routeCenter = buildRoadRibbon(ROUTE_ROAD_POINTS, 0.65, 0.18, 0x91a1b3, 0.42)
      if (routeCenter) {
        routeCenter.renderOrder = 2
        cityGroup.add(routeCenter)
      }

      const byDistrict = new Map<District, ProceduralBuilding[]>()
      for (const b of cityData.buildings) {
        const list = byDistrict.get(b.district) ?? []
        list.push(b)
        byDistrict.set(b.district, list)
      }
      for (const [district, list] of byDistrict) {
        addInstancedBuildings(cityGroup, district, list)
      }

      const tunnel = buildTunnelMesh(TUNNEL)
      cityGroup.add(tunnel)

      const truthLine = makeLine(0x32d779, 0.65, {
        depthTest: false,
        fog: false,
        renderOrder: 20,
      })
      const naiveLine = makeLine(0xff4968, 0.95, {
        depthTest: false,
        fog: false,
        renderOrder: 21,
        toneMapped: false,
      })
      routeGroup.add(truthLine, naiveLine)

      const puck = createNavigationPuck()
      scene.add(cityGroup, routeGroup, telemetryGroup, puck.group)

      const ellipseGeom = new THREE.CircleGeometry(1, 48)
      const ellipseMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const ellipse = new THREE.Mesh(ellipseGeom, ellipseMat)
      ellipse.rotation.x = -Math.PI / 2
      ellipse.position.y = 0.1
      telemetryGroup.add(ellipse)

      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.18
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      const hemi = new THREE.HemisphereLight(0x91b6d8, 0x111820, 0.86)
      scene.add(hemi)
      const ambient = new THREE.AmbientLight(0x5b7189, 0.5)
      scene.add(ambient)
      const sun = new THREE.DirectionalLight(0xd7e8fa, 1.25)
      sun.position.set(180, 320, -120)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.near = 10
      sun.shadow.camera.far = 900
      const shadowSpan = 420
      sun.shadow.camera.left = -shadowSpan
      sun.shadow.camera.right = shadowSpan
      sun.shadow.camera.top = shadowSpan
      sun.shadow.camera.bottom = -shadowSpan
      scene.add(sun)

      const resize = () => {
        const w = container.clientWidth
        const h = container.clientHeight
        if (w === 0 || h === 0) return
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      resize()
      const resizeObs = new ResizeObserver(resize)
      resizeObs.observe(container)

      runtimeRef.current = {
        renderer,
        scene,
        camera,
        cityGroup,
        routeGroup,
        telemetryGroup,
        puck,
        truthLine,
        naiveLine,
        naiveGlow: null,
        naiveCore: null,
        drishtiGlow: null,
        drishtiCore: null,
        blackoutMesh: null,
        ghostLines: [],
        ellipse,
        tunnelMeta: TUNNEL,
        hemi,
        ambient,
        sun,
        environmentDim: 1,
        animId: 0,
        lastTrailVersion: -1,
        cameraDist: CAMERA_DIST_DEFAULT,
        cameraTarget: new THREE.Vector3(),
        cameraBearing: 0,
        manualOffset: new THREE.Vector2(),
        followMode: true,
        dragging: false,
        dragStart: { x: 0, y: 0, ox: 0, oy: 0 },
        lastTime: performance.now(),
        cityVisible: cityLayersVisible,
        resizeObs,
      }

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        const rt = runtimeRef.current
        if (!rt) return
        rt.dragging = true
        setDragging(true)
        rt.followMode = false
        rt.dragStart = { x: e.clientX, y: e.clientY, ox: rt.manualOffset.x, oy: rt.manualOffset.y }
        container.setPointerCapture(e.pointerId)
      }
      const onPointerMove = (e: PointerEvent) => {
        const rt = runtimeRef.current
        if (!rt || !rt.dragging) return
        const dx = e.clientX - rt.dragStart.x
        const dy = e.clientY - rt.dragStart.y
        const scale = 0.35
        rt.manualOffset.x = Math.max(
          -MANUAL_PAN_LIMIT,
          Math.min(MANUAL_PAN_LIMIT, rt.dragStart.ox - dx * scale)
        )
        rt.manualOffset.y = Math.max(
          -MANUAL_PAN_LIMIT,
          Math.min(MANUAL_PAN_LIMIT, rt.dragStart.oy + dy * scale)
        )
      }
      const onPointerUp = (e: PointerEvent) => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.dragging = false
        setDragging(false)
        container.releasePointerCapture(e.pointerId)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rt = runtimeRef.current
        if (!rt) return
        const delta = e.deltaY > 0 ? 14 : -14
        rt.cameraDist = Math.max(CAMERA_DIST_MIN, Math.min(CAMERA_DIST_MAX, rt.cameraDist + delta))
      }

      container.addEventListener('pointerdown', onPointerDown)
      container.addEventListener('pointermove', onPointerMove)
      container.addEventListener('pointerup', onPointerUp)
      container.addEventListener('pointerleave', onPointerUp)
      container.addEventListener('wheel', onWheel, { passive: false })

      const tick = (time: number) => {
        const rt = runtimeRef.current
        if (!rt) return
        rt.lastTime = time
        renderer.render(scene, camera)
        rt.animId = requestAnimationFrame(tick)
      }
      runtimeRef.current.animId = requestAnimationFrame(tick)

      return () => {
        cancelAnimationFrame(runtimeRef.current?.animId ?? 0)
        resizeObs.disconnect()
        container.removeEventListener('pointerdown', onPointerDown)
        container.removeEventListener('pointermove', onPointerMove)
        container.removeEventListener('pointerup', onPointerUp)
        container.removeEventListener('pointerleave', onPointerUp)
        container.removeEventListener('wheel', onWheel)
        disposeGroup(cityGroup)
        disposeGroup(routeGroup)
        disposeGroup(telemetryGroup)
        puck.dispose()
        renderer.dispose()
        runtimeRef.current = null
      }
    }, [cityData])

    useEffect(() => {
      const rt = runtimeRef.current
      if (!rt) return
      rt.cityVisible = cityLayersVisible
      rt.cityGroup.visible = cityLayersVisible
    }, [cityLayersVisible])

    useFrame((engine) => {
      const rt = runtimeRef.current
      if (!rt) return

      const trails = engine.trails
      if (trails.version !== rt.lastTrailVersion) {
        rt.lastTrailVersion = trails.version
        const truthPts = parseTrailPoints(trails.truth, 0.28)
        const naivePts = parseTrailPoints(trails.naive, 0.72)
        const drishtiPts = parseTrailPoints(trails.drishti, 0.22)
        updateLinePositions(rt.truthLine, truthPts)
        updateLinePositions(rt.naiveLine, naivePts)
        rt.naiveGlow = replaceTube(
          rt.routeGroup,
          rt.naiveGlow,
          naivePts,
          0.55,
          0xf43f5e,
          0.16,
          {
            blending: THREE.AdditiveBlending,
            depthTest: false,
            fog: false,
            renderOrder: 21,
            toneMapped: false,
          }
        )
        rt.naiveCore = replaceTube(
          rt.routeGroup,
          rt.naiveCore,
          naivePts,
          0.27,
          0xf43f5e,
          0.9,
          {
            blending: THREE.NormalBlending,
            depthTest: false,
            fog: false,
            renderOrder: 22,
            toneMapped: false,
          }
        )
        rt.drishtiGlow = replaceRibbon(
          rt.routeGroup,
          rt.drishtiGlow,
          drishtiPts,
          11,
          0x00d9ff,
          0.3,
          {
            blending: THREE.AdditiveBlending,
            depthTest: true,
            renderOrder: 24,
            edgePower: 2.7,
          }
        )
        rt.drishtiCore = replaceRibbon(
          rt.routeGroup,
          rt.drishtiCore,
          drishtiPts,
          5.2,
          0x00d9ff,
          0.96,
          {
            blending: THREE.NormalBlending,
            depthTest: true,
            renderOrder: 25,
            edgePower: 0.42,
          }
        )
      }

      const s = engine.getSnapshot()
      updateTelemetry(rt, s)

      const insideTunnel =
        s.navState === 'DR_ACTIVE' &&
        rt.tunnelMeta !== null &&
        isInsideTunnelMeta(rt.tunnelMeta, s.drishti.x, s.drishti.y)
      const tunnelDim = insideTunnel ? 0.42 : 1
      const speed = s.drishti.v
      rt.puck.update(
        {
          x: s.drishti.x,
          z: s.drishti.y,
          psi: s.drishti.psi,
          moving: speed > 0.4,
          tunnelDim,
        },
        1 / 60,
        performance.now() / 1000
      )

      updateEnvironment(rt, insideTunnel)
      updateChaseCamera(rt, s)
    })

    return (
      <div
        ref={containerRef}
        className="navigation-map-host"
        style={{
          position: 'absolute',
          inset: 0,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <canvas ref={canvasRef} className="navigation-map-canvas" style={{ display: 'block', width: '100%', height: '100%' }} />
        {webglError && (
          <div className="navigation-map-fallback">
            WebGL unavailable — map rendering paused.
          </div>
        )}
      </div>
    )
  }
)

function updateTelemetry(rt: MapRuntime, snap: Snapshot) {
  const blackoutPts = buildBlackoutPoints(snap).map((p) => simToWorld(p.x, p.y, 0.72))
  if (blackoutPts.length >= 2) {
    rt.blackoutMesh = replaceTube(
      rt.telemetryGroup,
      rt.blackoutMesh,
      blackoutPts,
      0.55,
      0xef4444,
      0.28,
      {
        blending: THREE.AdditiveBlending,
        depthTest: false,
        fog: false,
        renderOrder: 18,
      }
    )
  } else if (rt.blackoutMesh) {
    rt.telemetryGroup.remove(rt.blackoutMesh)
    rt.blackoutMesh.geometry.dispose()
    ;(rt.blackoutMesh.material as THREE.Material).dispose()
    rt.blackoutMesh = null
  }

  for (const line of rt.ghostLines) {
    rt.telemetryGroup.remove(line)
    line.geometry.dispose()
    ;(line.material as THREE.Material).dispose()
  }
  rt.ghostLines = []
  for (const ghost of buildGhostSegments(snap)) {
    const pts = ghost.points.map((p) => simToWorld(p.x, p.y, 0.17))
    const line = makeLine(0x38bdf8, ghost.opacity)
    updateLinePositions(line, pts)
    rt.telemetryGroup.add(line)
    rt.ghostLines.push(line)
  }

  const insideTunnel =
    rt.tunnelMeta !== null &&
    isInsideTunnelMeta(rt.tunnelMeta, snap.drishti.x, snap.drishti.y)
  rt.ellipse.scale.set(2 * snap.uncertainty.sigmaAlong, 2 * snap.uncertainty.sigmaCross, 1)
  rt.ellipse.position.set(snap.drishti.x, 0.11, snap.drishti.y)
  rt.ellipse.rotation.set(-Math.PI / 2, -snap.drishti.psi, 0)
  ;(rt.ellipse.material as THREE.MeshBasicMaterial).opacity = insideTunnel ? 0.08 : 0.12
}

function updateEnvironment(rt: MapRuntime, insideTunnel: boolean) {
  const target = insideTunnel ? 0.38 : 1
  rt.environmentDim += (target - rt.environmentDim) * 0.075
  rt.hemi.intensity = 0.86 * (0.3 + rt.environmentDim * 0.7)
  rt.ambient.intensity = 0.5 * (0.34 + rt.environmentDim * 0.66)
  rt.sun.intensity = 1.25 * (0.12 + rt.environmentDim * 0.88)
  rt.renderer.toneMappingExposure = 0.72 + 0.46 * rt.environmentDim
}

function updateChaseCamera(rt: MapRuntime, snap: Snapshot) {
  const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180
  const targetX = snap.drishti.x + rt.manualOffset.x
  const targetZ = snap.drishti.y + rt.manualOffset.y

  const t = 0.08
  rt.cameraTarget.x += (targetX - rt.cameraTarget.x) * t
  rt.cameraTarget.z += (targetZ - rt.cameraTarget.z) * t
  rt.cameraBearing = lerpAngle(rt.cameraBearing, snap.drishti.psi, t)

  const curveBoost = Math.min(28, Math.abs(snap.truth.omega) * 18)
  const dist = rt.cameraDist + curveBoost

  const behindX = -Math.cos(rt.cameraBearing) * dist * Math.cos(pitch)
  const behindZ = -Math.sin(rt.cameraBearing) * dist * Math.cos(pitch)
  const camY = dist * Math.sin(pitch)

  rt.camera.position.set(rt.cameraTarget.x + behindX, camY, rt.cameraTarget.z + behindZ)
  rt.camera.lookAt(rt.cameraTarget.x, 0, rt.cameraTarget.z)
}
