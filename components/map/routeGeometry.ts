import * as THREE from 'three'

export interface Vec2 {
  x: number
  y: number
}

export interface TubeMaterialOptions {
  blending?: THREE.Blending
  depthTest?: boolean
  depthWrite?: boolean
  fog?: boolean
  renderOrder?: number
  toneMapped?: boolean
}

export interface RibbonMaterialOptions {
  blending?: THREE.Blending
  depthTest?: boolean
  depthWrite?: boolean
  edgePower?: number
  renderOrder?: number
}

/** Parse engine trail strings: " x,y x,y ..." */
export function parseTrailPoints(trail: string, y = 0.15): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const trimmed = trail.trim()
  if (!trimmed) return pts
  for (const pair of trimmed.split(/\s+/)) {
    const [xs, ys] = pair.split(',')
    const x = Number(xs)
    const z = Number(ys)
    if (Number.isFinite(x) && Number.isFinite(z)) {
      pts.push(new THREE.Vector3(x, y, z))
    }
  }
  return pts
}

export function pointsToVec2(points: THREE.Vector3[]): Vec2[] {
  return points.map((p) => ({ x: p.x, y: p.z }))
}

export function shortestAngleDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t
}

export function disposeLine(line: THREE.Line | null) {
  if (!line) return
  line.geometry.dispose()
  if (Array.isArray(line.material)) {
    line.material.forEach((m) => m.dispose())
  } else {
    line.material.dispose()
  }
}

export function updateLinePositions(line: THREE.Line, points: THREE.Vector3[]) {
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute
  if (points.length < 2) {
    line.visible = false
    return
  }
  line.visible = true
  if (!pos || pos.count !== points.length) {
    line.geometry.dispose()
    line.geometry = new THREE.BufferGeometry().setFromPoints(points)
    return
  }
  for (let i = 0; i < points.length; i++) {
    pos.setXYZ(i, points[i].x, points[i].y, points[i].z)
  }
  pos.needsUpdate = true
  line.geometry.computeBoundingSphere()
}

export function buildTubeMesh(
  points: THREE.Vector3[],
  radius: number,
  color: number,
  opacity: number,
  options: TubeMaterialOptions = {}
): THREE.Mesh | null {
  if (points.length < 2) return null
  const curve = new THREE.CatmullRomCurve3(points)
  const tubularSegments = Math.max(points.length * 2, 16)
  const geom = new THREE.TubeGeometry(curve, tubularSegments, radius, 6, false)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: options.blending ?? THREE.NormalBlending,
    depthTest: options.depthTest ?? true,
    depthWrite: options.depthWrite ?? false,
    fog: options.fog ?? true,
    toneMapped: options.toneMapped ?? true,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.renderOrder = options.renderOrder ?? 0
  return mesh
}

export function rebuildTubeMesh(
  mesh: THREE.Mesh | null,
  points: THREE.Vector3[],
  radius: number,
  color: number,
  opacity: number,
  options: TubeMaterialOptions = {}
): THREE.Mesh | null {
  if (mesh) {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }
  return buildTubeMesh(points, radius, color, opacity, options)
}

function ribbonGeometry(points: THREE.Vector3[], width: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const halfWidth = width / 2

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const previous = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const incoming = new THREE.Vector2(point.x - previous.x, point.z - previous.z)
    const outgoing = new THREE.Vector2(next.x - point.x, next.z - point.z)

    if (incoming.lengthSq() === 0) incoming.copy(outgoing)
    if (outgoing.lengthSq() === 0) outgoing.copy(incoming)
    incoming.normalize()
    outgoing.normalize()

    const normalIn = new THREE.Vector2(-incoming.y, incoming.x)
    const normalOut = new THREE.Vector2(-outgoing.y, outgoing.x)
    const miter = normalIn.clone().add(normalOut)
    if (miter.lengthSq() < 0.0001) miter.copy(normalOut)
    miter.normalize()

    const denominator = Math.max(0.42, Math.abs(miter.dot(normalOut)))
    const miterLength = Math.min(halfWidth * 2.2, halfWidth / denominator)
    const offset = miter.multiplyScalar(miterLength)

    positions.push(
      point.x - offset.x,
      point.y,
      point.z - offset.y,
      point.x + offset.x,
      point.y,
      point.z + offset.y
    )
    uvs.push(0, i / (points.length - 1), 1, i / (points.length - 1))
  }

  for (let i = 0; i < points.length - 1; i++) {
    const left = i * 2
    indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

export function buildRibbonMesh(
  points: THREE.Vector3[],
  width: number,
  color: number,
  opacity: number,
  options: RibbonMaterialOptions = {}
): THREE.Mesh | null {
  const geometry = ribbonGeometry(points, width)
  if (!geometry) return null

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uEdgePower: { value: options.edgePower ?? 1.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uEdgePower;
      varying vec2 vUv;
      void main() {
        float center = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float alpha = pow(max(center, 0.0), uEdgePower) * uOpacity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: options.blending ?? THREE.NormalBlending,
    depthTest: options.depthTest ?? true,
    depthWrite: options.depthWrite ?? false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = options.renderOrder ?? 0
  return mesh
}

export function rebuildRibbonMesh(
  mesh: THREE.Mesh | null,
  points: THREE.Vector3[],
  width: number,
  color: number,
  opacity: number,
  options: RibbonMaterialOptions = {}
): THREE.Mesh | null {
  if (mesh) {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }
  return buildRibbonMesh(points, width, color, opacity, options)
}
